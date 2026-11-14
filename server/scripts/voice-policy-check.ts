/**
 * Live check of the voice-authorization rule against a RUNNING server whose personal voice is configured but
 * failing: a confirmed reply must send NO audio (no silent system-voice substitution) and must show why; after
 * the user approves the system voice, the same reply is sent and labelled SUBSTITUTED.
 *   TACIT_URL=ws://localhost:8791 npm run voice:policy-check
 */
import WebSocket from 'ws';
import type { ServerMessage, Snapshot } from '../../shared/protocol.ts';
import { secrets } from './secrets.ts';

const base = process.env.TACIT_URL ?? 'ws://localhost:8790';
const ui = new WebSocket(`${base}/ws?token=${secrets.userToken}`);
const caller = new WebSocket(`${base}/ws/caller?invite=${secrets.callerToken}`);
await Promise.all([ui, caller].map((s) => new Promise((r) => s.once('open', r))));
let audio: any[] = [];
caller.on('message', (d, bin) => !bin && JSON.parse(String(d)).type === 'audio' && audio.push(JSON.parse(String(d))));
let last = null as Snapshot | null;
ui.on('message', (d) => {
  const m = JSON.parse(String(d)) as ServerMessage;
  if (m.type === 'snapshot') last = m.snapshot;
});
const until = async (pred: (s: Snapshot) => boolean, ms = 20_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (last && pred(last)) return last;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timeout; phase=${last?.phase}`);
};
const selectAndConfirm = async () => {
  const s = await until((x) => x.phase === 'OPTIONS_READY' || x.phase === 'ERROR' || x.phase === 'CANCELLED');
  ui.send(JSON.stringify({ type: 'tap_select', candidateSetId: s.candidateSet!.id, index: 0 }));
  const a = await until((x) => x.phase === 'AWAITING_CONFIRMATION');
  await new Promise((r) => setTimeout(r, a.proposal!.confirmableAt - Date.now() + 50));
  ui.send(JSON.stringify({ type: 'confirm', proposalId: a.proposal!.id, source: 'key' }));
};

console.log('voicePolicy at start:', JSON.stringify(last?.services.voicePolicy ?? (await until(() => true)).services.voicePolicy));
caller.send(JSON.stringify({ type: 'utterance', utteranceId: 'vp-1', text: 'Are you free tomorrow?' }));
await selectAndConfirm();
const err = await until((x) => x.phase === 'ERROR');
await new Promise((r) => setTimeout(r, 500));
console.log(`1) personal voice failing, no approval → phase=${err.phase}; audio frames to caller: ${audio.length}`);
console.log(`   notice: ${err.notice?.message}`);

ui.send(JSON.stringify({ type: 'set_voice_policy', allowSystemFallback: true }));
await new Promise((r) => setTimeout(r, 200));
await selectAndConfirm();
await until(() => audio.length > 0);
caller.send(JSON.stringify({ type: 'playback', replyId: audio[0].replyId, state: 'ended' }));
const done = await until((x) => x.speech?.state === 'played' || x.speech?.state === 'sent');
console.log(`2) after user approval → audio sent; caller label: "${audio[0].voice}"`);
console.log(`   snapshot speech.voice: "${done.speech?.voice}"`);
const ok = err.phase === 'ERROR' && audio.length === 1 && /SUBSTITUTED/.test(audio[0].voice);
console.log(ok ? 'VOICE POLICY CHECK OK' : 'VOICE POLICY CHECK FAILED');
caller.send(JSON.stringify({ type: 'hangup' }));
setTimeout(() => process.exit(ok ? 0 : 1), 300);
