// End-to-end voice output check against a RUNNING server (Test 3 through the product path):
// authenticated user WS → output_control enable → speak_typed (user-authored TEST text) → server TTS → tacit-route →
// virtual mic, while `tacit-route listen` captures the virtual mic's input side to time when audio really appears.
// Then a second message is paused mid-sentence: it must end 'interrupted' and the capture must go quiet.
// Never claims remote audibility. Refuses if a calling app is reading the virtual mic (unless --force).
//   TACIT_URL=ws://localhost:8790 npm run speech:check [-- --runs 3 --force]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WebSocket } from 'ws';
import type { ServerMessage, SpeechDelivery, SpeechOutputStatus } from '../../shared/protocol.ts';
import { routeBinary } from '../src/route.ts';
import { secrets } from './secrets.ts';

const run = promisify(execFile);
const base = process.env.TACIT_URL ?? 'ws://localhost:8790';
const runs = Number(process.argv[process.argv.indexOf('--runs') + 1]) || 3;
const force = process.argv.includes('--force');
const fail = (m: string): never => { console.error(`SPEECH CHECK FAILED: ${m}`); process.exit(1); };
const bin = routeBinary() ?? fail('tacit-route not built');

const ws = new WebSocket(`${base}/ws?token=${secrets.userToken}`);
let status: SpeechOutputStatus | null = null;
const waiters: ((m: ServerMessage) => void)[] = [];
ws.on('message', (d) => {
  const m = JSON.parse(String(d)) as ServerMessage;
  if (m.type === 'output_status') status = m.status;
  for (const w of [...waiters]) w(m);
});
const next = <T>(pred: (m: ServerMessage) => T | undefined, ms = 20_000) => new Promise<T>((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), ms);
  const w = (m: ServerMessage) => { const v = pred(m); if (v !== undefined) { clearTimeout(t); waiters.splice(waiters.indexOf(w), 1); resolve(v); } };
  waiters.push(w);
});
const terminal = (id: string) => next((m) => m.type === 'speech_delivery' && m.delivery.requestId === id && ['rendered', 'refused', 'interrupted', 'failed'].includes(m.delivery.state) ? m.delivery : undefined);
const listen = (uid: string, s: number) => run(bin, ['listen', '--device-uid', uid, '--seconds', String(s)], { timeout: (s + 5) * 1000 })
  .then(({ stdout }) => JSON.parse(stdout.trim().split('\n').at(-1)!) as { firstLoudAt?: number; lastLoudAt?: number; loudMs: number });
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;

await new Promise((r) => ws.once('open', r));
await next((m) => (m.type === 'output_status' ? true : undefined));
const route = status!.route;
console.log(`route: ${route.state} ${route.deviceName ?? ''} gain ${route.gainDb} dB${route.calibrated ? '' : ' (UNCALIBRATED)'} readers=${JSON.stringify(route.readers)}`);
if (route.state !== 'ready') fail(`virtual microphone not ready: ${route.reason}`);
if (route.readers?.length && !force) fail(`${route.readers.join(', ')} is reading the virtual mic; test speech would be heard in that call (use --force)`);
ws.send(JSON.stringify({ type: 'output_control', action: 'enable' }));
const auth = await next((m) => (m.type === 'output_status' && m.status.state === 'ready' ? m.status.authorizationId : undefined));

const rows: { tts: number; toAudio: number; toMic: number }[] = [];
for (let i = 0; i < runs; i++) {
  const id = `check-${Date.now()}-${i}`;
  const cap = listen(route.deviceUid!, 6);
  await new Promise((r) => setTimeout(r, 400)); // capture running before the request
  ws.send(JSON.stringify({ type: 'speak_typed', requestId: id, outputAuthorizationId: auth, text: `TACIT test message ${i + 1}. I typed this myself.` }));
  const d: SpeechDelivery = await terminal(id);
  const c = await cap;
  if (d.state !== 'rendered') fail(`message ${i + 1}: ${d.state} — ${d.reason}`);
  if (!c.firstLoudAt) fail(`message ${i + 1} rendered but no audio captured at the virtual mic input`);
  const t = d.timings;
  rows.push({ tts: t.synthEndAt! - t.synthStartAt!, toAudio: t.firstAudioAt! - t.requestedAt, toMic: Math.round(c.firstLoudAt! - t.requestedAt) });
  console.log(`message ${i + 1}: rendered by ${d.voice}; TTS ${rows.at(-1)!.tts} ms; request→route start ${rows.at(-1)!.toAudio} ms; request→sound at virtual mic ${rows.at(-1)!.toMic} ms; captured ${c.loudMs} ms of sound`);
}
const col = (k: keyof (typeof rows)[0]) => rows.map((r) => r[k]);
console.log(`p50/max over ${runs}: TTS ${pct(col('tts'), 0.5)}/${Math.max(...col('tts'))} ms, request→sound at virtual mic ${pct(col('toMic'), 0.5)}/${Math.max(...col('toMic'))} ms`);

// Pause mid-sentence.
const id = `check-pause-${Date.now()}`;
const cap = listen(route.deviceUid!, 8);
await new Promise((r) => setTimeout(r, 400));
ws.send(JSON.stringify({ type: 'speak_typed', requestId: id, outputAuthorizationId: auth, text: 'This is a long test sentence that should be cut off part of the way through when pause is pressed, so nothing after that point is spoken.' }));
await next((m) => (m.type === 'speech_delivery' && m.delivery.requestId === id && m.delivery.timings.firstAudioAt ? true : undefined));
await new Promise((r) => setTimeout(r, 1200));
const pausedAt = Date.now();
ws.send(JSON.stringify({ type: 'output_control', action: 'pause' }));
const pd = await terminal(id);
const pc = await cap;
const tail = pc.lastLoudAt ? Math.round(pc.lastLoudAt - pausedAt) : null;
console.log(`pause: delivery ${pd.state} (${pd.reason}); last sound at virtual mic ${tail} ms after pause was sent`);
if (pd.state !== 'interrupted') fail('paused message was not interrupted');
if (tail !== null && tail > 300) fail(`audio continued ${tail} ms after pause`);
ws.send(JSON.stringify({ type: 'speak_typed', requestId: `${id}-after`, outputAuthorizationId: auth, text: 'should not play' }));
const after = await terminal(`${id}-after`);
if (after.state !== 'refused') fail('message accepted while paused');
console.log(`while paused: refused (${after.reason})`);
ws.send(JSON.stringify({ type: 'output_control', action: 'stop' }));
console.log('SPEECH CHECK OK — local virtual-mic delivery only; remote audibility NOT verified (needs a human listener)');
setTimeout(() => process.exit(0), 200);
