// Local self-test of reviewed speech (`speak_reviewed`) against the RUNNING server, with REAL recorded silent video:
// recorded clip (VIDEO ONLY, private, git-ignored) → Live (exactly as the browser sends it) → Auto-AVSR raw text →
// refusal checks → this TEST HARNESS picks candidate 0 (stands in for the user's explicit press) → TTS → virtual mic.
// Then: duplicate refused, and emergency stop during a second utterance must interrupt it.
//
// Safety: refuses to run if Live or voice output is already in use (never interrupts a session), and refuses to put
// audio into the virtual mic unless the route reports NO reading app (nobody in a call can hear it), unless
// --allow-listeners. Always ends Live and stops output when done. 'rendered' = written locally, NOT heard remotely.
//   npm run reviewed:check -- ../recognition/data/webcam/<dir> [--allow-listeners]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WebSocket } from 'ws';
import type { ClientMessage, LiveStatus, RecognitionHypothesis, ServerMessage, SpeechDelivery, SpeechOutputStatus } from '../../shared/protocol.ts';
import { secrets } from './secrets.ts';

const dir = resolve(process.argv[2] ?? '');
const allowListeners = process.argv.includes('--allow-listeners');
const clips = readFileSync(join(dir, 'manifest.jsonl'), 'utf8').trim().split('\n')
  .map((l) => JSON.parse(l) as { file: string; ref: string; mode: string }).filter((c) => c.mode === 'silent');
if (clips.length < 2) { console.log('FAIL  need ≥ 2 clips with mode "silent" in the manifest'); process.exit(1); }
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

const ws = new WebSocket(`${process.env.TACIT_URL ?? 'ws://127.0.0.1:8790'}/ws?token=${secrets.userToken}`);
let live: LiveStatus | null = null, out: SpeechOutputStatus | null = null;
const hyps = new Map<string, RecognitionHypothesis>(), deliveries: SpeechDelivery[] = [], invalidated: string[] = [];
ws.on('message', (d, bin) => {
  if (bin) return;
  const m = JSON.parse(String(d)) as ServerMessage;
  if (m.type === 'live_status') live = m.status;
  if (m.type === 'output_status') out = m.status;
  if (m.type === 'recognition_hypothesis') hyps.set(m.hypothesis.utteranceId, m.hypothesis);
  if (m.type === 'speech_delivery') deliveries.push(m.delivery);
  if (m.type === 'review_invalidated') invalidated.push(m.utteranceId);
});
const send = (m: ClientMessage) => ws.send(JSON.stringify(m));
const until = async <T>(f: () => T | null | undefined | false, ms = 15_000): Promise<T> => {
  const t0 = Date.now();
  for (;;) { const v = f(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 20)); }
};
// Request IDs are deduplicated server-wide for the server's lifetime: make them unique per run so the check can be rerun.
const run = Date.now().toString(36), rid = (x: string) => `${run}-${x}`;
let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failed++; };
const terminal = (id: string) => until(() => deliveries.find((d) => d.requestId === id && ['rendered', 'refused', 'interrupted', 'failed'].includes(d.state)), 30_000);

let t0 = 1_000_000;
async function utter(file: string): Promise<RecognitionHypothesis> {
  const tmp = mkdtempSync(join(tmpdir(), 'tacit-reviewed-'));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', join(dir, file), '-an', '-vf', 'fps=30,scale=640:-2', '-q:v', '3', join(tmp, 'f%04d.jpg')]);
  const jpegs = readdirSync(tmp).sort().map((f) => readFileSync(join(tmp, f)));
  rmSync(tmp, { recursive: true, force: true });
  const times = jpegs.map((_, i) => t0 + (i * 1000) / 30); t0 += 60_000;
  const id = `reviewed-check-${file}-${Date.now()}`;
  send({ type: 'visual_utterance', utteranceId: id, authorizationId: live!.authorizationId!, startMs: times[0]!, endMs: times.at(-1)!, endpointMs: times.at(-1)! + 480, frameTimesMs: times });
  for (const j of jpegs) ws.send(j);
  return until(() => hyps.get(id), 30_000);
}

