/**
 * Call transports implementing the controller's CallLike.
 *  - BrowserCall: the far end is a real person on a second browser (`/#caller`) connected over WebSocket.
 *    Their browser transcribes their mic; TACIT's synthesized reply is sent as an audio file and the
 *    caller's browser reports when playback genuinely ended (`playbackAckKind: 'browser-audio-ended'`).
 *  - SimCall: development only. No audio leaves the machine; transport is labelled 'simulated'.
 */
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { CallerClientMessage, CallerServerMessage, Transport } from '../../shared/protocol.ts';
import type { CallLike, SpeakResult } from './controller.ts';
import { audioDurationMs, TtsCache, type Tts } from './tts.ts';
import { attachTranscriber, Segmenter, type Stt } from './stt.ts';

/** Upper bound on waiting for the caller's "playback ended" report beyond the audio's own length. */
const ACK_SLACK_MS = 8_000;

export class BrowserCall extends EventEmitter implements CallLike {
  readonly id = randomUUID();
  readonly transport: Transport = 'browser-ws';
  readonly startedAt = Date.now();
  private ended = false;
  private pending: { replyId: string; resolveAck: (r: { ts?: number; failed?: string }) => void } | null = null;
  /** Present while the caller streams raw mic audio for server-side STT (`audio_start`). */
  private segmenter: Segmenter | null = null;
  private readonly ttsCache: TtsCache;

  constructor(private readonly ws: WebSocket, private readonly tts: Tts, private readonly stt: Stt | null = null) {
    super();
    this.ttsCache = new TtsCache(tts, 'file');
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = data as Buffer;
        if (this.segmenter && !this.pending && buf.length >= 2) {
          this.segmenter.feed(new Int16Array(buf.buffer, buf.byteOffset, buf.length >> 1).slice());
        }
        return;
      }
      let msg: CallerClientMessage;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      this.onMessage(msg);
    });
    ws.on('close', () => this.finish('caller disconnected'));
  }

  private send(msg: CallerServerMessage): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private onMessage(msg: CallerClientMessage): void {
    const now = Date.now();
    switch (msg.type) {
      case 'interim':
        this.emit('transcript', { text: msg.text, isFinal: false });
        break;
      case 'utterance':
        this.emit('utterance', {
          utteranceId: msg.utteranceId,
          text: msg.text,
          tsSpeechStart: msg.speechStartAgoMs !== undefined ? now - msg.speechStartAgoMs : undefined,
          tsSpeechEnd: msg.speechEndAgoMs !== undefined ? now - msg.speechEndAgoMs : undefined,
          tsTranscriptFinal: now,
        });
        break;
      case 'playback':
        if (this.pending?.replyId === msg.replyId) {
          if (msg.state === 'ended') this.pending.resolveAck({ ts: now });
          if (msg.state === 'failed') this.pending.resolveAck({ failed: msg.detail ?? 'playback failed' });
        }
        break;
      case 'hangup':
        this.finish('caller hung up');
        break;
      case 'audio_start':
        this.startServerStt(msg.sampleRate);
        break;
      case 'audio_stop':
        this.segmenter?.removeAllListeners();
        this.segmenter = null;
        break;
    }
  }

  private startServerStt(sampleRate: number): void {
    const stt = this.stt;
    if (!stt || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 48000) return;
    this.segmenter?.removeAllListeners();
    const seg = new Segmenter({ sampleRate });
    this.segmenter = seg;
    attachTranscriber(seg, stt, this, { idPrefix: `${this.id}-a`, active: () => !this.ended && this.segmenter === seg });
  }

  async speak(text: string, { replyId }: { replyId: string }): Promise<SpeakResult> {
    if (this.ended) throw new Error('call has ended');
    const tts = await this.ttsCache.get(text);
    if (this.ended) throw new Error('call ended during synthesis');
    const ack = new Promise<{ ts?: number; failed?: string }>((resolve) => {
      this.pending = { replyId, resolveAck: resolve };
    });
    this.segmenter?.setEnabled(false); // echo guard: don't transcribe our own reply
    this.send({ type: 'audio', replyId, text, mime: tts.mime, voice: tts.voice, bytes: tts.audio.length });
    const firstAudioSentTs = Date.now();
    this.ws.send(tts.audio);
    const lastAudioSentTs = Date.now();
    this.emit('speaking', { replyId, state: 'first_audio' });

    const durationMs = audioDurationMs(tts.audio, tts.mime) ?? 15_000;
    const timeout = new Promise<{ timedOut: true }>((r) => setTimeout(() => r({ timedOut: true }), durationMs + ACK_SLACK_MS));
    const result = await Promise.race([ack, timeout]);
    this.pending = null;
    const seg = this.segmenter;
    if (seg) setTimeout(() => seg.setEnabled(true), 250);

    const base: SpeakResult = {
      replyId,
      ttsRequestTs: tts.requestTs,
      ttsFirstByteTs: tts.firstByteTs,
      firstAudioSentTs,
      lastAudioSentTs,
      audioMs: Math.round(durationMs),
      voice: tts.voice,
    };
    if ('ts' in result && result.ts !== undefined) {
      return { ...base, playbackAckTs: result.ts, playbackAckKind: 'browser-audio-ended' };
    }
    // Audio was delivered to the caller's browser but playback was not confirmed: report as sent, not played.
    return base;
  }

  prepare(texts: string[]): void {
    if (!this.ended) this.ttsCache.prepare(texts);
  }

  cancelSpeech(): void {
    if (!this.pending) return;
    this.send({ type: 'stop', replyId: this.pending.replyId });
    this.pending.resolveAck({ failed: 'cancelled' });
  }

  async hangup(): Promise<void> {
    this.finish('TACIT user hung up');
  }

  private finish(reason: string): void {
    if (this.ended) return;
    this.ended = true;
    this.pending?.resolveAck({ failed: 'call ended' });
    this.send({ type: 'ended', reason });
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
    this.emit('end', { reason });
  }
}

/** Development-only call: caller text is typed into the UI and replies go nowhere. */
export class SimCall extends EventEmitter implements CallLike {
  readonly id = randomUUID();
  readonly transport: Transport = 'simulated';
  readonly startedAt = Date.now();
  private n = 0;

  say(text: string): void {
    const now = Date.now();
    this.emit('utterance', { utteranceId: `sim-${++this.n}`, text, tsSpeechEnd: now, tsTranscriptFinal: now });
  }

  async speak(_text: string, { replyId }: { replyId: string }): Promise<SpeakResult> {
    const now = Date.now();
    // Nothing is synthesized or transmitted: no ttsFirstByte/playback claims beyond "handed off now".
    return { replyId, ttsRequestTs: now, ttsFirstByteTs: now, firstAudioSentTs: now, lastAudioSentTs: now, audioMs: 0 };
  }

  cancelSpeech(): void {}

  async hangup(): Promise<void> {
    this.emit('end', { reason: 'simulated call ended' });
  }
}
