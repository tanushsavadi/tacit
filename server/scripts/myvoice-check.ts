// My Voice end-to-end check against a RUNNING server (product path, real voices, real virtual mic):
//   registry → refusals → select (persisted) → [private preview on the Mac speakers] → typed speech in the chosen voice,
//   captured at the virtual mic input → stale-revision refusal → voice change while queued → Stop latency → latency runs
//   per voice → restore the previous selection and turn output off.
// Never claims remote audibility. Refuses if a calling app is reading the virtual mic (unless --force).
//   TACIT_URL=ws://127.0.0.1:8799 npm run myvoice:check [-- --preview --runs 5 --force]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WebSocket } from 'ws';
import type { ServerMessage, SpeechDelivery, SpeechOutputStatus, VoicePreviewState, VoiceStatus } from '../../shared/protocol.ts';
import { routeBinary } from '../src/route.ts';
import { secrets } from './secrets.ts';

const run = promisify(execFile);
const base = process.env.TACIT_URL ?? 'ws://127.0.0.1:8790';
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const runs = Number(arg('--runs')) || 4;
const force = process.argv.includes('--force');
const doPreview = process.argv.includes('--preview');
let failures = 0;
const check = (ok: boolean, what: string, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++; };
const die = (m: string): never => { console.error(`MY VOICE CHECK FAILED: ${m}`); process.exit(1); };
const bin = routeBinary() ?? die('tacit-route not built');

const ws = new WebSocket(`${base}/ws?token=${secrets.userToken}`);
let out: SpeechOutputStatus | null = null;
let voice: VoiceStatus | null = null;
const waiters: ((m: ServerMessage) => void)[] = [];
ws.on('message', (d) => {
  const m = JSON.parse(String(d)) as ServerMessage;
  if (m.type === 'output_status') out = m.status;
  if (m.type === 'voice_status') voice = m.status;
  for (const w of [...waiters]) w(m);
});
const next = <T>(pred: (m: ServerMessage) => T | undefined, ms = 20_000) => new Promise<T>((resolve, reject) => {
  const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error('timeout')); }, ms);
  const w = (m: ServerMessage) => { const v = pred(m); if (v !== undefined) { clearTimeout(t); waiters.splice(waiters.indexOf(w), 1); resolve(v); } };
  waiters.push(w);
});
const send = (o: object) => ws.send(JSON.stringify(o));
const terminal = (id: string) => next((m) => m.type === 'speech_delivery' && m.delivery.requestId === id && ['rendered', 'refused', 'interrupted', 'failed'].includes(m.delivery.state) ? m.delivery : undefined, 30_000);
const delivery = (id: string, state: SpeechDelivery['state']) => next((m) => m.type === 'speech_delivery' && m.delivery.requestId === id && m.delivery.state === state ? m.delivery : undefined, 30_000);
const selectResult = (requestId: string) => next((m) => m.type === 'voice_status' && m.status.lastChange?.requestId === requestId ? m.status : undefined);
const listen = (uid: string, s: number) => run(bin, ['listen', '--device-uid', uid, '--seconds', String(s)], { timeout: (s + 5) * 1000 })
  .then(({ stdout }) => JSON.parse(stdout.trim().split('\n').at(-1)!) as { firstLoudAt?: number; lastLoudAt?: number; loudMs: number; peak: number });
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

await new Promise((r) => ws.once('open', r));
await next((m) => (m.type === 'voice_status' ? true : undefined));
for (let i = 0; i < 40 && voice!.engine.state === 'starting'; i++) await next((m) => (m.type === 'voice_status' ? true : undefined), 1000).catch(() => undefined);
const v0 = voice!;
const original = v0.selected.source === 'default' ? null : { voiceId: v0.selected.voiceId, rate: v0.selected.rate, pitch: v0.selected.pitch };

// ── registry ──
const apple = v0.voices.filter((v) => v.provider === 'apple-speech');
check(v0.engine.state === 'ready', 'voice engine ready', `${v0.engine.state}${v0.engine.reason ? ` (${v0.engine.reason})` : ''}`);
check(apple.length > 0 && apple.every((v) => v.id === `apple:${v.id.slice(6)}` && v.locale && v.name), 'installed voices enumerated with stable ids',
  `${apple.length} Apple voices, ${apple.filter((v) => v.novelty).length} novelty, ${new Set(apple.map((v) => v.language)).size} languages`);
