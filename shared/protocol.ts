/**
 * TACIT shared protocol — the single source of truth for what the server
 * controller publishes and what the web client may send. Imported by both
 * `server/` and `web/` via relative path. Types only (plus tiny constants).
 */

export type Phase =
  | 'DISCONNECTED'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'GENERATING'
  | 'OPTIONS_READY'
  | 'SELECTING'
  | 'AWAITING_CONFIRMATION'
  | 'SYNTHESIZING'
  | 'SPEAKING'
  | 'ABSTAINED'
  | 'CANCELLED'
  | 'ERROR';

/** Phases in which the current candidate set is on screen and a selection may begin. */
export const SELECTABLE_PHASES: readonly Phase[] = ['OPTIONS_READY', 'ABSTAINED', 'CANCELLED'];

export type Transport = 'twilio-pstn' | 'twilio-client' | 'browser-ws' | 'simulated';

export type SelectionSource = 'mouth' | 'tap' | 'head';
export type ConfirmSource = 'nod' | 'key' | 'tap' | 'dwell';
export type CancelSource = 'shake' | 'key' | 'tap' | 'timeout' | 'superseded';

export type CandidateMode = 'baseline' | 'viseme-aware';

export interface CandidateOption {
  index: number;
  text: string;
  /** Short label of the meaning this option carries (e.g. "agree", "decline"). */
  intent: string;
  /** Which of the model's phrasings for this intent was picked (0 = the model's first choice). */
  phrasingIndex: number;
}

/** Text-side estimate of how visually different the options are when mouthed. Heuristic, not a measurement. */
export interface DistinguishabilityInfo {
  /** Smallest pairwise viseme distance among the displayed options (0..1, higher = easier to tell apart). */
  minPairwise: number;
  /** Same statistic for the baseline choice (the model's first phrasing of each intent). */
  baselineMinPairwise: number;
  matrix: number[][];
  source: string;
}

export interface CandidateSet {
  id: string;
  turnId: string;
  forUtteranceId: string;
  mode: CandidateMode;
  options: CandidateOption[];
  distinguishability: DistinguishabilityInfo | null;
  model: string;
  generatedAt: number;
  generationMs: number;
  /** How many times alternatives were requested within this turn. */
  alternativesRound: number;
}

export interface RecognitionScore {
  text: string;
  logLik: number;
  lengthNormLogLik: number;
  /** Softmax over the displayed candidates only — a relative ranking, NOT a calibrated probability. */
  relativeProb: number;
}

export interface RecognitionResult {
  candidateSetId: string;
  model: string;
  method: string;
  scores: RecognitionScore[];
  bestIndex: number;
  margin: number;
  freeDecode: { text: string; lengthNormLogLik: number } | null;
  abstain: boolean;
  abstainReason: string | null;
  framesUsed: number;
  fps: number;
  window?: { startMs: number; endMs: number };
  timings: { decodeMs: number; preprocessMs: number; inferenceMs: number; totalMs: number };
}

export interface Proposal {
  id: string;
  candidateSetId: string;
  index: number;
  text: string;
  source: SelectionSource;
  proposedAt: number;
  /** Confirmations before this instant are ignored (guards against a gesture already in flight). */
  confirmableAt: number;
  expiresAt: number;
  /** How a non-tap selection was made, e.g. 'neutral-calibrated-mouth-gestures-v1' (gesture mapping, not lip-reading). */
  method?: string;
}

export type SpeechState = 'requested' | 'first_audio' | 'sent' | 'played' | 'cancelled' | 'failed';

export interface SpeechStatus {
  replyId: string;
  text: string;
  state: SpeechState;
  confirmedBy: ConfirmSource;
  requestedAt: number;
  /** The voice that actually spoke this reply (set once audio was produced; names any fallback). */
  voice?: string;
}

export interface TranscriptEntry {
  role: 'caller' | 'user';
  text: string;
  ts: number;
  /** For user entries: how the reply was selected and confirmed. */
  via?: { selection: SelectionSource; confirm: ConfirmSource };
}

/** Real event timestamps (epoch ms) for one conversational turn. Absent = the event did not happen. */
export interface TurnTimestamps {
  callerSpeechEnd?: number;
  transcriptFinal?: number;
  generationRequested?: number;
  candidatesReady?: number;
  candidatesDisplayed?: number;
  selectionStart?: number;
  recognitionResult?: number;
  proposal?: number;
  confirmation?: number;
  ttsRequest?: number;
  ttsFirstByte?: number;
  firstAudioSent?: number;
  lastAudioSent?: number;
  /** Only set when the transport provides a genuine acknowledgment; see `playbackAckKind`. */
  playbackAck?: number;
}

export type TurnOutcome = 'spoken' | 'superseded' | 'rejected_all' | 'call_ended' | 'error' | 'open';

