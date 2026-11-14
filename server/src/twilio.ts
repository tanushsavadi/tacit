/**
 * Twilio PSTN transport via Media Streams (bidirectional `<Connect><Stream>`).
 *   POST /twilio/voice   → TwiML that connects the call audio to wss://<public host>/twilio/media
 *   WS   /twilio/media   → inbound μ-law 8 kHz frames → Segmenter → STT → 'utterance';
 *                          replies sent as μ-law `media` + a `mark`; Twilio echoes the mark when playback
 *                          reaches it, which is the genuine playback acknowledgment ('twilio-mark').
 */
import { EventEmitter } from 'node:events';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { Transport } from '../../shared/protocol.ts';
import { decodeMulaw } from '../../voice/src/audio/mulaw.ts';
import type { CallLike, SpeakResult } from './controller.ts';
import { attachTranscriber, Segmenter, type Stt } from './stt.ts';
import { TtsCache, type Tts } from './tts.ts';

const ACK_SLACK_MS = 8_000;
const FRAME_BYTES = 160; // 20 ms of μ-law at 8 kHz

type TwilioInbound =
  | { event: 'connected' }
  | { event: 'start'; streamSid: string; start: { callSid: string; customParameters?: Record<string, string> } }
  | { event: 'media'; streamSid: string; media: { track?: string; payload: string } }
  | { event: 'mark'; streamSid: string; mark: { name: string } }
  | { event: 'dtmf'; dtmf: { digit: string } }
  | { event: 'stop'; streamSid: string };

export class TwilioCall extends EventEmitter implements CallLike {
  readonly id = randomUUID();
  readonly transport: Transport = 'twilio-pstn';
  readonly startedAt = Date.now();
  callSid: string | null = null;
  private streamSid: string | null = null;
  private ended = false;
  private readonly segmenter = new Segmenter({ sampleRate: 8000 });
  private pending: { replyId: string; resolve: (r: { ts?: number; failed?: string }) => void } | null = null;
  private started: Promise<void>;
  private readonly ttsCache: TtsCache;
  private markStarted!: () => void;

  /**
   * Emits 'authorized' after a `start` event whose customParameters.token passes `authorize`;
   * otherwise closes the stream (emitting 'unauthorized'). Audio is ignored until authorized.
   */
  private authorized = false;

  constructor(
    private readonly ws: WebSocket,
    private readonly tts: Tts,
    private readonly stt: Stt,
    private readonly authorize: (token: string | undefined) => boolean,
  ) {
    super();
    this.ttsCache = new TtsCache(tts, 'ulaw_8000');
    this.started = new Promise((r) => (this.markStarted = r));
    attachTranscriber(this.segmenter, stt, this, { idPrefix: this.id, active: () => !this.ended });
    ws.on('message', (data) => {
      let msg: TwilioInbound;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      this.onMessage(msg);
    });
    ws.on('close', () => this.finish('media stream closed'));
  }

  private onMessage(msg: TwilioInbound): void {
    switch (msg.event) {
      case 'start':
        if (!this.authorize(msg.start.customParameters?.token)) {
          this.emit('unauthorized');
          this.ended = true; // never attached to the controller; no 'end' needed
          this.ws.close(1008, 'unauthorized');
          return;
        }
        this.authorized = true;
        this.streamSid = msg.streamSid;
        this.callSid = msg.start.callSid;
        this.markStarted();
        this.emit('authorized');
        break;
      case 'media':
        if (!this.authorized) return;
        if (msg.media.track && msg.media.track !== 'inbound') return;
        this.segmenter.feed(decodeMulaw(Buffer.from(msg.media.payload, 'base64')));
        break;
      case 'mark':
        if (this.pending?.replyId === msg.mark.name) this.pending.resolve({ ts: Date.now() });
        break;
      case 'stop':
        this.finish('call ended by Twilio');
        break;
    }
  }

  private send(obj: unknown): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(obj));
  }

  async speak(text: string, { replyId }: { replyId: string }): Promise<SpeakResult> {
    if (this.ended) throw new Error('call has ended');
    await this.started;
    const tts = await this.ttsCache.get(text);
    if (this.ended || !this.streamSid) throw new Error('call ended during synthesis');
    // Don't transcribe our own reply if the far end echoes it back.
    this.segmenter.setEnabled(false);
    const ack = new Promise<{ ts?: number; failed?: string }>((resolve) => (this.pending = { replyId, resolve }));
    const firstAudioSentTs = Date.now();
    for (let off = 0; off < tts.audio.length; off += FRAME_BYTES * 25) {
      this.send({ event: 'media', streamSid: this.streamSid, media: { payload: tts.audio.subarray(off, off + FRAME_BYTES * 25).toString('base64') } });
    }
    this.send({ event: 'mark', streamSid: this.streamSid, mark: { name: replyId } });
    const lastAudioSentTs = Date.now();
    this.emit('speaking', { replyId, state: 'first_audio' });

    const audioMs = Math.round(tts.audio.length / 8);
    const timeout = new Promise<{ timedOut: true }>((r) => setTimeout(() => r({ timedOut: true }), audioMs + ACK_SLACK_MS));
    const result = await Promise.race([ack, timeout]);
    this.pending = null;
    if (!this.ended) setTimeout(() => this.segmenter.setEnabled(true), 250);

    const base: SpeakResult = { replyId, ttsRequestTs: tts.requestTs, ttsFirstByteTs: tts.firstByteTs, firstAudioSentTs, lastAudioSentTs, audioMs, voice: tts.voice };
    if ('ts' in result && result.ts !== undefined) return { ...base, playbackAckTs: result.ts, playbackAckKind: 'twilio-mark' };
    return base;
  }

  prepare(texts: string[]): void {
    if (!this.ended) this.ttsCache.prepare(texts);
  }

  cancelSpeech(): void {
    if (!this.pending || !this.streamSid) return;
    this.send({ event: 'clear', streamSid: this.streamSid });
    this.pending.resolve({ failed: 'cancelled' });
  }

  /** Closing the media stream ends `<Connect>`; with no further TwiML verbs Twilio hangs up. */
  async hangup(): Promise<void> {
    this.finish('TACIT user hung up');
  }

  private finish(reason: string): void {
    if (this.ended) return;
    this.ended = true;
    this.segmenter.setEnabled(false);
    this.pending?.resolve({ failed: 'call ended' });
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
    this.emit('end', { reason });
  }
}

// ───────────────────────────── webhook ─────────────────────────────

/** Twilio request signature: base64(HMAC-SHA1(authToken, fullUrl + sorted(key+value)...)). */
export function validTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string | undefined): boolean {
  if (!signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = createHmac('sha1', authToken).update(data).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `streamToken` is a one-time value; Twilio returns it in the media stream's `start.customParameters`. */
export function twiml(streamUrl: string, streamToken: string): string {
  const esc = (v: string) => v.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${esc(streamUrl)}"><Parameter name="token" value="${esc(streamToken)}"/></Stream></Connect></Response>`;
}
