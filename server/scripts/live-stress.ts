// Live Silent Speech stress + failure check against a RUNNING server, using one real recorded clip (CREMA-D, VOICED
// actor; audio never read — not silent speech) sent as timestamped JPEG frames, exactly as the browser does.
//   1. N sequential utterances → latency p50/p95/max, every result shown with the same raw text
//   2. burst of 5 back-to-back → recogniser bound: extras abstain "busy", nothing queued unboundedly
//   3. pause while recognising → in-flight result dropped (abstained), never shown late
//   4. duplicate utteranceId, out-of-order frame times, stale authorization → abstained with reasons
//   5. (--kill-recognizer) recogniser process killed → utterance abstains with an error; supervised restart recovers
//   TACIT_URL=ws://localhost:8790 npm run live:stress [-- --n 20 --kill-recognizer]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import type { RecognitionHypothesis, ServerMessage } from '../../shared/protocol.ts';
import { secrets } from './secrets.ts';

const base = process.env.TACIT_URL ?? 'ws://localhost:8790';
const arg = (k: string, d: number) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const N = arg('--n', 20);
const killRec = process.argv.includes('--kill-recognizer');
const clip = fileURLToPath(new URL('../../recognition/eval/clips/cremad/1040_IEO_NEU_XX.flv', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'tacit-stress-'));
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', clip, '-an', '-vf', 'fps=30', '-q:v', '4', join(dir, 'f%04d.jpg')]);
const jpegs = readdirSync(dir).sort().map((f) => readFileSync(join(dir, f)));
rmSync(dir, { recursive: true, force: true });
let failures = 0;
const check = (ok: boolean, what: string) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); };

const ws = new WebSocket(`${base}/ws?token=${secrets.userToken}`);
let auth: string | null = null;
const hyps = new Map<string, RecognitionHypothesis>();
const waiters = new Map<string, (h: RecognitionHypothesis) => void>();
let lastState = '';
ws.on('message', (d) => {
  const m = JSON.parse(String(d)) as ServerMessage;
  if (m.type === 'live_status') { auth = m.status.authorizationId; lastState = m.status.state; }
  if (m.type === 'recognition_hypothesis') { hyps.set(m.hypothesis.utteranceId, m.hypothesis); waiters.get(m.hypothesis.utteranceId)?.(m.hypothesis); }
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let t0 = 100_000;
function send(id: string, opts: { times?: number[]; auth?: string | null } = {}): Promise<RecognitionHypothesis> {
  const times = opts.times ?? jpegs.map((_, i) => t0 + (i * 1000) / 30);
  t0 += 20_000;
  const p = new Promise<RecognitionHypothesis>((res) => waiters.set(id, res));
  ws.send(JSON.stringify({ type: 'visual_utterance', utteranceId: id, authorizationId: opts.auth === undefined ? auth : opts.auth, startMs: times[0], endMs: times.at(-1), endpointMs: times.at(-1)! + 480, frameTimesMs: times }));
  for (const j of jpegs.slice(0, times.length)) ws.send(j);
  return p;
}
const control = async (action: string) => { ws.send(JSON.stringify({ type: 'live_control', action, ...(action === 'activate' ? { mode: 'display-only', inputSource: 'camera' } : {}) })); await sleep(150); };
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;

await new Promise((r) => ws.once('open', r));
await sleep(200);
await control('activate');
check(lastState === 'active' && !!auth, 'display-only Live activated without any call');

// 1. sequential
const lat: number[] = [], server: number[] = [], texts = new Set<string>();
for (let i = 0; i < N; i++) {
  const s = Date.now();
  const h = await send(`seq-${i}`);
  lat.push(Date.now() - s); server.push(h.recognitionMs); texts.add(h.decision === 'shown' ? h.rawText : `ABSTAINED:${h.reason}`);
}
check(texts.size === 1 && [...texts][0] === "IT'S ELEVEN O'CLOCK", `${N} consecutive utterances all shown with identical raw text (${[...texts].join(' | ')})`);
console.log(`      client round trip p50 ${pct(lat, 0.5)} / p95 ${pct(lat, 0.95)} / max ${Math.max(...lat)} ms; server recognition p50 ${pct(server, 0.5)} / p95 ${pct(server, 0.95)} / max ${Math.max(...server)} ms`);

// 2. burst
const burst = await Promise.all([0, 1, 2, 3, 4].map((i) => send(`burst-${i}`)));
const shown = burst.filter((h) => h.decision === 'shown').length, busy = burst.filter((h) => /busy/i.test(h.reason ?? '')).length;
check(shown >= 2 && shown + busy === 5, `burst of 5: ${shown} recognised, ${busy} abstained as busy (bound 2 in flight, nothing queued)`);

// 3. pause while recognising
const pending = send('paused-mid');
await sleep(60);
await control('pause');
const pm = await pending;
check(pm.decision === 'abstained' && /Dropped/.test(pm.reason ?? ''), `pause mid-recognition → ${pm.decision} (${pm.reason})`);
await control('resume');

// 4. invalid inputs
const dup = await send('seq-0');
check(dup.decision === 'abstained' && /Duplicate/.test(dup.reason ?? ''), `duplicate utteranceId → ${dup.reason}`);
const ooo = await send('out-of-order', { times: [5, 4, 6] });
check(ooo.decision === 'abstained' && /increasing/.test(ooo.reason ?? ''), `out-of-order frame times → ${ooo.reason}`);
const stale = await send('stale', { auth: 'not-the-current-authorization' });
check(stale.decision === 'abstained' && /Stale/.test(stale.reason ?? ''), `stale authorization → ${stale.reason}`);

// 5. recogniser crash
if (killRec) {
  const pid = execFileSync('lsof', ['-nP', '-iTCP:8765', '-sTCP:LISTEN', '-t']).toString().trim();
  process.kill(Number(pid), 'SIGKILL');
  await sleep(200);
  const down = await send('recognizer-down');
  check(down.decision === 'abstained' && !!down.reason, `recogniser killed → abstained (${down.reason})`);
  const start = Date.now();
  let back: RecognitionHypothesis | null = null;
  for (let i = 0; i < 40 && Date.now() - start < 40_000; i++) {
    await sleep(1000);
    const h = await send(`recover-${i}`);
    if (h.decision === 'shown') { back = h; break; }
  }
  check(!!back, `supervised restart recovered: shown again after ${Math.round((Date.now() - start) / 1000)} s`);
}

await control('end');
ws.close();
console.log(failures ? `LIVE STRESS: ${failures} FAILED` : 'LIVE STRESS OK (voiced recorded clip — not a silent-speech result)');
process.exit(failures ? 1 : 0);