export interface TurnRecord {
  turnId: string;
  sessionId: string;
  transport: Transport;
  utteranceId: string;
  callerText: string;
  candidateMode: CandidateMode | null;
  options: string[];
  t: TurnTimestamps;
  selectionAttempts: number;
  abstentions: number;
  cancellations: number;
  alternativesRequested: number;
  selectionSource: SelectionSource | null;
  /** Proposal.method of the confirmed proposal, when any. */
  selectionMethod?: string;
  confirmSource: ConfirmSource | null;
  chosenIndex: number | null;
  spokenText: string | null;
  /** Summary of the recognition that produced the confirmed proposal (mouth selections only). */
  recognition: Pick<RecognitionResult, 'method' | 'model' | 'margin' | 'bestIndex' | 'timings'> | null;
  playbackAckKind: string | null;
  /** Duration of the synthesized reply audio, when known. Playback-ack latency includes this. */
  audioMs?: number;
  /** Evaluation trials only: the option the participant was asked to select. */
  targetIndex: number | null;
  outcome: TurnOutcome;
}

export interface AirpodsStatus {
  helper: 'not_started' | 'running' | 'exited' | 'unavailable';
  authorized: string | null;
  available: boolean;
  connected: boolean;
  detail: string | null;
  lastGesture: { gesture: 'nod' | 'shake'; t: number; accepted: boolean; reason: string } | null;
  lastMotionAt: number | null;
}

/**
 * Persistent turn logging. Default 'off' (nothing written to disk). 'timings' = timestamps/outcomes only, no
 * conversation text. 'full' = includes caller text, options and the spoken reply. Files older than
 * `retentionDays` are pruned at startup and hourly; `delete_turn_logs` erases everything immediately.
 */
export type TurnLogMode = 'off' | 'timings' | 'full';
export interface TurnLogStatus {
  mode: TurnLogMode;
  retentionDays: number;
  /** Who enabled it: 'user' = consent given in the UI this session, 'env' = operator config (TACIT_LOG_TURNS). */
  source: 'default' | 'env' | 'user';
  changedAt: number | null;
  storedTurns: number;
}

/** Which voice speaks, and what the USER has approved this session (`set_voice_policy`). Defaults: both false. */
export interface VoicePolicyStatus {
  personalConfigured: boolean;
  /** Configured and passed the startup check (cloned voice). */
  personalAvailable: boolean;
  personalVoice: string | null;
  personalError: string | null;
  systemVoice: string;
  /** If true, the system voice may be substituted when the personal voice fails (audio labelled SUBSTITUTED). */
  allowSystemFallback: boolean;
  /** If true, the personal voice may pre-synthesize displayed options before confirmation (never sent before it). */
  personalPresynth: boolean;
  /** Whether speculative pre-synthesis currently runs (always for the local system voice unless TTS_PRESYNTH=off). */
  presynthActive: boolean;
}

/**
 * Live Silent Speech (protocol 'tacit-live-v1'). The user activates Live once per session; utterances are recognised
 * and shown to the user. `autoTransmitAllowed` stays false until a recognition reliability gate is validated on real
 * silent recordings — the server never speaks recognised text before then, whatever the client requests.
 */
export type LiveMode = 'display-only' | 'automatic';
export interface LiveStatus {
  authorizationId: string | null;
  /** Incremented on activate/pause/interrupt/end; in-flight results from an older generation are dropped. */
  generation: number;
  state: 'off' | 'active' | 'paused';
  mode: LiveMode;
  autoTransmitAllowed: false;
  reason: string;
}
export interface LiveRecognitionCapability {
  protocol: 'tacit-live-v1';
  supportedInputs: readonly 'camera'[];
  /** Always false until validated; `validationEvidence` will reference the measurement when it exists. */
  automaticSpeechValidated: false;
  validationEvidence: null;
  maxFrames: number;
  maxBytes: number;
  maxDurationMs: number;
}
/** Raw model output for one utterance. `rawText` is never rewritten or completed by any language model. */
export interface RecognitionHypothesis {
  utteranceId: string;
  authorizationId: string;
  rawText: string;
  final: true;
  /** Not yet computed (needs incremental decoding). */
  stable: false;
  uncertainty: { value: number; kind: 'nbest-margin-per-token'; calibrated: false } | null;
  model: string;
  source: 'visual-model';
  decision: 'shown' | 'abstained';
  reason: string | null;
  /** Server receipt of the last frame → result, ms; plus the service's own stage timings. */
  recognitionMs: number;
  stages: Record<string, number> | null;
  gate: Record<string, number | string | null> | null;
  /** Always false in this protocol version. */
  transmitted: false;
}

/**
 * Virtual-microphone output (macOS): `macos/TacitRoute` (tacit-route) plays TACIT speech into ONE selected device —
 * normally BlackHole — which the user picks as the microphone in FaceTime/Zoom/Meet. Local observations only:
 * nothing here can tell whether a remote person heard anything.
 */
