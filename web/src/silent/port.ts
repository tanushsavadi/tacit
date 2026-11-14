import type { CapturedVisualFrame } from './frameBuffer.ts';
import type { ArticulationWindow } from './articulation.ts';

/** Frontend replacement boundary, NOT a backend wire protocol. Claude owns shared/protocol.ts. */
export interface SilentSpeechAvailability {
  connected: boolean; visualModelReady: boolean; automaticSpeechValidated: boolean;
  model: string | null; validationEvidence: string | null; reason: string;
}
export interface LiveAuthorization { id: string; callId: string; generation: string }
export interface VisualUtterance extends ArticulationWindow { id: string; frames: CapturedVisualFrame[] }
export interface VisualHypothesis {
  utteranceId: string; authorizationId: string; rawText: string;
  /** A final decoder result is not by itself validation of reliable silent speech. */
  final: boolean; stable: boolean;
  uncertainty: { value: number; kind: string; calibrated: boolean } | null;
  model: string; source: 'visual-model';
  decision: 'abstained' | 'uncertain' | 'accepted'; reason: string | null;
  recognitionMs: number;
}
export interface SilentSpeechPort {
  availability: SilentSpeechAvailability;
  activate(callId: string, signal: AbortSignal): Promise<LiveAuthorization>;
  /** Backend alone validates and delivers eligible text; browser never converts hypotheses to confirm messages. */
  submit(auth: LiveAuthorization, utterance: VisualUtterance, signal: AbortSignal): Promise<VisualHypothesis>;
  pause(auth: LiveAuthorization): void;
  interrupt(auth: LiveAuthorization): void;
  end(auth: LiveAuthorization): void;
}
export function unavailableSilentSpeechPort(connected: boolean): SilentSpeechPort {
  const unavailable = () => { throw new Error('The backend does not yet publish a validated continuous visual-speech contract.'); };
  return {
    availability: { connected, visualModelReady: false, automaticSpeechValidated: false, model: null, validationEvidence: null, reason: 'Visual speech recognition has not been connected and validated for automatic transmission.' },
    activate: async () => unavailable(), submit: async () => unavailable(), pause() {}, interrupt() {}, end() {},
  };
}
export function activationBlock(port: SilentSpeechPort, callId: string | null): string | null {
  const a = port.availability;
  if (!a.connected) return 'Connect to TACIT before starting live speech.';
  if (!a.visualModelReady) return a.reason;
  if (!a.automaticSpeechValidated || !a.validationEvidence) return 'Automatic transmission is gated until silent-speech reliability is experimentally validated.';
  if (!callId) return 'Connect a caller before starting live speech.';
  return null;
}
