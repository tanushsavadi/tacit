// PRERECORDED demo fallback with Speak: sends recorded clip(s) as utterances into the Live session the presenter
// already started in the notch (display-only). Each result appears in the notch like a camera utterance; the presenter
// reviews it and presses Speak there. This script never speaks, never activates or ends Live, and never enables voice
// output. RECORDED input — say so when presenting it.
//   npx tsx scripts/replay-clip.ts CLIP.mp4 [CLIP.mp4 ...]    (press Enter between clips)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import WebSocket from 'ws';
import { secrets } from './secrets.ts';

const clips = process.argv.slice(2);
if (!clips.length) { console.error('usage: replay-clip.ts CLIP.mp4 [...]'); process.exit(2); }
const base = `http://127.0.0.1:${process.env.PORT ?? 8790}`;
const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${encodeURIComponent(secrets.userToken)}`);
let live: any = null;
const results = new Map<string, any>();
ws.on('message', (d, bin) => {
  if (bin) return;
  const m = JSON.parse(String(d));
  if (m.type === 'live_status') live = m.status;
  if (m.type === 'recognition_hypothesis') results.set(m.hypothesis.utteranceId, m.hypothesis);
});
await new Promise((r) => ws.once('open', r));
await new Promise((r) => setTimeout(r, 400));
const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log('=== PRERECORDED REPLAY — recorded clips, NOT live camera recognition ===');
for (const [i, clip] of clips.entries()) {
  if (live?.state !== 'active') { console.log(`Live is ${live?.state ?? 'unknown'}: press "Start communicating" in the notch first, then Enter.`); await rl.question(''); }
  if (live?.state !== 'active') { console.log('Live still not active — stopping.'); break; }
  if (i > 0 || clips.length > 1) await rl.question(`Enter → replay ${i + 1}/${clips.length} (${clip.split('/').pop()}) `);
  const dir = mkdtempSync(join(tmpdir(), 'tacit-replay-'));
  execFileSync('ffmpeg', ['-v', 'error', '-i', clip, '-an', '-vf', 'fps=25,scale=640:-2', '-q:v', '4', join(dir, 'f%04d.jpg')]);
  const frames = readdirSync(dir).sort().slice(0, 250).map((f) => readFileSync(join(dir, f)));
  rmSync(dir, { recursive: true });
  const id = `replay-${Date.now()}`, times = frames.map((_, k) => 1000 + k * 40);
  ws.send(JSON.stringify({ type: 'visual_utterance', utteranceId: id, authorizationId: live.authorizationId, startMs: times[0], endMs: times.at(-1), endpointMs: times.at(-1)! + 400, frameTimesMs: times }));
  for (const f of frames) ws.send(f);
  const t0 = Date.now();
  while (!results.has(id) && Date.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 50));
  const h = results.get(id);
  console.log(h ? `PRERECORDED → ${h.decision} ${h.rawText ? `"${h.rawText}"` : `(${h.reason})`} — review it in the notch; Speak only if you choose` : 'no result within 30 s');
}
rl.close();
ws.close();
console.log('=== end of PRERECORDED replay ===');
