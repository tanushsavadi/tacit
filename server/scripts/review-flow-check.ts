// Reviewed-speech flow against a RUNNING TACIT server, with recorded clips as input (labelled as recorded):
// real-time refusal (experimental profile) → voice output on → Live display-only → recognised words shown and NOT
// spoken → Speak on the raw candidate (rendered once) → Speak on a correction, then Stop (interrupted) → Speak after
// Stop (refused) → Live ended, output stopped. Refuses to run while any app reads the virtual microphone, so no person
// can hear the test audio.
//   npx tsx scripts/review-flow-check.ts <clip1.mp4> <clip2.mp4> [http://127.0.0.1:8790]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { buildReviewedRequest } from '../src/reviewed.ts';
import { secrets } from './secrets.ts';

const [clip1, clip2, base = 'http://127.0.0.1:8790'] = process.argv.slice(2);
if (!clip1 || !clip2) { console.error('usage: review-flow-check.ts <clip1.mp4> <clip2.mp4> [base]'); process.exit(2); }
const health = await (await fetch(`${base}/api/health`, { headers: { authorization: `Bearer ${secrets.userToken}` } })).json() as any;
const readers = health.services.voiceRoute?.readers;
if (!Array.isArray(readers) || readers.length) { console.error(`REFUSED: virtual-mic readers ${JSON.stringify(readers)} — test audio could be heard`); process.exit(3); }
if (health.live?.state && health.live.state !== 'off') { console.error(`REFUSED: Live is ${health.live.state}`); process.exit(3); }
console.log(`recognizer profile: ${JSON.stringify(health.services.recognition.profile ?? 'not reported')}`);

