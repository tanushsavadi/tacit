import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { encodeMulaw } from '../../voice/src/audio/mulaw.ts';
import { TwilioCall } from './twilio.ts';
import type { Stt } from './stt.ts';
import type { Tts } from './tts.ts';

class FakeWs extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  sent: any[] = [];
  closedWith: number | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code = 1000) {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    this.closedWith = code;
    this.emit('close', code);
  }
  in(msg: unknown) {
    this.emit('message', Buffer.from(JSON.stringify(msg)));
  }
}

const RATE = 8000;
const tone = (ms: number) => encodeMulaw(Int16Array.from({ length: (RATE * ms) / 1000 }, (_, i) => Math.round(5000 * Math.sin((2 * Math.PI * 300 * i) / RATE))));
const quiet = (ms: number) => encodeMulaw(new Int16Array((RATE * ms) / 1000));
const media = (buf: Buffer) => ({ event: 'media', streamSid: 'MZ1', media: { track: 'inbound', payload: buf.toString('base64') } });
const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeTts() {
  const calls: string[] = [];
  const tts: Tts = {
    label: 'fake-tts',
    personal: false,
    async synth(text) {
      calls.push(text);
      return { audio: Buffer.alloc(800, 0x7f), mime: 'audio/x-mulaw;rate=8000', requestTs: Date.now(), firstByteTs: Date.now(), voice: 'fake-voice' };
    },
  };
  return { tts, calls };
}

function setup(sttImpl?: Stt['transcribe']) {
  const ws = new FakeWs();
  const { tts, calls } = fakeTts();
  const texts = ['first thing', 'second thing'];
  const stt: Stt = { label: 'fake-stt', transcribe: sttImpl ?? (async () => ({ text: texts.shift() ?? '', ms: 1 })) };
  const call = new TwilioCall(ws as unknown as WebSocket, tts, stt, (t) => t === 'good');
  const events: any[] = [];
  for (const e of ['utterance', 'transcript', 'speaking', 'end', 'authorized', 'unauthorized']) call.on(e, (x) => events.push([e, x]));
  return { ws, call, events, ttsCalls: calls };
}

const start = (ws: FakeWs, token = 'good') => ws.in({ event: 'start', streamSid: 'MZ1', start: { callSid: 'CA1', customParameters: { token } } });
const speakBurst = (ws: FakeWs) => {
  ws.in(media(quiet(400)));
  ws.in(media(tone(600)));
  ws.in(media(quiet(900)));
};

describe('TwilioCall', () => {
  it('closes an unauthorized stream and ignores its audio', async () => {
    const { ws, events } = setup();
    start(ws, 'forged');
    speakBurst(ws);
    await tick();
    expect(ws.closedWith).toBe(1008);
    expect(events.map((e) => e[0])).toEqual(['unauthorized']);
  });

  it('transcribes caller speech after authorization and keeps utterances in order', async () => {
    let first = true;
    const { ws, events } = setup(async () => {
      if (first) {
        first = false;
        await new Promise((r) => setTimeout(r, 30)); // slow first transcription
        return { text: 'first thing', ms: 30 };
      }
      return { text: 'second thing', ms: 1 };
    });
    start(ws);
    speakBurst(ws);
    speakBurst(ws);
    await new Promise((r) => setTimeout(r, 60));
    const utts = events.filter((e) => e[0] === 'utterance').map((e) => e[1].text);
    expect(utts).toEqual(['first thing', 'second thing']);
    const u = events.find((e) => e[0] === 'utterance')[1];
    expect(u.tsSpeechEnd).toBeGreaterThanOrEqual(u.tsSpeechStart);
  });

  it('an STT failure returns the caller state to listening (empty interim)', async () => {
    const { ws, events } = setup(async () => {
      throw new Error('whisper crashed');
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    start(ws);
    speakBurst(ws);
    await tick();
    await tick();
    err.mockRestore();
    const transcripts = events.filter((e) => e[0] === 'transcript').map((e) => e[1].text);
    expect(transcripts).toEqual(['…', '']);
    expect(events.some((e) => e[0] === 'utterance')).toBe(false);
  });

  it('speaks as μ-law media + mark and reports twilio-mark only when Twilio echoes the mark', async () => {
    const { ws, call } = setup();
    start(ws);
    const p = call.speak('Yes, that works.', { replyId: 'r1' });
    await tick();
    await tick();
    const out = ws.sent.filter((m) => m.event === 'media');
    const bytes = out.reduce((n, m) => n + Buffer.from(m.media.payload, 'base64').length, 0);
    expect(bytes).toBe(800);
    expect(ws.sent.at(-1)).toEqual({ event: 'mark', streamSid: 'MZ1', mark: { name: 'r1' } });
    ws.in({ event: 'mark', streamSid: 'MZ1', mark: { name: 'other' } }); // unrelated mark is ignored
    ws.in({ event: 'mark', streamSid: 'MZ1', mark: { name: 'r1' } });
    const res = await p;
    expect(res.playbackAckKind).toBe('twilio-mark');
    expect(res.audioMs).toBe(100);
  });

  it('ignores caller audio while a reply is playing (echo guard)', async () => {
    const { ws, call, events } = setup();
    start(ws);
    const p = call.speak('Hello.', { replyId: 'r2' });
    await tick();
    await tick();
    speakBurst(ws);
    ws.in({ event: 'mark', streamSid: 'MZ1', mark: { name: 'r2' } });
    await p;
    await tick();
    expect(events.some((e) => e[0] === 'utterance')).toBe(false);
  });

  it('cancelSpeech sends clear and resolves without a playback claim', async () => {
    const { ws, call } = setup();
    start(ws);
    const p = call.speak('Long reply.', { replyId: 'r3' });
    await tick();
    await tick();
    call.cancelSpeech();
    const res = await p;
    expect(ws.sent.some((m) => m.event === 'clear')).toBe(true);
    expect(res.playbackAckTs).toBeUndefined();
  });

  it('caller hang-up mid-reply ends the call once and later speech is refused', async () => {
    const { ws, call, events } = setup();
    start(ws);
    const p = call.speak('Bye.', { replyId: 'r4' });
    await tick();
    await tick();
    ws.in({ event: 'stop', streamSid: 'MZ1' });
    const res = await p;
    expect(res.playbackAckTs).toBeUndefined();
    ws.emit('close');
    expect(events.filter((e) => e[0] === 'end')).toHaveLength(1);
    await expect(call.speak('again', { replyId: 'r5' })).rejects.toThrow(/ended/);
  });

  it('uses pre-synthesized audio for the confirmed option', async () => {
    const { ws, call, ttsCalls } = setup();
    start(ws);
    call.prepare(['A', 'B', 'C']);
    expect(ttsCalls).toEqual(['A', 'B', 'C']);
    const p = call.speak('B', { replyId: 'r6' });
    await tick();
    await tick();
    ws.in({ event: 'mark', streamSid: 'MZ1', mark: { name: 'r6' } });
    await p;
    expect(ttsCalls).toEqual(['A', 'B', 'C']); // no second synthesis
  });
});
