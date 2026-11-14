// Live Silent Speech end-to-end check against a running server (no call needed; nothing is ever spoken):
// automatic mode must be refused; display-only activation; one real visual-only clip sent as timestamped JPEG frames
// exactly as the browser protocol specifies; expects a recognition_hypothesis with transmitted=false.
//   TACIT_URL=ws://localhost:8790 npm run live:check [-- clip.flv "reference text"]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import type { ServerMessage } from '../../shared/protocol.ts';
import { secrets } from './secrets.ts';

const base = process.env.TACIT_URL ?? 'ws://localhost:8790';
const clip = process.argv[2] ?? fileURLToPath(new URL('../../recognition/eval/clips/cremad/1040_IEO_NEU_XX.flv', import.meta.url));
const ref = process.argv[3] ?? "it's eleven o'clock";
const dir = mkdtempSync(join(tmpdir(), 'tacit-live-'));
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', clip, '-an', '-vf', 'fps=30', '-q:v', '4', join(dir, 'f%04d.jpg')]);
const jpegs = readdirSync(dir).sort().map((f) => readFileSync(join(dir, f)));
rmSync(dir, { recursive: true, force: true });
const times = jpegs.map((_, i) => 50_000 + (i * 1000) / 30); // monotonic ms as from performance.now()

const ws = new WebSocket(`${base}/ws?token=${secrets.userToken}`);
const fail = (m: string) => { console.error(`LIVE CHECK FAILED: ${m}`); process.exit(1); };
setTimeout(() => fail('timeout'), 90_000).unref();
let step = 0, sentAt = 0;
ws.on('open', () => ws.send(JSON.stringify({ type: 'live_control', action: 'activate', mode: 'automatic' })));
ws.on('message', (data) => {
  const m = JSON.parse(String(data)) as ServerMessage;
  if (m.type === 'live_status') {
    console.log(`live_status: ${m.status.state} ${m.status.mode} autoTransmitAllowed=${m.status.autoTransmitAllowed} — ${m.status.reason}`);
    if (step === 0 && m.status.state === 'off' && /gated/.test(m.status.reason)) { step = 1; ws.send(JSON.stringify({ type: 'live_control', action: 'activate', mode: 'display-only', inputSource: 'camera' })); }
    else if (step === 1 && m.status.state === 'active') {
      step = 2; sentAt = Date.now();
      ws.send(JSON.stringify({ type: 'visual_utterance', utteranceId: 'check-1', authorizationId: m.status.authorizationId, startMs: times[0], endMs: times.at(-1), endpointMs: times.at(-1)! + 480, frameTimesMs: times }));
      for (const j of jpegs) ws.send(j);
      console.log(`sent ${jpegs.length} JPEG frames (${Math.round(jpegs.reduce((n, j) => n + j.length, 0) / 1024)} KB)`);
    }
  }
  if (m.type === 'recognition_hypothesis') {
    const h = m.hypothesis;
    console.log(`hypothesis: ${h.decision} ${JSON.stringify(h.rawText)} (ref ${JSON.stringify(ref.toUpperCase())}) transmitted=${h.transmitted} uncertainty=${JSON.stringify(h.uncertainty)}`);
    console.log(`latency: client round trip ${Date.now() - sentAt} ms; server ${h.recognitionMs} ms; stages ${JSON.stringify(h.stages)}`);
    if (h.transmitted !== false) fail('transmitted must be false');
    if (h.decision !== 'shown') fail(`expected shown, got ${h.decision}: ${h.reason}`);
    ws.send(JSON.stringify({ type: 'live_control', action: 'end' }));
    void ownerCheck().then(() => { console.log('LIVE CHECK OK'); setTimeout(() => process.exit(0), 200); });
  }
});
ws.on('error', (e) => fail(e.message));

/** A second client (e.g. the menu-bar companion) sees Live end when the client that activated it disconnects. */
async function ownerCheck(): Promise<void> {
  const open = (u: string) => new Promise<WebSocket>((res, rej) => { const w = new WebSocket(u); w.once('open', () => res(w)); w.once('error', rej); });
  const url = `${base}/ws?token=${secrets.userToken}`;
  const watcher = await open(url), owner = await open(url);
  const states: string[] = [];
  watcher.on('message', (d) => { const m = JSON.parse(String(d)) as ServerMessage; if (m.type === 'live_status') states.push(m.status.state); });
  owner.send(JSON.stringify({ type: 'live_control', action: 'activate', mode: 'display-only', inputSource: 'camera' }));
  await new Promise((r) => setTimeout(r, 300));
  owner.close();
  await new Promise((r) => setTimeout(r, 300));
  watcher.close();
  if (states.at(-1) !== 'off' || !states.includes('active')) fail(`owner disconnect did not end Live (watcher saw ${states.join(' → ')})`);
  console.log(`owner disconnect: watcher saw Live ${states.join(' → ')}`);
}