function frames(clip: string): Buffer[] {
  const dir = mkdtempSync(join(tmpdir(), 'tacit-flow-'));
  execFileSync('ffmpeg', ['-v', 'error', '-i', clip, '-an', '-vf', 'fps=25,scale=640:-2', '-q:v', '4', join(dir, 'f%04d.jpg')]);
  const out = readdirSync(dir).sort().slice(0, 250).map((f) => readFileSync(join(dir, f)));
  rmSync(dir, { recursive: true });
  return out;
}
const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${encodeURIComponent(secrets.userToken)}`);
const msgs: any[] = [];
let live: any = null, output: any = null;
ws.on('message', (d, bin) => {
  if (bin) return;
  const m = JSON.parse(String(d)); msgs.push(m);
  if (m.type === 'live_status') live = m.status;
  if (m.type === 'output_status') output = m.status;
});
const wait = (pred: () => any, ms = 30000, what = 'condition') => new Promise<any>((res, rej) => {
  const t0 = Date.now();
  const loop = () => { const v = pred(); if (v) return res(v); if (Date.now() - t0 > ms) return rej(new Error(`timeout: ${what}`)); setTimeout(loop, 20); };
  loop();
});
const send = (m: object) => ws.send(JSON.stringify(m));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const deliveries = (id: string) => msgs.filter((m) => m.type === 'speech_delivery' && m.delivery.requestId === id).map((m) => m.delivery.state);
const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push([name, ok, detail]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

await new Promise((r) => ws.once('open', r));
await wait(() => live && output, 5000, 'initial status');
let n = 0;
async function utterance(clip: string) {
  const f = frames(clip), id = `flowcheck-${++n}-${Date.now()}`;
  const times = f.map((_, i) => 1000 + i * 40);
  send({ type: 'visual_utterance', utteranceId: id, authorizationId: live.authorizationId, startMs: times[0], endMs: times.at(-1), endpointMs: times.at(-1)! + 400, frameTimesMs: times });
  for (const b of f) ws.send(b);
  return (await wait(() => msgs.find((m) => m.type === 'recognition_hypothesis' && m.hypothesis.utteranceId === id), 30000, 'result')).hypothesis;
}

try {
  send({ type: 'live_control', action: 'activate', mode: 'automatic', acknowledgeUnreviewed: true, inputSource: 'camera' });
  await sleep(500);
  const experimental = health.services.recognition.profile?.reviewRequired === true;
  check('real-time (unreviewed) activation', experimental ? live.state === 'off' && /Review First/.test(live.reason) : true, `${live.state}/${live.mode}: ${live.reason}`);
  if (live.state !== 'off') { send({ type: 'live_control', action: 'end' }); await sleep(300); }

  send({ type: 'output_control', action: 'enable' });
  await wait(() => output?.state === 'ready', 10000, 'voice output ready');
  send({ type: 'live_control', action: 'activate', mode: 'display-only', inputSource: 'camera' });
  await wait(() => live?.state === 'active', 5000, 'Live active');

  const before = msgs.filter((m) => m.type === 'speech_delivery').length;
  const h1 = await utterance(clip1);
  console.log(`clip 1 → ${h1.decision} "${h1.rawText}" | candidates ${JSON.stringify(h1.reviewCandidates?.map((c: any) => c.text) ?? [])} | profile ${JSON.stringify(h1.recognizerProfile ?? null)}`);
  await sleep(1500);
  check('recognised words are shown, not spoken', msgs.filter((m) => m.type === 'speech_delivery').length === before && h1.transmitted === false);

  if (h1.decision === 'shown') {
    const r1 = buildReviewedRequest(h1, { index: 0 }, output, live, `flow-speak-${Date.now()}`);
    if (typeof r1 === 'string') check('Speak on the displayed raw words', false, r1);
    else {
      send(r1);
      const end = await wait(() => deliveries(r1.requestId).find((s) => ['rendered', 'refused', 'failed', 'interrupted'].includes(s)), 30000, 'delivery');
      const d = msgs.find((m) => m.type === 'speech_delivery' && m.delivery.requestId === r1.requestId && m.delivery.state === end).delivery;
      check('Speak on the displayed raw words → rendered once into the virtual mic', end === 'rendered' && d.source === 'reviewed-recognition' && d.text === h1.rawText, `${end} "${d.text}" (${d.source})`);
    }
  }

  const h2 = await utterance(clip2);
  console.log(`clip 2 → ${h2.decision} "${h2.rawText}"`);
  if (h2.decision === 'shown') {
    const correction = 'This is a corrected sentence that is long enough to still be playing when Stop is pressed.';
    const r2 = buildReviewedRequest(h2, { index: 0, edited: correction }, output, live, `flow-correct-${Date.now()}`);
    if (typeof r2 === 'string') check('correction + Stop', false, r2);
    else {
      send(r2);
      await wait(() => deliveries(r2.requestId).some((s) => s !== 'queued'), 15000, 'correction started');
      await sleep(400);
      send({ type: 'output_control', action: 'stop' });
      const end = await wait(() => deliveries(r2.requestId).find((s) => ['rendered', 'refused', 'failed', 'interrupted'].includes(s)), 15000, 'correction end');
      const d = msgs.find((m) => m.type === 'speech_delivery' && m.delivery.requestId === r2.requestId && m.delivery.state === end).delivery;
      check('Speak on a correction is the user\'s exact text, labelled user-corrected', d.text === correction && d.source === 'user-corrected', `${d.source}`);
      check('Stop interrupts reviewed speech that is playing', end === 'interrupted', end);
      const r3 = buildReviewedRequest(h2, { index: 0 }, output, live, `flow-after-stop-${Date.now()}`);
      if (typeof r3 === 'string') check('Speak after Stop is refused', true, `client-side: ${r3}`);
      else {
        send(r3);
        const s = await wait(() => deliveries(r3.requestId).find((x) => ['rendered', 'refused', 'failed', 'interrupted'].includes(x)), 10000, 'after-stop');
        check('Speak after Stop is refused', s === 'refused', s);
      }
    }
  }
} catch (e) {
  check('flow completed', false, e instanceof Error ? e.message : String(e));
} finally {
  send({ type: 'live_control', action: 'end' });
  send({ type: 'output_control', action: 'stop' });
  await sleep(500);
  ws.close();
  console.log(`${results.filter((r) => r[1]).length}/${results.length} checks passed (recorded clips as input, not live camera)`);
  process.exit(results.every((r) => r[1]) ? 0 : 1);
}
