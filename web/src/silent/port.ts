import type { CapturedVisualFrame } from './frameBuffer.ts';
import type { ArticulationWindow } from './articulation.ts';
import type { InputSource } from './capabilities.ts';

/** Frontend replacement boundary, NOT a backend wire protocol. Claude owns shared/protocol.ts. */
export interface SilentSpeechAvailability {
  connected: boolean; recognitionReady: boolean; supportedInputs: readonly InputSource[]; validatedInputs: readonly InputSource[]; automaticSpeechValidated: boolean;
  model: string | null; validationEvidence: string | null; reason: string;
}
export type RecognitionMode = 'display-only' | 'automatic';
export interface LiveAuthorization { id: string; callId: string; generation: string; mode: RecognitionMode }
export interface VisualUtterance extends ArticulationWindow { id: string; inputSource?: 'camera'; frames: CapturedVisualFrame[] }
/** Native/fused evidence stays opaque here; encoding must be negotiated in the shared contract. */
export interface SensorUtterance extends ArticulationWindow { id: string; inputSource: 'airpods' | 'combined'; evidence: Blob; sampleCount: number }
export type CommunicationUtterance = VisualUtterance | SensorUtterance;
export const utteranceSource = (u: CommunicationUtterance): InputSource => u.inputSource ?? 'camera';
export const utteranceBytes = (u: CommunicationUtterance) => 'frames' in u ? u.frames.reduce((n, f) => n + f.jpeg.size, 0) : u.evidence.size;
export const utteranceSamples = (u: CommunicationUtterance) => 'frames' in u ? u.frames.length : u.sampleCount;
export interface RecognitionHypothesis {
  utteranceId: string; authorizationId: string; rawText: string;
  /** A final decoder result is not by itself validation of reliable silent speech. */
  final: boolean; stable: boolean;
  uncertainty: { value: number; kind: string; calibrated: boolean } | null;
  model: string; source: 'visual-model' | 'airpods-model' | 'combined-model';
  decision: 'abstained' | 'uncertain' | 'shown' | 'accepted'; reason: string | null;
  recognitionMs: number;
}
/** Compatibility name for existing visual capture consumers. */
export type VisualHypothesis = RecognitionHypothesis;
export interface SilentSpeechPort {
  availability: SilentSpeechAvailability;
  activate(callId: string, signal: AbortSignal, input: InputSource, mode: RecognitionMode): Promise<LiveAuthorization>;
  /** Backend alone validates and delivers eligible text; browser never converts hypotheses to confirm messages. */
  submit(auth: LiveAuthorization, utterance: CommunicationUtterance, signal: AbortSignal): Promise<RecognitionHypothesis>;
  pause(auth: LiveAuthorization): void;
  interrupt(auth: LiveAuthorization): void;
  end(auth: LiveAuthorization): void;
}
export function unavailableSilentSpeechPort(connected: boolean): SilentSpeechPort {
  const unavailable = () => { throw new Error('The backend does not yet publish a validated continuous visual-speech contract.'); };
  return {
    availability: { connected, recognitionReady: false, supportedInputs: [], validatedInputs: [], automaticSpeechValidated: false, model: null, validationEvidence: null, reason: 'Silent speech recognition has not been connected and validated for automatic transmission.' },
    activate: async () => unavailable(), submit: async () => unavailable(), pause() {}, interrupt() {}, end() {},
  };
}
export function activationBlock(port: SilentSpeechPort, callId: string | null, input: InputSource = 'camera', mode: RecognitionMode = 'automatic'): string | null {
  const a = port.availability;
  if (!a.connected) return 'Connect to TACIT before starting live speech.';
  if (!a.recognitionReady) return a.reason;
  if (!a.supportedInputs.includes(input)) return 'The recognition service does not support this input source.';
  if (mode === 'automatic' && (!a.automaticSpeechValidated || !a.validationEvidence || !a.validatedInputs.includes(input))) return 'Automatic transmission is gated until silent-speech reliability is experimentally validated for this input.';
  if (!callId) return 'Connect a caller before starting live speech.';
  return null;
}
