import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { BrowserCall } from './calls.ts';
import type { Stt } from './stt.ts';
import type { Tts } from './tts.ts';

class FakeWs extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  json: any[] = [];
  binary: Buffer[] = [];
  send(data: string | Buffer) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
    else this.binary.push(data);
  }
  close() {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    this.emit('close');
  }
  in(msg: unknown) {
    this.emit('message', Buffer.from(JSON.stringify(msg)), false);
  }
  pcm(samples: Int16Array) {
    this.emit('message', Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength), true);
  }
}

const tts: Tts = {
  label: 'fake-voice',
  personal: false,
  synth: async () => ({ audio: Buffer.alloc(100), mime: 'audio/mpeg', requestTs: Date.now(), firstByteTs: Date.now(), voice: 'fake-voice' }),
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const RATE = 16000;
const tone = (ms: number) => Int16Array.from({ length: (RATE * ms) / 1000 }, (_, i) => Math.round(5000 * Math.sin((2 * Math.PI * 300 * i) / RATE)));
const quiet = (ms: number) => new Int16Array((RATE * ms) / 1000);
const burst = (ws: FakeWs) => [quiet(400), tone(600), quiet(900)].forEach((x) => ws.pcm(x));

function setup(stt: Stt | null = { label: 's', transcribe: async () => ({ text: 'hello from the mic', ms: 1 }) }) {
  const ws = new FakeWs();
  const call = new BrowserCall(ws as unknown as WebSocket, tts, stt);
  const events: any[] = [];
  for (const e of ['utterance', 'transcript', 'speaking', 'end']) call.on(e, (x) => events.push([e, x]));
  return { ws, call, events };
}

describe('BrowserCall', () => {
  it('sends audio meta + one binary frame and reports played only on the caller device ack', async () => {
    const { ws, call } = setup();
    const p = call.speak('Hi.', { replyId: 'r1' });
    await tick();
    expect(ws.json.at(-1)).toMatchObject({ type: 'audio', replyId: 'r1', mime: 'audio/mpeg', voice: 'fake-voice', bytes: 100 });
    expect(ws.binary).toHaveLength(1);
    ws.in({ type: 'playback', replyId: 'r1', state: 'ended' });
    const res = await p;
    expect(res.playbackAckKind).toBe('browser-audio-ended');
    expect(res.voice).toBe('fake-voice');
  });

  it('a playback failure on the caller device is not reported as played', async () => {
    const { ws, call } = setup();
    const p = call.speak('Hi.', { replyId: 'r2' });
    await tick();
    ws.in({ type: 'playback', replyId: 'r2', state: 'failed', detail: 'NotAllowedError' });
    expect((await p).playbackAckTs).toBeUndefined();
  });

  it('caller disconnect mid-reply ends the call once', async () => {
    const { ws, call, events } = setup();
    const p = call.speak('Hi.', { replyId: 'r3' });
    await tick();
    ws.close();
    expect((await p).playbackAckTs).toBeUndefined();
    expect(events.filter((e) => e[0] === 'end')).toHaveLength(1);
    await expect(call.speak('again', { replyId: 'r4' })).rejects.toThrow(/ended/);
  });

  it('raw PCM after audio_start is transcribed server-side; audio while a reply plays is ignored', async () => {
    const { ws, call, events } = setup();
    ws.in({ type: 'audio_start', sampleRate: RATE, encoding: 'pcm_s16le' });
    burst(ws);
    await tick();
    await tick();
    expect(events.filter((e) => e[0] === 'utterance').map((e) => e[1].text)).toEqual(['hello from the mic']);
    const p = call.speak('Reply.', { replyId: 'r5' });
    await tick();
    burst(ws); // echo of our own reply
    ws.in({ type: 'playback', replyId: 'r5', state: 'ended' });
    await p;
    await tick();
    expect(events.filter((e) => e[0] === 'utterance')).toHaveLength(1);
  });

  it('rejects implausible sample rates and works without server STT', async () => {
    const a = setup();
    a.ws.in({ type: 'audio_start', sampleRate: 1000, encoding: 'pcm_s16le' });
    burst(a.ws);
    await tick();
    expect(a.events.some((e) => e[0] === 'utterance')).toBe(false);
    const b = setup(null);
    b.ws.in({ type: 'audio_start', sampleRate: RATE, encoding: 'pcm_s16le' });
    burst(b.ws);
    b.ws.in({ type: 'utterance', utteranceId: 't1', text: 'typed instead' });
    expect(b.events.filter((e) => e[0] === 'utterance').map((e) => e[1].text)).toEqual(['typed instead']);
  });
});
