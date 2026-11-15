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
 * My Voice: the voice the user chose to be heard with. Voices are described only by what they are (name, language,
 * provider, quality) — never by gender or personality; the user decides by listening (`voice_preview`).
 * Stable ids: 'apple:<AVSpeechSynthesisVoice.identifier>' (installed macOS voice, rendered on this Mac),
 * 'elevenlabs:<voiceId>' (the user's own consented clone, network), 'system:default' (macOS `say` default voice; used
 * when the voice helper is not built).
 */
export interface VoiceControlRange { min: number; max: number; default: number; step: number }
export interface VoiceOption {
  id: string;
  name: string;
  /** BCP-47, e.g. 'en-US'. */
  locale: string;
  /** Primary language subtag, e.g. 'en'. */
  language: string;
  provider: 'apple-speech' | 'macos-say' | 'elevenlabs';
  quality: 'default' | 'enhanced' | 'premium' | null;
  /** 'apple-personal-voice' is listed for status only: Apple does not let apps capture or route it. */
  kind: 'system' | 'personal-clone' | 'apple-personal-voice';
  /** Apple marks it as a novelty/effect voice (Bells, Zarvox…). UIs should keep these out of the main list. */
  novelty: boolean;
  available: boolean;
  unavailableReason: string | null;
  /** Rendered on this Mac (no network). */
  local: boolean;
  /** Only the controls this provider really supports; absent = not adjustable. */
  controls: { rate?: VoiceControlRange; pitch?: VoiceControlRange };
}
export interface VoiceSettings { voiceId: string; rate?: number; pitch?: number }
export interface VoiceStatus {
  /** Bumped whenever the effective voice or its settings change. Echo it as `voiceRevision` in speak_* requests. */
  revision: number;
  /** The user's choice ('default' = never chosen / reset; 'saved' = loaded from disk; 'user' = chosen this run). */
  selected: VoiceSettings & { source: 'default' | 'saved' | 'user' };
  /** The voice that will speak approved messages now. Differs from `selected` only when `fallback` explains why. */
  effective: VoiceSettings & { label: string };
  fallback: string | null;
  /** The choice is stored on this Mac (server/data/voice-prefs.json, 0600). */
  persisted: boolean;
  persistError: string | null;
  voices: VoiceOption[];
  /** Built-in preview phrases (index = `sample` in voice_preview). */
  samples: string[];
  engine: { state: 'starting' | 'ready' | 'unavailable'; reason: string | null };
  applePersonalVoice: {
    authorization: 'notDetermined' | 'denied' | 'unsupported' | 'authorized' | 'unknown';
    /** Literal false: Apple does not allow apps to capture Personal Voice audio, and macOS has no supported
     *  speech-into-call API for apps. Use Apple's own Live Speech for Personal Voice in calls. */
    usableInCalls: false;
    reason: string;
  };
  custom: { provider: 'elevenlabs'; configured: boolean; available: boolean; reason: string | null };
  /** Result of the last voice_select (for the client that sent `requestId`). */
  lastChange: { requestId: string | null; ok: boolean; reason: string | null; at: number } | null;
}
/**
 * Private preview: played on this Mac's own sound output, never into the virtual microphone, never queued with call
 * speech. Refused when the Mac's sound output is (or contains) the virtual microphone.
 */
