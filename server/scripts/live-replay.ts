// Replay a recorded webcam session (recognition/data/webcam/<dir>, VIDEO ONLY, private, git-ignored) through the
// RUNNING server's Live protocol exactly as the browser sends it: 640 px wide JPEG frames with timestamps, one
// utterance per clip, display-only. Prints raw text + phrase-mode decision per clip and a summary. Never speaks:
// voice output is not touched and every hypothesis must report transmitted=false.
//   npm run live:replay -- ../recognition/data/webcam/<dir>
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WebSocket } from 'ws';
import type { RecognitionHypothesis, ServerMessage } from '../../shared/protocol.ts';
import { secrets } from './secrets.ts';

const dir = resolve(process.argv[2] ?? '');
const items = readFileSync(join(dir, 'manifest.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { file: string; ref: string; mode: string; prompted: boolean });
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const ws = new WebSocket(`${process.env.TACIT_URL ?? 'ws://127.0.0.1:8790'}/ws?token=${secrets.userToken}`);
let auth: string | null = null, outputState = '';
const waiters = new Map<string, (h: RecognitionHypothesis) => void>();
ws.on('message', (d) => {
  const m = JSON.parse(String(d)) as ServerMessage;
  if (m.type === 'live_status') auth = m.status.authorizationId;
  if (m.type === 'output_status') outputState = m.status.state;
  if (m.type === 'speech_delivery') { console.log('FAIL  unexpected speech delivery during replay'); process.exitCode = 1; }
  if (m.type === 'recognition_hypothesis') waiters.get(m.hypothesis.utteranceId)?.(m.hypothesis);
});
await new Promise((r) => ws.once('open', r));
ws.send(JSON.stringify({ type: 'live_control', action: 'activate', mode: 'display-only', inputSource: 'camera' }));
await new Promise((r) => setTimeout(r, 300));
let t0 = 1_000_000, transmitted = 0;
const rows: { group: string; ref: string; raw: string; phrase: string; accepted: boolean; ms: number; reason: string | null }[] = [];
for (const it of items) {
  const tmp = mkdtempSync(join(tmpdir(), 'tacit-replay-'));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', join(dir, it.file), '-an', '-vf', 'fps=30,scale=640:-2', '-q:v', '3', join(tmp, 'f%04d.jpg')]);
  const jpegs = readdirSync(tmp).sort().map((f) => readFileSync(join(tmp, f)));
  rmSync(tmp, { recursive: true, force: true });
  const times = jpegs.map((_, i) => t0 + (i * 1000) / 30); t0 += 60_000;
  const id = `replay-${it.file}`;
  const p = new Promise<RecognitionHypothesis>((r) => waiters.set(id, r));
  const start = Date.now();
  ws.send(JSON.stringify({ type: 'visual_utterance', utteranceId: id, authorizationId: auth, startMs: times[0], endMs: times.at(-1), endpointMs: times.at(-1)! + 480, frameTimesMs: times }));
  for (const j of jpegs) ws.send(j);
  const h = await p;
  if (h.transmitted !== false) transmitted++;
  const group = it.mode === 'silent' ? (it.prompted ? 'silent_prompted' : 'silent_own') : 'voiced';  // '' (unlabelled) clips were spoken
  rows.push({ group, ref: norm(it.ref), raw: h.rawText, phrase: h.phraseMatch?.phrase ?? '', accepted: !!h.phraseMatch?.accepted, ms: Date.now() - start, reason: h.reason ?? h.phraseMatch?.reason ?? null });
  const r = rows.at(-1)!;
  console.log(`${group.padEnd(15)} ${it.file.padEnd(18)} REF ${JSON.stringify(r.ref).padEnd(38)} RAW ${JSON.stringify(r.raw).padEnd(44)} PHRASE ${r.accepted ? 'ACCEPT' : 'reject'} ${JSON.stringify(r.phrase)} ${r.ms} ms`);
}
ws.send(JSON.stringify({ type: 'live_control', action: 'end' }));
console.log('');
for (const g of ['silent_prompted', 'silent_own', 'voiced']) {
  const R = rows.filter((r) => r.group === g);
  if (!R.length) continue;
  const acc = R.filter((r) => r.accepted);
  console.log(`${g.padEnd(15)} n ${R.length}: raw exact ${R.filter((r) => r.raw === r.ref).length}; phrase accepted ${acc.length} (correct ${acc.filter((r) => r.phrase === r.ref).length}, WRONG ${acc.filter((r) => r.phrase !== r.ref).length})`);
}
const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
console.log(`round trip (frames sent → result) p50 ${ms[Math.floor(ms.length / 2)]} ms, max ${ms.at(-1)} ms; transmitted≠false: ${transmitted}; voice output state during replay: ${outputState || 'unknown'}`);
ws.close();
