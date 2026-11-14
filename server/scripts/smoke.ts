/**
 * End-to-end smoke test against a RUNNING server (npm start). Plays both sides over real WebSockets:
 * a browser-ws caller asks a question, the UI client tap-selects option 0 and key-confirms, the caller
 * receives the synthesized audio and acknowledges playback. Prints the turn's real timestamps.
 *   npm run smoke [-- "caller question"]
 * The caller here is a script, so "playback ended" is reported after the audio's duration — this proves
 * the transport and state machine, not that a human heard it.
 */
import WebSocket from 'ws';
import type { CallerServerMessage, ServerMessage, Snapshot } from '../../shared/protocol.ts';
import { turnStages } from '../../shared/metrics.ts';
import { secrets } from './secrets.ts';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseWav, toMono } from '../../voice/src/audio/wav.ts';

const base = process.env.TACIT_URL ?? 'ws://localhost:8790';
const audioMode = process.argv.includes('--audio');
const question = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--choose-ms') ?? 'Are you free for lunch tomorrow?';

function waitFor<T>(ws: WebSocket, pick: (m: any, binary: boolean) => T | undefined, ms = 20_000, label = 'step'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for: ${label}`)), ms);
    const on = (data: WebSocket.RawData, binary: boolean) => {
      const m = binary ? data : JSON.parse(String(data));
      const r = pick(m, binary);
      if (r !== undefined) {
        clearTimeout(timer);
        ws.off('message', on);
        resolve(r);
      }
    };
    ws.on('message', on);
  });
}
const open = (ws: WebSocket) => new Promise((r) => ws.once('open', r));
const snap = (pred: (s: Snapshot) => boolean) => (m: ServerMessage) => (m.type === 'snapshot' && pred(m.snapshot) ? m.snapshot : undefined);

const ui = new WebSocket(`${base}/ws?token=${secrets.userToken}`);
await open(ui);
const caller = new WebSocket(`${base}/ws/caller?invite=${secrets.callerToken}`);
await open(caller);
const accepted = await waitFor(caller, (m: CallerServerMessage) => (m.type === 'accepted' || m.type === 'rejected' ? m : undefined));
if (accepted.type !== 'accepted') throw new Error(`caller rejected: ${accepted.reason}`);

const readyP = waitFor(ui, snap((s) => s.phase === 'OPTIONS_READY'), 40_000, 'OPTIONS_READY');
if (audioMode) {
  // Server-side STT path: stream synthesized speech as PCM16 @16 kHz in real-time 20 ms frames.
  const dir = mkdtempSync(join(tmpdir(), 'tacit-smoke-'));
  execFileSync('say', ['-o', join(dir, 'q.wav'), '--file-format=WAVE', '--data-format=LEI16@16000', '--', question]);
  const pcm = toMono(parseWav(readFileSync(join(dir, 'q.wav'))));
  const frames = [new Int16Array(320 * 15), pcm, new Int16Array(320 * 60)];
  const all = new Int16Array(frames.reduce((n, f) => n + f.length, 0));
  let o = 0;
  for (const f of frames) (all.set(f, o), (o += f.length));
  caller.send(JSON.stringify({ type: 'audio_start', sampleRate: 16000, encoding: 'pcm_s16le' }));
  const t0 = Date.now();
  for (let i = 0; i * 320 < all.length; i++) {
    caller.send(Buffer.from(all.buffer, i * 640, Math.min(640, all.byteLength - i * 640)));
    await new Promise((r) => setTimeout(r, Math.max(0, t0 + (i + 1) * 20 - Date.now())));
  }
} else {
  caller.send(JSON.stringify({ type: 'utterance', utteranceId: 'smoke-1', text: question, speechEndAgoMs: 300 }));
}
const ready = await readyP;
const set = ready.candidateSet!;
console.log(`caller ${audioMode ? 'audio (server STT heard)' : 'text'}: "${ready.transcript.at(-1)?.text}"\noptions (${set.model}, ${set.generationMs} ms):`);
for (const o of set.options) console.log(`  [${o.index}] ${o.text}  (${o.intent})`);

ui.send(JSON.stringify({ type: 'candidates_displayed', candidateSetId: set.id, ts: Date.now() }));
// Optional simulated choosing time (a SCRIPT pause, not a human): --choose-ms 3000
const chooseIdx = process.argv.indexOf('--choose-ms');
if (chooseIdx > 0) await new Promise((r) => setTimeout(r, Number(process.argv[chooseIdx + 1])));
ui.send(JSON.stringify({ type: 'tap_select', candidateSetId: set.id, index: 0 }));
const awaiting = await waitFor(ui, snap((s) => s.phase === 'AWAITING_CONFIRMATION'), 20_000, 'AWAITING_CONFIRMATION');
const p = awaiting.proposal!;

// Confirming before confirmableAt must be ignored.
ui.send(JSON.stringify({ type: 'confirm', proposalId: p.id, source: 'key' }));
await new Promise((r) => setTimeout(r, Math.max(0, p.confirmableAt - Date.now()) + 50));
const audioMeta = waitFor(caller, (m: CallerServerMessage, bin) => (!bin && m.type === 'audio' ? m : undefined), 20_000, 'caller audio meta');
const audioBytes = waitFor(caller, (m: Buffer, bin) => (bin ? m : undefined), 20_000, 'caller audio bytes');
ui.send(JSON.stringify({ type: 'confirm', proposalId: p.id, source: 'key' }));

const meta = await audioMeta;
const bytes = await audioBytes;
console.log(`caller received audio: ${meta.mime}, ${bytes.length} bytes, voice=${meta.voice}, text="${meta.text}"`);
const durMs = bytes.toString('ascii', 0, 4) === 'RIFF' ? ((bytes.length - 44) / bytes.readUInt32LE(28)) * 1000 : 1000;
caller.send(JSON.stringify({ type: 'playback', replyId: meta.replyId, state: 'started' }));
setTimeout(() => caller.send(JSON.stringify({ type: 'playback', replyId: meta.replyId, state: 'ended' })), durMs);

const done = await waitFor(ui, snap((s) => s.phase === 'LISTENING' && s.lastCompletedTurn?.outcome === 'spoken'), 20_000, 'turn spoken');
const turn = done.lastCompletedTurn!;
console.log(`turn outcome=${turn.outcome} spoken="${turn.spokenText}" ack=${turn.playbackAckKind} speech.state=${done.speech?.state}`);
console.log('stages (ms; selection/confirmation are a SCRIPT, not a human; playback includes audio length):');
console.log(' ', JSON.stringify(turnStages(turn)));

caller.send(JSON.stringify({ type: 'hangup' }));
await waitFor(ui, snap((s) => s.phase === 'DISCONNECTED'));
console.log('SMOKE OK');
ui.close();
caller.close();
