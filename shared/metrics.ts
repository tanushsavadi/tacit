/**
 * Per-stage durations for one turn, computed only from real timestamps (undefined = not measured).
 * Human stages (selection, confirmation) are reported separately from system stages and must never be
 * summed into "system latency".
 */
import type { TurnRecord } from './protocol.ts';

export interface TurnStages {
  /** Caller stopped speaking → final transcript (endpointing wait + STT). */
  transcriptionMs?: number;
  /** Generation requested → candidates ready (LLM or labelled fallback). */
  generationMs?: number;
  /** Candidates ready → painted on the user's screen. */
  displayMs?: number;
  /** HUMAN: candidates displayed → a reply proposed (user choosing). */
  selectionMs?: number;
  /** HUMAN: proposal → confirmation (includes the deliberate confirm guard). */
  confirmationMs?: number;
  /** TTS request → first audio byte available. With pre-synthesis this overlaps the user's choosing time. */
  synthesisMs?: number;
  /** Confirmation → first audio sent: what the user actually waits after confirming. */
  postConfirmMs?: number;
  /** First audio byte → first audio sent to the transport. */
  sendMs?: number;
  /** First audio sent → remote device reported playback ENDED (includes the reply's own duration). */
  playbackMs?: number;
  /** Reply audio length, if known. */
  audioMs?: number;
  /** transcription + generation + postConfirm: machine-attributable delay (excludes human time, audio duration,
   *  and any synthesis that ran in parallel with the user's choosing). */
  systemMs?: number;
}

const d = (a?: number, b?: number) => (a !== undefined && b !== undefined ? b - a : undefined);

export function turnStages(turn: Pick<TurnRecord, 't' | 'audioMs'>): TurnStages {
  const t = turn.t;
  const s: TurnStages = {
    transcriptionMs: d(t.callerSpeechEnd, t.transcriptFinal),
    generationMs: d(t.generationRequested, t.candidatesReady),
    displayMs: d(t.candidatesReady, t.candidatesDisplayed),
    selectionMs: d(t.candidatesDisplayed ?? t.candidatesReady, t.proposal),
    confirmationMs: d(t.proposal, t.confirmation),
    synthesisMs: d(t.ttsRequest, t.ttsFirstByte),
    sendMs: d(t.ttsFirstByte, t.firstAudioSent),
    postConfirmMs: d(t.confirmation, t.firstAudioSent),
    playbackMs: d(t.firstAudioSent, t.playbackAck),
    audioMs: turn.audioMs,
  };
  const sys = [s.transcriptionMs, s.generationMs, s.postConfirmMs];
  if (sys.every((x) => x !== undefined)) s.systemMs = sys.reduce((a, b) => a! + b!, 0);
  return s;
}