export interface VoiceRouteStatus {
  state: 'unconfigured' | 'starting' | 'ready' | 'unavailable' | 'error';
  deviceName: string | null;
  deviceUid: string | null;
  sampleRate: number | null;
  /** Gain applied before the device (compensates the measured route loss; see `npm run route:check`). */
  gainDb: number;
  calibrated: boolean;
  /** Bundle ids of processes currently reading the virtual mic as an input (e.g. 'us.zoom.xos'). null = unknown. */
  readers: string[] | null;
  /** e.g. system output routed into the virtual mic (echo risk), device muted. */
  warnings: string[];
  reason: string | null;
}
/** Session-level authorization for TACIT to speak into the output route. One `enable` per session; pause/stop cut audio. */
export interface SpeechOutputStatus {
  authorizationId: string | null;
  /** Bumped on enable/pause/resume/stop and on any interrupt; work from an older generation is never played. */
  generation: number;
  state: 'off' | 'ready' | 'paused';
  route: VoiceRouteStatus;
  /** The TTS voice that will speak (VoiceRouter label; never a substituted personal voice without set_voice_policy). */
  voice: string;
  queued: number;
  /** Whether recognised (visual) speech may be spoken automatically. Literal false until validated. */
  recognizedSpeechAllowed: false;
  reason: string;
}
/** 'typed' = user-authored AAC text (explicit send). 'recognized' = visual model output (gated; never sent today). */
export type SpeechSource = 'typed' | 'recognized';
export interface SpeechDelivery {
  requestId: string;
  source: SpeechSource;
  text: string;
  /**
   * queued → synthesizing → routing → rendered; or refused / interrupted / failed.
   * 'rendered' = this Mac finished writing the audio into the virtual mic. It is NOT remote delivery.
   */
  state: 'queued' | 'synthesizing' | 'routing' | 'rendered' | 'refused' | 'interrupted' | 'failed';
  reason: string | null;
  voice: string | null;
  remoteAudibility: 'unknown';
  /** Server clock (ms since epoch). */
  timings: { requestedAt: number; synthStartAt?: number; synthEndAt?: number; firstAudioAt?: number; renderedAt?: number; endedAt?: number };
}

export interface ServiceStatus {
  gemini: { configured: boolean; model: string | null };
  logging?: TurnLogStatus;
  voicePolicy?: VoicePolicyStatus;
  recognition: { reachable: boolean; model: string | null; device: string | null; checkedAt: number | null; live?: LiveRecognitionCapability };
  /** Present when the virtual-microphone route is configured on this server (macOS). */
  voiceRoute?: VoiceRouteStatus;
  voice: { listening: boolean; publicUrl: string | null; providers: Record<string, boolean> };
}

export interface Snapshot {
  seq: number;
  now: number;
  phase: Phase;
  sessionId: string | null;
  transport: Transport | null;
  callStartedAt: number | null;
  callerInterim: string;
  transcript: TranscriptEntry[];
  candidateSet: CandidateSet | null;
  recognition: RecognitionResult | null;
  proposal: Proposal | null;
  speech: SpeechStatus | null;
  /** Why the last proposal was withdrawn / why recognition abstained — for the banner. */
  notice: { kind: 'abstained' | 'cancelled' | 'error' | 'info'; message: string; ts: number } | null;
  turn: TurnRecord | null;
  lastCompletedTurn: TurnRecord | null;
  pendingCallerUtterance: boolean;
  candidateModeSetting: CandidateMode;
  airpods: AirpodsStatus;
  services: ServiceStatus;
}