export interface VoicePreviewState {
  previewId: string;
  voiceId: string;
  text: string;
  state: 'synthesizing' | 'playing' | 'done' | 'stopped' | 'refused' | 'failed';
  reason: string | null;
  /** Name of the local output device the preview plays on. */
  output: string | null;
  timings: { requestedAt: number; synthEndAt?: number; playStartAt?: number; endedAt?: number };
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
  /** Still false: no reliability gate is validated. Real-time speech below is an explicit, unvalidated user choice. */
  autoTransmitAllowed: false;
  /**
   * Additive (2026-11-15): true only while the user has explicitly turned on REAL-TIME (unreviewed) speech for this
   * activation (`live_control activate mode:'automatic' acknowledgeUnreviewed:true`). Recognised words are then spoken
   * verbatim without review. Never persisted; any new activation without the acknowledgement turns it off.
   */
  unreviewed?: boolean;
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
/**
 * Recognizer model profile (additive, 2026-11-15). 'base' = the unchanged pretrained model. Any other profile is a local,
 * EXPERIMENTAL personal overlay (recognition/tacit_vsr/profiles.py): `reviewRequired` is then true and the server refuses
 * real-time (unreviewed) speech — only the user's explicit Speak on a reviewed candidate can voice its words.
 */
export interface RecognizerProfileTag { id: string; experimental: boolean; reviewRequired: boolean }
export interface RecognizerProfile extends RecognizerProfileTag {
  label: string;
  /** Set when the requested profile could not be applied and the recognizer fell back to the base model. */
  error: string | null;
  requested: string | null;
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
  /**
   * Phrase mode (additive, optional): the best phrase of a FIXED list scored against the same video, accepted only
   * under a frozen rule (`rule`). Display-only like rawText — never spoken, never copied into typed speech. null when
   * the utterance abstained or the recogniser did not compute it.
   */
  phraseMatch?: PhraseMatch | null;
  /** Live generation this utterance was recognised under (additive). A `speak_reviewed` must echo it. */
  generation?: number;
  /** Other N-best decodes of the same video (raw model output, display-only, additive). Excludes `rawText`. */
  alternatives?: string[];
  /** Profile of the recognizer that produced this result (additive). reviewRequired → never spoken without review. */
  recognizerProfile?: RecognizerProfileTag;
  /**
   * Reviewed speech (additive): the EXACT texts the server will accept in `speak_reviewed` for this utterance — raw
   * text (index 0), N-best alternatives, and the phrase match only if accepted. Present only when decision 'shown'.
   */
  reviewCandidates?: ReviewCandidate[];
  /** Exclusive server-clock deadline (epoch ms): at/after this, approval is refused and pending speech cancelled. */
  reviewExpiresAt?: number;
}

export type ReviewCandidateKind = 'raw' | 'alternative' | 'phrase';
export interface ReviewCandidate {
  kind: ReviewCandidateKind;
  /** Position in `reviewCandidates` (0 = raw). */
  index: number;
  text: string;
  /** Lowercase hex SHA-256 of the UTF-8 bytes of `text`. */
  textHash: string;
}

export interface PhraseMatch {
  rule: string;
  /** Normalised phrase text (A–Z, apostrophes). Present even when rejected, for diagnostics. */
  phrase: string;
  runnerUp: string;
  accepted: boolean;
  reason: string | null;
  /** Length-normalised joint-score margin over the runner-up phrase (uncalibrated). */
  margin: number;
  /** Free open-vocabulary score minus phrase score, per token (uncalibrated). */
  garbageGap: number;
  listSize: number;
  /** phrase-rule-v2 (additive): free hypothesis attention log-prob per token; v2 rejects below −1.5 (uncalibrated). */
  freeAttPerToken?: number | null;
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
  /** My Voice: the effective voice id and VoiceStatus.revision that new requests would be bound to. */
  voiceId?: string;
  voiceRevision?: number;
  queued: number;
  /** Whether recognised (visual) speech may be spoken automatically. Literal false until validated. */
  recognizedSpeechAllowed: false;
  reason: string;
}
/**
 * 'typed' = user-authored AAC text (explicit send). 'recognized' = visual model output spoken AUTOMATICALLY (gated;
 * never sent today). 'reviewed-recognition' = one exact displayed recognition candidate the user picked and pressed
 * Speak on (`speak_reviewed`). 'user-corrected' = text the user edited from a recognition candidate before pressing
 * Speak — user-authored, NOT model output.
 */
export type SpeechSource = 'typed' | 'recognized' | 'reviewed-recognition' | 'user-corrected';
export type ReviewChoice = ReviewCandidateKind | 'edited';
export interface SpeechDelivery {
  requestId: string;
  /** The voice-output authorization and generation this request was accepted under (null/current for refusals). */
  outputAuthorizationId: string | null;
  generation: number;
  source: SpeechSource;
  text: string;
  /**
   * queued → synthesizing → routing → rendered; or refused / interrupted / failed.
   * 'rendered' = this Mac finished writing the audio into the virtual mic. It is NOT remote delivery.
   */
  state: 'queued' | 'synthesizing' | 'routing' | 'rendered' | 'refused' | 'interrupted' | 'failed';
  reason: string | null;
  voice: string | null;
  /** My Voice id this request was bound to when it was accepted (later voice changes never alter it). */
  voiceId?: string | null;
  /** Typed speech only: true when it began as a Presence AI suggestion the user approved (provenance, not a new source). */
  assisted?: boolean;
  remoteAudibility: 'unknown';
  /** Reviewed/corrected speech only: which utterance and candidate it came from (for 'edited': the edit's basis). */
  review?: { utteranceId: string; liveAuthorizationId: string; candidate: ReviewChoice; index: number };
  /** Server clock (ms since epoch). */
  timings: { requestedAt: number; synthStartAt?: number; synthEndAt?: number; firstAudioAt?: number; renderedAt?: number; endedAt?: number };
}

export interface ServiceStatus {
  gemini: { configured: boolean; model: string | null };
  logging?: TurnLogStatus;
  voicePolicy?: VoicePolicyStatus;
  recognition: { reachable: boolean; model: string | null; device: string | null; checkedAt: number | null; live?: LiveRecognitionCapability; profile?: RecognizerProfile };
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
// ───────────────────────────── Presence (Help Me Respond) ─────────────────────────────
/**
 * The user's own communicative intent. TACIT never decides it. 'share_view', 'disagree' and 'phrase_this' need the
 * user's own point (`userPoint`); the model only words it — it never invents an opinion, experience or fact.
 */
export type RespondIntent = 'clarify' | 'share_view' | 'disagree' | 'buy_time' | 'phrase_this';
/** Where the context came from. Never 'live' until a capture adapter is verified end to end. */
export type RespondContextSource = 'user-provided' | 'sample';
/** Optional, user-chosen wording style kept on the user's Mac. Not a personal fact. */
export type RespondTone = 'brief' | 'warm' | 'direct';
export interface RespondStatus {
  /** True when a real language model is configured for suggestions. False = no AI: the client must say so. */
  available: boolean;
  /** e.g. 'Google Gemini'. null when unavailable. */
  provider: string | null;
  models: string[];
  /** Plain-language note on where the context goes when the user asks for wording. */
  dataNotice: string;
  reason: string | null;
}
export interface RespondDraft {
  /** Short, speakable suggestion (≤ 200 chars). Never spoken until the user presses Speak. */
  text: string;
}
export interface RespondSuggestion {
  requestId: string;
  state: 'generating' | 'ready' | 'refused' | 'failed' | 'cancelled';
  intent: RespondIntent;
  contextSource: RespondContextSource;
  drafts: RespondDraft[];
  /** The question/point being answered, quoted VERBATIM from the supplied context (null when none or not verifiable). */
  focus: string | null;
  model: string | null;
  reason: string | null;
  generationMs: number | null;
  /** Drafts the model returned that failed grounding checks and were removed. */
  removed: number;
}

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
  /**
   * Live Silent Speech session control. `activate` with mode 'automatic' is refused unless `acknowledgeUnreviewed: true`
   * (the user's explicit real-time choice, unvalidated) and the server allows it (TACIT_REALTIME != 'off').
   */
  | { type: 'live_control'; action: 'activate' | 'pause' | 'resume' | 'interrupt' | 'end'; mode?: LiveMode; inputSource?: 'camera'; acknowledgeUnreviewed?: boolean }
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
  | { type: 'speak_typed'; requestId: string; outputAuthorizationId: string; text: string;
      /** Recommended: the output_status.generation the user saw when sending. A mismatch (pause/interrupt since) is refused. */
      outputGeneration?: number;
      /** Recommended: the voice_status.revision the user saw. A mismatch (voice changed since) is refused. */
      voiceRevision?: number;
      /** Presence: the text started as an AI suggestion that the user reviewed/edited and explicitly chose to speak. */
      assisted?: boolean }
  /**
   * Reviewed recognised speech: the user explicitly picked candidate `index` of the latest accepted utterance and pressed
   * Speak. Echo `reviewCandidates[index]` exactly (kind, text, textHash) plus the output and Live authorizations and
   * generations the user saw. Spoken at most once per utterance; refused when paused, stale, expired, superseded by a
   * newer accepted utterance header, or on any mismatch. candidate 'edited' = user-corrected text based on `index`: `text` is
   * free (≤ 500 chars), `textHash` = SHA-256 of `text`, spoken with source 'user-corrected'.
   */
  | { type: 'speak_reviewed'; requestId: string; outputAuthorizationId: string; outputGeneration: number;
      liveAuthorizationId: string; liveGeneration: number; utteranceId: string;
      candidate: ReviewChoice; index: number; text: string; textHash: string;
      /** Recommended: the voice_status.revision the user saw. A mismatch (voice changed since) is refused. */
      voiceRevision?: number }
  /** My Voice: choose the voice approved messages are spoken with (persisted). voiceId null = back to the default. */
  | { type: 'voice_select'; requestId?: string; voiceId: string | null; rate?: number; pitch?: number }
  /** Re-read the installed voices (e.g. after installing one in System Settings). */
  | { type: 'voice_refresh' }
  /** Private preview on this Mac's speakers. `text` (≤ 200 chars, spoken verbatim) or `sample` (index into samples). */
  | { type: 'voice_preview'; previewId: string; voiceId: string; rate?: number; pitch?: number; text?: string; sample?: number }
  | { type: 'voice_preview_stop' }
  /**
   * Presence: ask for short wording for the user's chosen intent, grounded only in `context` (≤ 4000 chars, untrusted
   * data — never instructions) and the user's own `userPoint` (≤ 500). The reply goes only to the requesting client. A newer
   * request cancels the older one. Suggestions are NEVER spoken by the server; speaking needs a separate speak_typed.
   */
  | { type: 'respond_suggest'; requestId: string; intent: RespondIntent; context: string; contextSource: RespondContextSource;
      userPoint?: string; tone?: RespondTone }
  | { type: 'respond_cancel'; requestId: string };

export type ServerMessage =
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'airpods_motion'; t: number; pitch: number; roll: number; yaw: number; rotX: number; rotY: number; rotZ: number }
  | { type: 'airpods_gesture'; t: number; gesture: 'nod' | 'shake'; accepted: boolean; reason: string }
  | { type: 'cue'; cue: 'options' | 'proposed' | 'confirmed' | 'cancelled' | 'uncertain' }
  /** Sent once to each authenticated user connection. `callerInvitePath` = `/?invite=…#caller` (append to the origin). */
  | { type: 'session_info'; callerInvitePath: string; authRequired: boolean }
  | { type: 'live_status'; status: LiveStatus }
  | { type: 'recognition_hypothesis'; hypothesis: RecognitionHypothesis }
  /** A valid newer header has revoked all previous review choices, even before inference starts. */
  | { type: 'review_invalidated'; authorizationId: string; generation: number; utteranceId: string }
  /** On connect and after every change (control, route state, queue). */
  | { type: 'output_status'; status: SpeechOutputStatus }
  /** Every state change of one speech request (exactly one terminal state: rendered/refused/interrupted/failed). */
  | { type: 'speech_delivery'; delivery: SpeechDelivery }
  /** My Voice registry and selection: on connect and after every change. */
  | { type: 'voice_status'; status: VoiceStatus }
  /** Every state change of the private preview (exactly one terminal state: done/stopped/refused/failed). */
  | { type: 'voice_preview'; preview: VoicePreviewState }
  /** Presence: on connect; whether a real model is configured and where context goes. */
  | { type: 'respond_status'; status: RespondStatus }
  /** Presence: progress/result for one respond_suggest, sent only to the client that asked. */
  | { type: 'respond_suggestion'; suggestion: RespondSuggestion };

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
