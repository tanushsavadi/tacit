// End-to-end check against a RUNNING TACIT server + its recognizer (no microphone, no call, voice output off):
// health reports the recognizer profile; with an experimental profile real-time activation is refused; one clip's
// JPEG frames go through the real /ws Live path and come back as a displayed, profile-tagged, never-transmitted result.
//   npx tsx scripts/profile-e2e.ts <clip.mp4> [http://127.0.0.1:8799]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { secrets } from './secrets.ts';

const [clip, base = 'http://127.0.0.1:8799'] = process.argv.slice(2);
if (!clip) { console.error('usage: profile-e2e.ts <clip.mp4> [base]'); process.exit(2); }
const health = await (await fetch(`${base}/api/health`, { headers: { authorization: `Bearer ${secrets.userToken}` } })).json() as any;
console.log('profile:', JSON.stringify(health.services.recognition.profile ?? null), '| live:', JSON.stringify(health.live));
const dir = mkdtempSync(join(tmpdir(), 'tacit-e2e-'));
execFileSync('ffmpeg', ['-v', 'error', '-i', clip, '-an', '-vf', 'fps=25,scale=640:-2', '-q:v', '4', join(dir, 'f%04d.jpg')]);
const frames = readdirSync(dir).sort().map((f) => readFileSync(join(dir, f)));
rmSync(dir, { recursive: true });
const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${encodeURIComponent(secrets.userToken)}`);
const msgs: any[] = [];
const wait = (pred: (m: any) => boolean, ms = 30000) => new Promise<any>((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout')), ms);
  const check = () => { const m = msgs.find(pred); if (m) { clearTimeout(t); res(m); } else setTimeout(check, 20); };
  check();
});
ws.on('message', (d, isBinary) => { if (!isBinary) msgs.push(JSON.parse(String(d))); });
await new Promise((r) => ws.once('open', r));
await new Promise((r) => setTimeout(r, 500)); // let the on-connect status messages arrive first
const ctl = (m: object) => ws.send(JSON.stringify({ type: 'live_control', ...m }));
msgs.length = 0;
ctl({ action: 'activate', mode: 'automatic', acknowledgeUnreviewed: true, inputSource: 'camera' });
const rt = await wait((m) => m.type === 'live_status');
console.log('real-time request →', rt.status.state, rt.status.mode, '|', rt.status.reason);
msgs.length = 0;
ctl({ action: 'activate', mode: 'display-only', inputSource: 'camera' });
const st = (await wait((m) => m.type === 'live_status' && m.status.state === 'active')).status;
const n = Math.min(frames.length, 250);
const times = Array.from({ length: n }, (_, i) => 1000 + i * 40);
ws.send(JSON.stringify({ type: 'visual_utterance', utteranceId: 'e2e-1', authorizationId: st.authorizationId, startMs: 1000, endMs: times.at(-1), endpointMs: times.at(-1)! + 400, frameTimesMs: times }));
for (let i = 0; i < n; i++) ws.send(frames[i]!);
const h = (await wait((m) => m.type === 'recognition_hypothesis')).hypothesis;
console.log('result:', JSON.stringify({ decision: h.decision, rawText: h.rawText, reason: h.reason, recognizerProfile: h.recognizerProfile, transmitted: h.transmitted, candidates: h.reviewCandidates?.map((c: any) => c.text), model: h.model, ms: h.recognitionMs }));
const spoken = msgs.filter((m) => m.type === 'speech_delivery');
console.log('speech deliveries during the run:', spoken.length);
ctl({ action: 'end' });
await new Promise((r) => setTimeout(r, 200));
ws.close();