check(v0.voices.some((v) => v.id === 'system:default'), 'system default voice always offered');
check(!JSON.stringify(v0.voices).match(/gender|female|\bmale\b/i), 'no gender/personality attributes in the registry');
check(v0.applePersonalVoice.usableInCalls === false, 'Apple Personal Voice reported as not usable in calls', `authorization=${v0.applePersonalVoice.authorization}`);
console.log(`      effective now: ${v0.effective.label} (rev ${v0.revision}); selected source ${v0.selected.source}`);

// ── refusals ──
send({ type: 'voice_select', requestId: 'bad-voice', voiceId: 'apple:com.example.not-installed' });
check(!(await selectResult('bad-voice')).lastChange!.ok, 'unknown voice refused');
const en = apple.filter((v) => v.language === 'en' && !v.novelty && v.available);
const a = en.find((v) => v.id.endsWith('.Samantha')) ?? en[0] ?? die('no English voice');
const b = en.find((v) => v.id !== a.id && v.id.includes('eloquence') && v.locale !== a.locale) ?? en.find((v) => v.id !== a.id)!;
send({ type: 'voice_select', requestId: 'bad-rate', voiceId: a.id, rate: 0.99 });
check(!(await selectResult('bad-rate')).lastChange!.ok, 'out-of-range rate refused');

// ── select (persisted) ──
send({ type: 'voice_select', requestId: 'sel-b', voiceId: b.id, rate: 0.5, pitch: 1.0 });
const sb = await selectResult('sel-b');
check(sb.lastChange!.ok && sb.effective.voiceId === b.id && sb.persisted, 'selection applied and persisted', `${sb.effective.label}, rev ${v0.revision} → ${sb.revision}`);

// ── private preview ──
if (doPreview) {
  send({ type: 'voice_preview', previewId: `pv-${Date.now()}`, voiceId: a.id, sample: 0 });
  const p: VoicePreviewState = await next((m) => (m.type === 'voice_preview' && ['done', 'refused', 'failed', 'stopped'].includes(m.preview.state) ? m.preview : undefined), 30_000);
  const t = p.timings;
  check(p.state === 'done', 'private preview played on the Mac output', `${p.state}${p.reason ? ` (${p.reason})` : ''} on "${p.output}"; request→play ${t.playStartAt ? t.playStartAt - t.requestedAt : '–'} ms`);
  check(voice!.effective.voiceId === b.id, 'preview did not change the selection');
} else console.log('SKIP  private preview (audible on the Mac speakers; pass --preview)');

// ── output into the virtual mic ──
const route = out!.route;
console.log(`      route: ${route.state} ${route.deviceName ?? ''} gain ${route.gainDb} dB readers=${JSON.stringify(route.readers)}`);
if (route.state !== 'ready') die(`virtual microphone not ready: ${route.reason}`);
if (route.readers?.length && !force) die(`${route.readers.join(', ')} is reading the virtual mic; test speech would be heard in that call (use --force)`);
send({ type: 'output_control', action: 'enable' });
const auth = await next((m) => (m.type === 'output_status' && m.status.state === 'ready' ? m.status.authorizationId : undefined));
check(out!.voiceId === b.id && out!.voiceRevision === voice!.revision, 'output_status reports the chosen voice', out!.voice);

