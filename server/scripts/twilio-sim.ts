/**
 * Twilio Media Streams PROTOCOL SIMULATOR — not a real phone call.
 * Exercises the PSTN path end to end against a RUNNING server (npm start):
 *   POST /twilio/voice (TwiML) → WS /twilio/media → real spoken audio (macOS `say`, μ-law 8 kHz, paced 20 ms frames)
 *   → server segmenter + whisper.cpp → 3 candidates → UI tap-select + key-confirm → μ-law reply media + mark
 *   → this script echoes the mark after the audio's duration (as Twilio does when playback reaches it).
 *   npm run twilio:sim [-- "caller sentence"]
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import type { ServerMessage, Snapshot } from '../../shared/protocol.ts';
import { encodeMulaw, MULAW_SILENCE } from '../../voice/src/audio/mulaw.ts';
import { parseWav, toMono } from '../../voice/src/audio/wav.ts';
import { turnStages } from '../../shared/metrics.ts';
import { secrets } from './secrets.ts';

const http = process.env.TACIT_HTTP ?? 'http://localhost:8790';
const ws = http.replace(/^http/, 'ws');
const sentence = process.argv[2] ?? 'Hi, this is the dentist office. Can you come in on Thursday at three?';

// 1. Webhook
const hook = await fetch(`${http}/twilio/voice`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ CallSid: 'CAsim', From: '+15550000000', To: '+15551111111' }),
});
const xml = await hook.text();
if (!xml.includes('<Stream url=')) throw new Error(`unexpected TwiML: ${xml}`);
const streamToken = xml.match(/name="token" value="([^"]+)"/)?.[1];
if (!streamToken) throw new Error('TwiML has no stream token');
console.log(`TwiML ok: ${xml.match(/url="([^"]+)"/)?.[1]} (+ one-time stream token)`);

// 2. Audio for the caller sentence
const dir = mkdtempSync(join(tmpdir(), 'tacit-sim-'));
execFileSync('say', ['-o', join(dir, 'q.wav'), '--file-format=WAVE', '--data-format=LEI16@8000', '--', sentence]);
const ulaw = encodeMulaw(toMono(parseWav(readFileSync(join(dir, 'q.wav')))));

const snap = (pred: (s: Snapshot) => boolean) => (m: ServerMessage) => (m.type === 'snapshot' && pred(m.snapshot) ? m.snapshot : undefined);
function waitFor<T>(sock: WebSocket, pick: (m: any) => T | undefined, ms = 30_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    const on = (d: WebSocket.RawData) => {
      const r = pick(JSON.parse(String(d)));
      if (r !== undefined) {
        clearTimeout(timer);
        sock.off('message', on);
        resolve(r);
      }
    };
    sock.on('message', on);
  });
}
const open = (s: WebSocket) => new Promise((r) => s.once('open', r));

const ui = new WebSocket(`${ws}/ws?token=${secrets.userToken}`);
await open(ui);
const media = new WebSocket(`${ws}/twilio/media`);
await open(media);
const streamSid = 'MZsim';
media.send(JSON.stringify({ event: 'connected', protocol: 'Call', version: '1.0.0' }));
media.send(JSON.stringify({ event: 'start', streamSid, start: { callSid: 'CAsim', customParameters: { token: streamToken }, tracks: ['inbound'], mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 } } }));

// Collect outbound media from the server.
let outBytes = 0;
let markName: string | null = null;
const markSeen = new Promise<string>((resolve) => {
  media.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.event === 'media') outBytes += Buffer.from(m.media.payload, 'base64').length;
    if (m.event === 'mark') resolve((markName = m.mark.name));
  });
});

// 3. Stream: 400 ms silence, the sentence, 1.5 s silence — paced in real time.
const frames: Buffer[] = [];
const sil = Buffer.alloc(160, MULAW_SILENCE);
for (let i = 0; i < 20; i++) frames.push(sil);
for (let o = 0; o < ulaw.length; o += 160) frames.push(Buffer.from(ulaw.subarray(o, o + 160)));
for (let i = 0; i < 75; i++) frames.push(sil);
const streamStart = Date.now();
for (const [i, f] of frames.entries()) {
  media.send(JSON.stringify({ event: 'media', streamSid, media: { track: 'inbound', chunk: String(i), timestamp: String(i * 20), payload: f.toString('base64') } }));
  await new Promise((r) => setTimeout(r, Math.max(0, streamStart + (i + 1) * 20 - Date.now())));
}
console.log(`streamed ${(frames.length * 20) / 1000}s of caller audio`);

const ready = await waitFor(ui, snap((s) => s.phase === 'OPTIONS_READY'));
const set = ready.candidateSet!;
console.log(`whisper heard: "${ready.transcript.at(-1)?.text}"`);
console.log(`options (${set.model}):`);
for (const o of set.options) console.log(`  [${o.index}] ${o.text}`);

ui.send(JSON.stringify({ type: 'tap_select', candidateSetId: set.id, index: 0 }));
const aw = await waitFor(ui, snap((s) => s.phase === 'AWAITING_CONFIRMATION'));
await new Promise((r) => setTimeout(r, Math.max(0, aw.proposal!.confirmableAt - Date.now()) + 50));
ui.send(JSON.stringify({ type: 'confirm', proposalId: aw.proposal!.id, source: 'key' }));

const name = await markSeen;
const audioMs = outBytes / 8;
console.log(`server sent ${outBytes} bytes μ-law (${Math.round(audioMs)} ms) + mark ${name.slice(0, 8)}…`);
setTimeout(() => media.send(JSON.stringify({ event: 'mark', streamSid, mark: { name: markName } })), audioMs);

const done = await waitFor(ui, snap((s) => s.lastCompletedTurn?.outcome === 'spoken' && s.phase === 'LISTENING'));
const turn = done.lastCompletedTurn!;
console.log(`turn spoken="${turn.spokenText}" ack=${turn.playbackAckKind}`);
console.log('stages (ms; selection/confirmation are a SCRIPT; playback = SIMULATED mark echo, not delivery proof):');
console.log(' ', JSON.stringify(turnStages(turn)));

media.send(JSON.stringify({ event: 'stop', streamSid }));
await waitFor(ui, snap((s) => s.phase === 'DISCONNECTED'));
console.log('TWILIO PROTOCOL SIM OK (simulated Twilio, real audio + real STT)');
ui.close();
media.close();