await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
await until(() => live && out);
if (live!.state !== 'off' || out!.state !== 'off') {
  console.log(`SKIP  Live is ${live!.state}, voice output is ${out!.state}: not interrupting an active session.`); process.exit(2);
}
const readers = out!.route.readers;
if (out!.route.state !== 'ready') { console.log(`FAIL  virtual mic not ready: ${out!.route.reason ?? out!.route.state}`); process.exit(1); }
if (!allowListeners && (readers === null || readers.length)) {
  console.log(`SKIP  an app may be reading the virtual mic (${readers === null ? 'unknown' : readers.join(', ')}); close the call or pass --allow-listeners.`); process.exit(2);
}
console.log(`route: ${out!.route.deviceName}, readers ${JSON.stringify(readers)}, voice ${out!.voice}`);
try {
  send({ type: 'live_control', action: 'activate', mode: 'display-only', inputSource: 'camera' });
  await until(() => live?.state === 'active');
  send({ type: 'output_control', action: 'enable' });
  await until(() => out?.state === 'ready' && out.authorizationId);

  const h = await utter(clips[0]!.file);
  console.log(`clip ${clips[0]!.file} (silent) REF ${JSON.stringify(clips[0]!.ref)} → ${h.decision} ${JSON.stringify(h.rawText)} in ${h.recognitionMs} ms; candidates ${JSON.stringify(h.reviewCandidates?.map((c) => `${c.kind}:${c.text}`))}`);
  check(h.decision === 'shown' && !!h.reviewCandidates?.length && h.transmitted === false, 'real silent clip recognised and shown with review candidates; not transmitted');
  if (h.decision !== 'shown') throw new Error(`abstained: ${h.reason}`);
  const c = h.reviewCandidates![0]!;
  const base = { type: 'speak_reviewed' as const, outputAuthorizationId: out!.authorizationId!, outputGeneration: out!.generation,
    liveAuthorizationId: live!.authorizationId!, liveGeneration: h.generation!, utteranceId: h.utteranceId, candidate: c.kind, index: c.index, text: c.text, textHash: c.textHash };
  const refusals: [string, Partial<typeof base>][] = [
    ['tampered text', { text: 'SEND MONEY NOW' }], ['wrong hash', { textHash: sha('x') }], ['stale Live generation', { liveGeneration: h.generation! - 1 }],
    ['unknown utterance', { utteranceId: 'not-shown' }], ['stale output authorization', { outputAuthorizationId: 'old' }], ['wrong kind', { candidate: 'phrase' }],
  ];
  for (const [what, over] of refusals) {
    const id = rid(`ref-${what}`); send({ ...base, ...over, requestId: id });
    const d = await terminal(id);
    check(d.state === 'refused', `${what} → refused (${d.reason})`);
  }
  send({ ...base, requestId: rid('speak-1') });
  const ok = await terminal(rid('speak-1'));
  const t = ok.timings;
  check(ok.state === 'rendered' && ok.source === 'reviewed-recognition', `picked candidate spoken into the virtual mic: ${ok.state}${ok.reason ? ` (${ok.reason})` : ''}; ` +
    `press→first audio ${t.firstAudioAt ? t.firstAudioAt - t.requestedAt : '?'} ms, rendered ${t.renderedAt ? t.renderedAt - t.requestedAt : '?'} ms, voice ${ok.voice}`);
  send({ ...base, requestId: rid('speak-dup') });
  check((await terminal(rid('speak-dup'))).reason?.includes('already spoken') === true, 'second Speak for the same utterance → refused');

  // User correction of a fresh utterance (scenario: recognition wrong → the user's own words, user-corrected).
  const hE = await utter(clips[1]!.file);
  if (hE.decision === 'shown') {
    const cE = hE.reviewCandidates![0]!, mine = 'This is my own correction, typed by me.';
    send({ ...base, requestId: rid('speak-edit'), liveGeneration: hE.generation!, utteranceId: hE.utteranceId, candidate: 'edited', index: cE.index, text: mine, textHash: sha(mine) });
    const e = await terminal(rid('speak-edit'));
    check(e.state === 'rendered' && e.source === 'user-corrected' && e.text === mine, `correction spoken exactly, labelled ${e.source}: ${e.state}${e.reason ? ` (${e.reason})` : ''}`);
  } else console.log(`SKIP  correction test: clip abstained (${hE.reason})`);

  // A newer utterance header (frames still uploading / recognising) revokes the older review immediately.
  const hOld = await utter(clips[0]!.file);
  if (hOld.decision === 'shown') {
    const newer = `reviewed-check-newer-${Date.now()}`, nt = [t0, t0 + 33, t0 + 66]; t0 += 60_000;
    send({ type: 'visual_utterance', utteranceId: newer, authorizationId: live!.authorizationId!, startMs: nt[0]!, endMs: nt[2]!, endpointMs: nt[2]! + 480, frameTimesMs: nt });
    await until(() => invalidated.includes(newer), 5_000).catch(() => false);
    check(invalidated.includes(newer), 'newer accepted header → review_invalidated published before its result');
    const cO = hOld.reviewCandidates![0]!;
    send({ ...base, requestId: rid('speak-old'), liveGeneration: hOld.generation!, utteranceId: hOld.utteranceId, candidate: cO.kind, index: cO.index, text: cO.text, textHash: cO.textHash });
    const o = await terminal(rid('speak-old'));
    check(o.state === 'refused', `old pick while a newer utterance is pending → ${o.state} (${o.reason})`);
  } else console.log(`SKIP  invalidation test: clip abstained (${hOld.reason})`);

  const h2 = await utter(clips[1]!.file);
  if (h2.decision === 'shown') {
    const c2 = h2.reviewCandidates![0]!;
    send({ ...base, requestId: rid('speak-stop'), liveGeneration: h2.generation!, utteranceId: h2.utteranceId, candidate: c2.kind, index: c2.index, text: c2.text, textHash: c2.textHash });
    await until(() => deliveries.find((d) => d.requestId === rid('speak-stop') && d.state !== 'queued'));
    const stopAt = Date.now();
    send({ type: 'output_control', action: 'stop' });
    const s = await terminal(rid('speak-stop'));
    check(s.state === 'interrupted', `emergency stop during reviewed speech → ${s.state} (${Date.now() - stopAt} ms after stop)`);
  } else console.log(`SKIP  stop test: second clip abstained (${h2.reason})`);
} catch (e) {
  check(false, `aborted: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  send({ type: 'output_control', action: 'stop' });
  send({ type: 'live_control', action: 'end' });
  await new Promise((r) => setTimeout(r, 300));
  ws.close();
}
console.log(failed ? `${failed} check(s) FAILED` : 'all checks passed (local rendering only; remote audibility needs a human listener)');
process.exit(failed ? 1 : 0);