async function speak(text: string, rev: number | undefined, capture = true) {
  const id = `mv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const cap = capture ? listen(route.deviceUid!, 7) : null;
  if (cap) await sleep(400);
  send({ type: 'speak_typed', requestId: id, outputAuthorizationId: auth, outputGeneration: out!.generation, text, ...(rev !== undefined ? { voiceRevision: rev } : {}) });
  const d = await terminal(id);
  return { d, c: cap ? await cap : null };
}

const { d: d1, c: c1 } = await speak('TACIT My Voice check. I chose this voice myself.', voice!.revision);
check(d1.state === 'rendered' && d1.voiceId === b.id && !!c1?.firstLoudAt, 'typed message spoken in the chosen voice and captured at the virtual mic',
  `${d1.state}${d1.reason ? ` (${d1.reason})` : ''}; voice ${d1.voice}; TTS ${d1.timings.synthEndAt! - d1.timings.synthStartAt!} ms; request→sound at mic ${c1?.firstLoudAt ? Math.round(c1.firstLoudAt - d1.timings.requestedAt) : '–'} ms`);

const staleRev = voice!.revision;
send({ type: 'voice_select', requestId: 'sel-a', voiceId: a.id });
await selectResult('sel-a');
const { d: d2 } = await speak('This must not be spoken.', staleRev, false);
check(d2.state === 'refused' && /voice changed/.test(d2.reason ?? ''), 'message written under the previous voice refused', d2.reason ?? '');

// voice change while a request is queued: it keeps the voice it was approved with
const revA = voice!.revision;
const q1 = `mv-q1-${Date.now()}`, q2 = `mv-q2-${Date.now()}`;
send({ type: 'speak_typed', requestId: q1, outputAuthorizationId: auth, text: 'First queued message.', voiceRevision: revA });
send({ type: 'speak_typed', requestId: q2, outputAuthorizationId: auth, text: 'Second queued message.', voiceRevision: revA });
send({ type: 'voice_select', requestId: 'sel-b2', voiceId: b.id });
await selectResult('sel-b2');
const [t1, t2] = [await terminal(q1), await terminal(q2)];
check(t1.state === 'rendered' && t2.state === 'rendered' && t1.voiceId === a.id && t2.voiceId === a.id, 'queued messages keep their approved voice across a voice change',
  `${t1.voiceId} / ${t2.voiceId}; now selected ${voice!.effective.voiceId}`);

// Stop while speaking
const sid = `mv-stop-${Date.now()}`;
send({ type: 'speak_typed', requestId: sid, outputAuthorizationId: auth, text: 'This is a long message that will be stopped while it is being spoken into the virtual microphone, so it should never finish.' });
await delivery(sid, 'routing');
await next((m) => (m.type === 'speech_delivery' && m.delivery.requestId === sid && m.delivery.timings.firstAudioAt ? true : undefined), 15_000);
await sleep(600);
const stopAt = Date.now();
send({ type: 'output_control', action: 'stop' });
const ds = await terminal(sid);
check(ds.state === 'interrupted', 'emergency Stop interrupts speech', `stop→interrupted ${ds.timings.endedAt! - stopAt} ms (server clock)`);

// latency per voice (warm), into the real route
send({ type: 'output_control', action: 'enable' });
await next((m) => (m.type === 'output_status' && m.status.state === 'ready' ? true : undefined));
const auth2 = out!.authorizationId;
const sayDefault = v0.voices.find((v) => v.id === 'system:default')!; // the pre-My-Voice engine (`say`), for comparison
for (const vo of [a, b, sayDefault]) {
  send({ type: 'voice_select', requestId: `lat-${vo.id}`, voiceId: vo.id });
  await selectResult(`lat-${vo.id}`);
  const tts: number[] = [], toAudio: number[] = [], toMic: number[] = [];
  for (let i = 0; i < runs; i++) {
    const id = `mv-lat-${Date.now()}-${i}`;
    const cap = listen(route.deviceUid!, 7);
    await sleep(400);
    send({ type: 'speak_typed', requestId: id, outputAuthorizationId: auth2, text: `Message ${i + 1}: could you give me a minute to think about that?`, voiceRevision: voice!.revision });
    const d = await terminal(id); const c = await cap;
    if (d.state !== 'rendered' || !c.firstLoudAt) { check(false, `latency run ${vo.name} ${i + 1}`, `${d.state} ${d.reason ?? ''}`); continue; }
    tts.push(d.timings.synthEndAt! - d.timings.synthStartAt!); toAudio.push(d.timings.firstAudioAt! - d.timings.requestedAt); toMic.push(Math.round(c.firstLoudAt - d.timings.requestedAt));
  }
  if (tts.length) console.log(`      ${vo.name} (${vo.locale}) n=${tts.length}: TTS p50 ${pct(tts, 0.5)} / max ${Math.max(...tts)} ms; request→route start p50 ${pct(toAudio, 0.5)} ms; request→sound at mic p50 ${pct(toMic, 0.5)} / max ${Math.max(...toMic)} ms`);
}

// restore
send({ type: 'output_control', action: 'stop' });
send({ type: 'voice_select', requestId: 'restore', ...(original ?? { voiceId: null }) });
await selectResult('restore');
console.log(`      restored selection: ${voice!.selected.source} ${voice!.effective.voiceId}; output off`);
ws.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall My Voice checks passed (local render only — remote audibility NOT verified)');
process.exit(failures ? 1 : 0);
