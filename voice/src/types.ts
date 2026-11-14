import type { EventEmitter } from 'node:events';
import type { AudioFormat } from './audio/pcm.ts';
import type { SttProvider, TtsProvider } from './providers/types.ts';

export type Transport = 'twilio-pstn' | 'twilio-client' | 'browser-ws';

/** All timestamps are Date.now() epoch milliseconds on the gateway host. */
export interface TranscriptEvent {
  utteranceId: string;
  text: string;
  isFinal: boolean;
  /** Arrival time of the first voiced caller audio of this utterance (local energy VAD; falls back to first-partial time). */
  tsFirstAudio: number;
  ts: number;
}

export interface UtteranceEvent {
  utteranceId: string;
  text: string;
  /** Local energy-VAD estimate: arrival time of the first voiced frame. */
  tsSpeechStart: number;
  /** Local energy-VAD estimate: arrival time of the last voiced frame before the provider committed. */
  tsSpeechEnd: number;
  /** When the provider's committed (final) transcript reached the gateway. */
  tsTranscriptFinal: number;
}

export type SpeakingState = 'requested' | 'first_audio' | 'sent' | 'played' | 'cancelled' | 'failed';

/**
 * What kind of acknowledgment backs a 'played' state:
 *  - 'twilio-mark'      Twilio echoed our `mark`: its media server finished playing our buffered audio
 *                       into the call leg. Proves network-side playout, NOT that a handset rendered it.
 *  - 'browser-playback' the caller page's AudioWorklet consumed the last sample of the reply and the
 *                       browser-reported output latency elapsed. Proves the remote browser rendered it
 *                       to its audio output, NOT that the speaker was audible / unmuted.
 *  - 'none-estimated'   no ack arrived in time; 'played' is only our estimate (send time + duration).
 */
export type PlaybackAckKind = 'twilio-mark' | 'browser-playback' | 'none-estimated';

export interface SpeakingEvent {
  replyId: string;
  state: SpeakingState;
  ts: number;
  /** Present on 'played'. */
  ack?: PlaybackAckKind;
  /** Present on 'cancelled' / 'failed'. */
  reason?: string;
}

export interface SpeakResult {
  replyId: string;
  ttsRequestTs: number;
  ttsFirstByteTs: number;
  firstAudioSentTs: number;
  lastAudioSentTs: number;
  /** Set ONLY when a genuine remote acknowledgment arrived; see `ack` for exactly what it proves. */
  playbackAckTs?: number;
  ack: PlaybackAckKind;
  /** Duration of the audio written to the call, derived from byte count. */
  audioMs: number;
}

export interface EndEvent {
  reason: string;
}

export type VoiceErrorCode =
  | 'not_configured'
  | 'invalid_request'
  | 'duplicate_reply'
  | 'busy'
  | 'call_ended'
  | 'cancelled'
  | 'tts_failed'
  | 'stt_failed'
  | 'transport_failed';

export class VoiceError extends Error {
  readonly code: VoiceErrorCode;
  constructor(code: VoiceErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'VoiceError';
    this.code = code;
  }
}

export interface CallSession extends EventEmitter {
  /** Unique per call, never reused (random UUID with a transport prefix). */
  readonly id: string;
  readonly transport: Transport;
  readonly startedAt: number;
  /** Non-identifying provider references (e.g. Twilio CallSid / StreamSid) for log correlation. */
  readonly meta: Readonly<Record<string, string>>;
  readonly ended: boolean;
  speak(text: string, opts: { replyId: string }): Promise<SpeakResult>;
  cancelSpeech(): void;
  hangup(): Promise<void>;

  on(event: 'transcript', listener: (e: TranscriptEvent) => void): this;
  on(event: 'utterance', listener: (e: UtteranceEvent) => void): this;
  on(event: 'speaking', listener: (e: SpeakingEvent) => void): this;
  on(event: 'end', listener: (e: EndEvent) => void): this;
  /** Non-fatal problems (STT reconnects, provider hiccups). Never throws when unhandled. */
  on(event: 'warning', listener: (e: { code: string; message: string }) => void): this;
  on(event: 'dtmf', listener: (e: { digit: string; ts: number }) => void): this;
  on(event: string, listener: (...args: any[]) => void): this;
}

export interface VoiceGatewayOptions {
  /** HTTP + WS listener for provider webhooks/streams. Default 8787. Use 0 for an ephemeral port. */
  port?: number;
  /** Bind address. Default 127.0.0.1 (the tunnel connects locally). */
  host?: string;
  /** https base URL of the tunnel; needed for Twilio webhooks + signature validation. */
  publicUrl?: string;
  /** Defaults to process.env merged over the project-root `.env` file. */
  env?: Record<string, string | undefined>;
  /** Inject providers (tests / alternative vendors). Overrides env-based selection. */
  providers?: { stt?: SttProvider; tts?: TtsProvider };
  /** Allow clearly-labelled fake providers (tone TTS, energy "transcripts") when keys are missing. Default false. */
  allowFakeProviders?: boolean;
  /** Milliseconds of extra STT suppression after playout ends, to swallow echo tails. Default 300. */
  echoTailMs?: number;
  /** How long past the estimated end of playout to wait for a provider ack. Default 3000. */
  ackGraceMs?: number;
  /** Max simultaneous calls (protects provider credits). Default 3. */
  maxConcurrentCalls?: number;
  log?: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
}

export interface VoiceGatewayStatus {
  listening: boolean;
  port?: number;
  publicUrl?: string;
  activeCalls: number;
  /** Which providers/features are configured. Flat booleans (matches shared/protocol.ts). */
  providers: Record<string, boolean>;
  /** Human-readable detail, never secret values. */
  details: {
    stt: string;
    tts: string;
    voice: string;
    twilio: string;
    browserCallUrl?: string;
    twilioVoiceWebhook?: string;
    missing: string[];
  };
}

export interface VoiceGateway extends EventEmitter {
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): VoiceGatewayStatus;
  /** Set / change the public tunnel URL after start (e.g. once cloudflared reports it). */
  setPublicUrl(url: string | undefined): void;
  /** Currently active calls. */
  calls(): CallSession[];

  on(event: 'call:start', listener: (call: CallSession) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: string, listener: (...args: any[]) => void): this;
}

export type { AudioFormat };