/** Messages the web client sends to the server over the control WebSocket. */
export type ClientMessage =
  | { type: 'candidates_displayed'; candidateSetId: string; ts: number }
  | { type: 'selection_started'; candidateSetId: string; ts: number }
  | { type: 'selection_aborted'; candidateSetId: string; reason: string }
  | { type: 'tap_select'; candidateSetId: string; index: number }
  /** Webcam head-pose selection (dwell on a left/centre/right zone). Not lip-reading. */
  | { type: 'head_select'; candidateSetId: string; index: number }
  /**
   * Webcam mouth-GESTURE mapping (open/smile/pucker → option), NOT lip-reading and not a RecognitionResult.
   * Creates a `source:'mouth'` proposal with the same confirmableAt/expiry/stale guards; confirmation stays separate.
   */
  | { type: 'mouth_gesture_select'; candidateSetId: string; index: number; method: string; window?: { startMs: number; endMs: number }; framesUsed?: number }
  /** Webcam head gesture: nod confirms the given proposal, shake cancels. */
  | { type: 'head_gesture'; gesture: 'nod' | 'shake'; proposalId?: string }
  | { type: 'confirm'; proposalId: string; source: Exclude<ConfirmSource, 'nod'> }
  | { type: 'cancel'; source: Exclude<CancelSource, 'shake' | 'timeout' | 'superseded'> }
  | { type: 'request_alternatives' }
  | { type: 'reject_all' }
  | { type: 'set_candidate_mode'; mode: CandidateMode }
  | { type: 'set_trial_target'; index: number | null }
  | { type: 'sim_call_start' }
  | { type: 'sim_caller_says'; text: string }
  | { type: 'sim_call_end' }
  | { type: 'hangup' }
  /** Explicit user consent choice for persistent logging (see TurnLogStatus). */
  | { type: 'set_turn_logging'; mode: TurnLogMode }
  | { type: 'delete_turn_logs' }
  /** Explicit user choices for this session; see VoicePolicyStatus. */
  | { type: 'set_voice_policy'; allowSystemFallback?: boolean; personalPresynth?: boolean }
  /** Live Silent Speech session control. `activate` with mode 'automatic' is refused while autoTransmitAllowed=false. */
  | { type: 'live_control'; action: 'activate' | 'pause' | 'resume' | 'interrupt' | 'end'; mode?: LiveMode; inputSource?: 'camera' }
  /**
   * One endpointed utterance from the camera: followed by exactly `frameTimesMs.length` binary WebSocket messages,
   * each one JPEG frame, in order. Times are the browser's monotonic capture timestamps (performance.now, ms).
   */
  | { type: 'visual_utterance'; utteranceId: string; authorizationId: string; startMs: number; endMs: number; endpointMs: number; frameTimesMs: number[] }
  /** Session authorization for speaking into the virtual mic. `enable` returns a fresh authorizationId in output_status. */
  | { type: 'output_control'; action: 'enable' | 'pause' | 'resume' | 'stop' }
  /**
   * User-authored typed speech (AAC fallback), sent by an explicit user action. Spoken only when output is enabled,
   * not paused, the authorization matches and the route is ready. Never presented as recognised speech.
   */
  | { type: 'speak_typed'; requestId: string; outputAuthorizationId: string; text: string };

export type ServerMessage =
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'airpods_motion'; t: number; pitch: number; roll: number; yaw: number; rotX: number; rotY: number; rotZ: number }
  | { type: 'airpods_gesture'; t: number; gesture: 'nod' | 'shake'; accepted: boolean; reason: string }
  | { type: 'cue'; cue: 'options' | 'proposed' | 'confirmed' | 'cancelled' | 'uncertain' }
  /** Sent once to each authenticated user connection. `callerInvitePath` = `/?invite=…#caller` (append to the origin). */
  | { type: 'session_info'; callerInvitePath: string; authRequired: boolean }
  | { type: 'live_status'; status: LiveStatus }
  | { type: 'recognition_hypothesis'; hypothesis: RecognitionHypothesis }
  /** On connect and after every change (control, route state, queue). */
  | { type: 'output_status'; status: SpeechOutputStatus }
  /** Every state change of one speech request (exactly one terminal state: rendered/refused/interrupted/failed). */
  | { type: 'speech_delivery'; delivery: SpeechDelivery };

/**
 * Remote-caller channel (`/ws/caller`): a second browser (phone/laptop) acting as the far end of a
 * `browser-ws` call. The caller's browser transcribes its own microphone and plays TACIT's replies.
 * Times are sent as "ms ago" so server timestamps stay valid across machines with skewed clocks.
 */
export type CallerClientMessage =
  | { type: 'hello'; name?: string }
  | { type: 'interim'; text: string }
  | { type: 'utterance'; utteranceId: string; text: string; speechStartAgoMs?: number; speechEndAgoMs?: number }
  /** Sent when an `audio` reply started / finished playing on the caller's speaker. */
  | { type: 'playback'; replyId: string; state: 'started' | 'ended' | 'failed'; detail?: string }
  | { type: 'hangup' }
  /**
   * Alternative to sending `utterance` text: stream the caller's microphone as binary frames of mono
   * little-endian 16-bit PCM at `sampleRate` (8000–48000) after this message; the server endpoints and
   * transcribes it (whisper.cpp). Frames received while a reply is playing are ignored (echo guard).
   */
  | { type: 'audio_start'; sampleRate: number; encoding: 'pcm_s16le' }
  | { type: 'audio_stop' };

export type CallerServerMessage =
  | { type: 'accepted'; sessionId: string }
  | { type: 'rejected'; reason: string }
  /** Followed immediately by one binary frame containing the audio file (`mime`). */
  | { type: 'audio'; replyId: string; text: string; mime: string; voice: string; bytes: number }
  /** Stop playing a reply (user cancelled during speech). */
  | { type: 'stop'; replyId: string }
  | { type: 'ended'; reason: string };
