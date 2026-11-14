/**
 * TACIT application controller — the authoritative conversation state machine.
 *
 *   LISTENING → TRANSCRIBING → GENERATING → OPTIONS_READY → SELECTING
 *     → AWAITING_CONFIRMATION → SYNTHESIZING → SPEAKING → LISTENING
 *   (+ ABSTAINED, CANCELLED, DISCONNECTED, ERROR)
 *
 * Safety invariants enforced here (and covered by controller.test.ts):
 *  1. Nothing is spoken without an intentional confirmation of the proposal currently on screen.
 *  2. A recognition result or confirmation for an old candidate set / old proposal is dropped.
 *  3. One reply at most per confirmation; a second confirm cannot trigger a second speak.
 *  4. Audio is only ever sent to the call the turn belongs to; results arriving after the
 *     call ended or changed are discarded.
 */
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  AirpodsStatus,
  CancelSource,
  CandidateMode,
  CandidateOption,
  CandidateSet,
  ConfirmSource,
  DistinguishabilityInfo,
  Phase,
  Proposal,
  RecognitionResult,
  SelectionSource,
  ServiceStatus,
  Snapshot,
  SpeechState,
  SpeechStatus,
  TranscriptEntry,
  Transport,
  TurnOutcome,
  TurnRecord,
} from '../../shared/protocol.ts';

export interface SpeakResult {
  replyId: string;
  ttsRequestTs: number;
  ttsFirstByteTs: number;
  firstAudioSentTs: number;
  lastAudioSentTs: number;
  /** Present only when the transport genuinely acknowledged playout. */
  playbackAckTs?: number;
  /** What the acknowledgment proves, e.g. "twilio-mark" or "browser-audio-ended". */
  playbackAckKind?: string;
  audioMs: number;
  /** The voice that actually produced the audio (names any fallback). */
  voice?: string;
}

/** The subset of the voice gateway's CallSession the controller depends on. */
export interface CallLike extends EventEmitter {
  id: string;
  transport: Transport;
  startedAt: number;
  speak(text: string, opts: { replyId: string }): Promise<SpeakResult>;
  cancelSpeech(): void;
  hangup(): Promise<void>;
  /** Optional: pre-synthesize the displayed options locally. Must never send audio. */
  prepare?(texts: string[]): void;
}

export interface CallerUtterance {
  utteranceId: string;
  text: string;
  tsSpeechStart?: number;
  tsSpeechEnd?: number;
  tsTranscriptFinal?: number;
}

export interface GeneratedCandidates {
  options: CandidateOption[];
  mode: CandidateMode;
  distinguishability: DistinguishabilityInfo | null;
  model: string;
  generationMs: number;
}

export type CandidateGenerator = (req: {
  transcript: TranscriptEntry[];
  mode: CandidateMode;
  /** Replies already offered in this turn that the user asked to replace. */
  avoid: string[];
  round: number;
}) => Promise<GeneratedCandidates>;

export interface ControllerDeps {
  generate: CandidateGenerator;
  now?: () => number;
  newId?: () => string;
  onTurnClosed?: (turn: TurnRecord) => void;
  /** Confirmations earlier than this after a proposal appears are ignored. */
  confirmGuardMs?: number;
  /** A proposal nobody confirms is withdrawn after this long. */
  proposalTtlMs?: number;
}

export interface Verdict {
  accepted: boolean;
  reason: string;
}

const ok = (reason = 'ok'): Verdict => ({ accepted: true, reason });
const no = (reason: string): Verdict => ({ accepted: false, reason });

const BUSY_PHASES: readonly Phase[] = ['SELECTING', 'AWAITING_CONFIRMATION', 'SYNTHESIZING', 'SPEAKING'];

export class Controller extends EventEmitter {
  private readonly generate: CandidateGenerator;
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly onTurnClosed: (turn: TurnRecord) => void;
  private readonly confirmGuardMs: number;
  private readonly proposalTtlMs: number;

  private seq = 0;
  private phase: Phase = 'DISCONNECTED';
  private call: CallLike | null = null;
  private callerInterim = '';
  private transcript: TranscriptEntry[] = [];
  private candidateSet: CandidateSet | null = null;
  private recognition: RecognitionResult | null = null;
  private proposal: Proposal | null = null;
  private speech: SpeechStatus | null = null;
  private notice: Snapshot['notice'] = null;
  private turn: TurnRecord | null = null;
  private lastCompletedTurn: TurnRecord | null = null;
  private pendingUtterance: CallerUtterance | null = null;
  private candidateModeSetting: CandidateMode = 'viseme-aware';
  private trialTarget: number | null = null;
  private shownThisTurn: string[] = [];

  /** Bumped whenever in-flight generation must be invalidated. */
  private genToken = 0;
  /** Bumped whenever an in-flight speak() outcome must be ignored. */
  private speechToken = 0;
  private proposalTimer: ReturnType<typeof setTimeout> | null = null;
  private callListeners: Array<[string, (...a: any[]) => void]> = [];

  private airpods: AirpodsStatus = {
    helper: 'not_started',
    authorized: null,
    available: false,
    connected: false,
    detail: null,
    lastGesture: null,
    lastMotionAt: null,
  };
  private services: ServiceStatus = {
    gemini: { configured: false, model: null },
    recognition: { reachable: false, model: null, device: null, checkedAt: null },
    voice: { listening: false, publicUrl: null, providers: {} },
  };

  constructor(deps: ControllerDeps) {
    super();
    this.generate = deps.generate;
    this.now = deps.now ?? Date.now;
    this.newId = deps.newId ?? randomUUID;
    this.onTurnClosed = deps.onTurnClosed ?? (() => {});
    this.confirmGuardMs = deps.confirmGuardMs ?? 600;
    this.proposalTtlMs = deps.proposalTtlMs ?? 20_000;
  }

  // ───────────────────────────── snapshot ─────────────────────────────

  snapshot(): Snapshot {
    return {
      seq: this.seq,
      now: this.now(),
      phase: this.phase,
      sessionId: this.call?.id ?? null,
      transport: this.call?.transport ?? null,
      callStartedAt: this.call?.startedAt ?? null,
      callerInterim: this.callerInterim,
      transcript: this.transcript,
      candidateSet: this.candidateSet,
      recognition: this.recognition,
      proposal: this.proposal,
      speech: this.speech,
      notice: this.notice,
      turn: this.turn,
      lastCompletedTurn: this.lastCompletedTurn,
      pendingCallerUtterance: this.pendingUtterance !== null,
      candidateModeSetting: this.candidateModeSetting,
      airpods: this.airpods,
      services: this.services,
    };
  }

  private changed(): void {
    this.seq += 1;
    this.emit('change', this.snapshot());
  }

  private cue(cue: 'options' | 'proposed' | 'confirmed' | 'cancelled' | 'uncertain'): void {
    this.emit('cue', cue);
  }

  private setNotice(kind: NonNullable<Snapshot['notice']>['kind'], message: string): void {
    this.notice = { kind, message, ts: this.now() };
  }

  // ───────────────────────────── status inputs ─────────────────────────────

  setServices(patch: Partial<ServiceStatus>): void {
    this.services = { ...this.services, ...patch };
    this.changed();
  }

  setAirpods(patch: Partial<AirpodsStatus>, opts: { silent?: boolean } = {}): void {
    this.airpods = { ...this.airpods, ...patch };
    if (!opts.silent) this.changed();
  }

  setCandidateMode(mode: CandidateMode): void {
    this.candidateModeSetting = mode;
    this.changed();
  }

  setTrialTarget(index: number | null): void {
    this.trialTarget = index;
    if (this.turn) this.turn.targetIndex = index;
    this.changed();
  }

  // ───────────────────────────── call lifecycle ─────────────────────────────

  /** Returns false (and hangs the new call up) when another call is already active. */
  attachCall(call: CallLike): boolean {
    if (this.call) {
      void call.hangup().catch(() => {});
      return false;
    }
    this.call = call;
    this.phase = 'LISTENING';
    this.callerInterim = '';
    this.transcript = [];
    this.candidateSet = null;
    this.recognition = null;
    this.proposal = null;
    this.speech = null;
    this.notice = null;
    this.turn = null;
    this.pendingUtterance = null;
    this.shownThisTurn = [];

    const on = (event: string, fn: (...a: any[]) => void) => {
      const guarded = (...a: any[]) => {
        if (this.call === call) fn(...a);
      };
      call.on(event, guarded);
      this.callListeners.push([event, guarded]);
    };
    on('transcript', (e: { text: string; isFinal: boolean }) => {
      if (!e.isFinal) this.callerInterimText(e.text);
    });
    on('utterance', (u: CallerUtterance) => this.callerUtterance(u));
    on('speaking', (e: { replyId: string; state: SpeechState }) => this.speechProgress(e.replyId, e.state));
    on('end', (e: { reason?: string }) => this.callEnded(e?.reason ?? 'ended'));
    this.changed();
    return true;
  }

  callEnded(reason: string): void {
    const call = this.call;
    if (!call) return;
    for (const [event, fn] of this.callListeners) call.off(event, fn);
    this.callListeners = [];
    this.genToken += 1;
    this.speechToken += 1;
    this.clearProposalTimer();
    if (this.turn) this.closeTurn('call_ended');
    this.call = null;
    this.phase = 'DISCONNECTED';
    this.candidateSet = null;
    this.recognition = null;
    this.proposal = null;
    this.pendingUtterance = null;
    this.callerInterim = '';
    if (this.speech && (this.speech.state === 'requested' || this.speech.state === 'first_audio')) {
      this.speech = { ...this.speech, state: 'cancelled' };
    }
    this.setNotice('info', `Call ended (${reason}).`);
    this.changed();
  }

  async hangup(): Promise<void> {
    const call = this.call;
    if (!call) return;
    await call.hangup().catch(() => {});
    // The gateway emits 'end'; make sure we transition even if it does not.
    if (this.call === call) this.callEnded('local hangup');
  }

  // ───────────────────────────── caller speech ─────────────────────────────

  private callerInterimText(text: string): void {
    this.callerInterim = text;
    if (this.phase === 'LISTENING' && text.trim()) this.phase = 'TRANSCRIBING';
    // Speech that transcribed to nothing (noise, cough): go back to listening.
    else if (this.phase === 'TRANSCRIBING' && !text.trim()) this.phase = 'LISTENING';
    this.changed();
  }

  callerUtterance(u: CallerUtterance): void {
    if (!this.call) return;
    const text = u.text.trim();
    if (!text) return;
    // Duplicate delivery of the same utterance (retries, reconnect replays) must not start a second turn.
    if (u.utteranceId && (u.utteranceId === this.turn?.utteranceId || (u.utteranceId === this.lastCompletedTurn?.utteranceId && this.lastCompletedTurn.sessionId === this.call.id) || u.utteranceId === this.pendingUtterance?.utteranceId)) return;
    this.callerInterim = '';
    this.transcript.push({ role: 'caller', text, ts: u.tsTranscriptFinal ?? this.now() });
    if (BUSY_PHASES.includes(this.phase)) {
      // The user is mid-selection or TACIT is speaking: do not yank the options away.
      this.pendingUtterance = { ...u, text };
      this.changed();
      return;
    }
    this.startTurn({ ...u, text });
  }

  private startTurn(u: CallerUtterance): void {
    const call = this.call;
    if (!call) return;
    if (this.turn) this.closeTurn('superseded');
    this.pendingUtterance = null;
    this.clearProposalTimer();
    this.candidateSet = null;
    this.recognition = null;
    this.proposal = null;
    this.notice = null;
    this.shownThisTurn = [];
    this.turn = {
      turnId: this.newId(),
      sessionId: call.id,
      transport: call.transport,
      utteranceId: u.utteranceId,
      callerText: u.text,
      candidateMode: null,
      options: [],
      t: { callerSpeechEnd: u.tsSpeechEnd, transcriptFinal: u.tsTranscriptFinal ?? this.now() },
      selectionAttempts: 0,
      abstentions: 0,
      cancellations: 0,
      alternativesRequested: 0,
      selectionSource: null,
      confirmSource: null,
      chosenIndex: null,
      spokenText: null,
      recognition: null,
      playbackAckKind: null,
      targetIndex: this.trialTarget,
      outcome: 'open',
    };
    void this.runGeneration(0);
  }

  private async runGeneration(round: number): Promise<void> {
    const turn = this.turn;
    const call = this.call;
    if (!turn || !call) return;
    const token = ++this.genToken;
    this.phase = 'GENERATING';
    if (round === 0) turn.t.generationRequested = this.now();
    this.changed();

    let generated: GeneratedCandidates;
    try {
      generated = await this.generate({
        transcript: [...this.transcript],
        mode: this.candidateModeSetting,
        avoid: [...this.shownThisTurn],
        round,
      });
    } catch (err) {
      if (token !== this.genToken || this.call !== call || this.turn !== turn) return;
      this.phase = 'ERROR';
      this.setNotice('error', `Could not generate replies: ${errorMessage(err)}`);
      this.changed();
      return;
    }
    if (token !== this.genToken || this.call !== call || this.turn !== turn) return;

    this.candidateSet = {
      id: this.newId(),
      turnId: turn.turnId,
      forUtteranceId: turn.utteranceId,
      mode: generated.mode,
      options: generated.options.map((o, index) => ({ ...o, index })),
      distinguishability: generated.distinguishability,
      model: generated.model,
      generatedAt: this.now(),
      generationMs: generated.generationMs,
      alternativesRound: round,
    };
    this.recognition = null;
    this.proposal = null;
    turn.candidateMode = generated.mode;
    turn.options = this.candidateSet.options.map((o) => o.text);
    turn.t.candidatesReady = this.now();
    turn.t.candidatesDisplayed = undefined;
    this.shownThisTurn.push(...turn.options);
    this.phase = 'OPTIONS_READY';
    this.cue('options');
    this.changed();
    try {
      call.prepare?.(turn.options);
    } catch {
      /* pre-synthesis is an optimisation only */
    }
  }

  candidatesDisplayed(candidateSetId: string, ts: number): void {
    if (!this.turn || this.candidateSet?.id !== candidateSetId) return;
    if (this.turn.t.candidatesDisplayed !== undefined) return;
    this.turn.t.candidatesDisplayed = ts;
    this.changed();
  }

  // ───────────────────────────── selection ─────────────────────────────

  private selectable(): boolean {
    if (!this.candidateSet || !this.turn) return false;
    return this.phase === 'OPTIONS_READY' || this.phase === 'ABSTAINED' || this.phase === 'CANCELLED' || this.phase === 'ERROR';
  }

  selectionStarted(candidateSetId: string, ts?: number): Verdict {
    if (this.candidateSet?.id !== candidateSetId) return no('stale_candidate_set');
    if (!this.selectable() || !this.turn) return no(`not_selectable_in_${this.phase}`);
    this.phase = 'SELECTING';
    this.turn.selectionAttempts += 1;
    this.turn.t.selectionStart = ts ?? this.now();
    this.recognition = null;
    this.notice = null;
    this.changed();
    return ok();
  }

  selectionAborted(candidateSetId: string, reason: string): Verdict {
    if (this.candidateSet?.id !== candidateSetId) return no('stale_candidate_set');
    if (this.phase !== 'SELECTING') return no(`not_selecting_in_${this.phase}`);
    this.phase = 'OPTIONS_READY';
    this.setNotice('info', reason);
    this.changed();
    this.drainPending();
    return ok();
  }

  recognitionResult(result: RecognitionResult): Verdict {
    if (this.candidateSet?.id !== result.candidateSetId) return no('stale_candidate_set');
    if (this.phase !== 'SELECTING' || !this.turn) return no(`not_selecting_in_${this.phase}`);
    this.recognition = result;
    this.turn.t.recognitionResult = this.now();
    const best = this.candidateSet.options[result.bestIndex];
    if (result.abstain || !best) {
      this.phase = 'ABSTAINED';
      this.turn.abstentions += 1;
      this.setNotice('abstained', abstainMessage(result.abstainReason));
      this.cue('uncertain');
      this.changed();
      this.drainPending();
      return ok('abstained');
    }
    this.propose(best.index, 'mouth');
    return ok('proposed');
  }

  /** Direct selection of an option by touch / click / key — the comparison baseline. Still requires confirmation. */
  directSelect(candidateSetId: string, index: number, source: Exclude<SelectionSource, 'mouth'>): Verdict {
    if (this.candidateSet?.id !== candidateSetId) return no('stale_candidate_set');
    if (!this.turn) return no('no_turn');
    if (!this.selectable() && this.phase !== 'AWAITING_CONFIRMATION') return no(`not_selectable_in_${this.phase}`);
    if (!this.candidateSet.options[index]) return no('bad_index');
    this.turn.selectionAttempts += 1;
    if (this.turn.t.selectionStart === undefined) this.turn.t.selectionStart = this.now();
    this.recognition = null;
    this.propose(index, source);
    return ok('proposed');
  }

  /** Webcam mouth-gesture mapping (not lip-reading). A proposal like any other: confirmation still required. */
  gestureSelect(candidateSetId: string, index: number, method: string): Verdict {
    if (this.candidateSet?.id !== candidateSetId) return no('stale_candidate_set');
    if (!this.turn) return no('no_turn');
    if (!this.selectable() && this.phase !== 'AWAITING_CONFIRMATION') return no(`not_selectable_in_${this.phase}`);
    if (!this.candidateSet.options[index]) return no('bad_index');
    this.turn.selectionAttempts += 1;
    if (this.turn.t.selectionStart === undefined) this.turn.t.selectionStart = this.now();
    this.recognition = null;
    this.propose(index, 'mouth', method.slice(0, 80));
    return ok('proposed');
  }

  private propose(index: number, source: SelectionSource, method?: string): void {
    const set = this.candidateSet;
    const option = set?.options[index];
    if (!set || !option || !this.turn) return;
    const t = this.now();
    this.clearProposalTimer();
    this.proposal = {
      id: this.newId(),
      candidateSetId: set.id,
      index,
      text: option.text,
      source,
      proposedAt: t,
      confirmableAt: t + this.confirmGuardMs,
      expiresAt: t + this.proposalTtlMs,
      ...(method ? { method } : {}),
    };
    this.turn.t.proposal = t;
    this.phase = 'AWAITING_CONFIRMATION';
    this.notice = null;
    const proposalId = this.proposal.id;
    this.proposalTimer = setTimeout(() => {
      if (this.proposal?.id === proposalId && this.phase === 'AWAITING_CONFIRMATION') {
        this.cancel({ source: 'timeout' });
      }
    }, this.proposalTtlMs);
    this.cue('proposed');
    this.changed();
  }

  private clearProposalTimer(): void {
    if (this.proposalTimer) clearTimeout(this.proposalTimer);
    this.proposalTimer = null;
  }

  // ───────────────────────────── confirmation / cancellation ─────────────────────────────

  /**
   * The ONLY path to speech. `proposalId` is mandatory for on-screen controls; a head nod carries
   * no id, so it binds to the current proposal subject to the time guard (`t` = gesture timestamp).
   */
  confirm(input: { source: ConfirmSource; proposalId?: string; t?: number }): Verdict {
    const proposal = this.proposal;
    const call = this.call;
    const turn = this.turn;
    if (this.phase !== 'AWAITING_CONFIRMATION' || !proposal || !call || !turn) return no(`nothing_to_confirm_in_${this.phase}`);
    if (input.source !== 'nod' && input.proposalId === undefined) return no('proposal_id_required');
    if (input.proposalId !== undefined && input.proposalId !== proposal.id) return no('stale_proposal');
    if (proposal.candidateSetId !== this.candidateSet?.id) return no('stale_candidate_set');
    const t = input.t ?? this.now();
    if (t < proposal.confirmableAt) return no('too_early');
    if (t > proposal.expiresAt) return no('expired');

    this.clearProposalTimer();
    turn.t.confirmation = this.now();
    turn.confirmSource = input.source;
    turn.selectionSource = proposal.source;
    if (proposal.method) turn.selectionMethod = proposal.method;
    turn.chosenIndex = proposal.index;
    if (proposal.source === 'mouth' && this.recognition) {
      const r = this.recognition;
      turn.recognition = { method: r.method, model: r.model, margin: r.margin, bestIndex: r.bestIndex, timings: r.timings };
    }
    this.cue('confirmed');
    this.startSpeaking(call, turn, proposal, input.source);
    return ok('confirmed');
  }

  private startSpeaking(call: CallLike, turn: TurnRecord, proposal: Proposal, confirmedBy: ConfirmSource): void {
    const replyId = this.newId();
    const token = ++this.speechToken;
    this.phase = 'SYNTHESIZING';
    this.speech = { replyId, text: proposal.text, state: 'requested', confirmedBy, requestedAt: this.now() };
    turn.t.ttsRequest = this.speech.requestedAt;
    this.changed();

    call.speak(proposal.text, { replyId }).then(
      (res) => {
        if (token !== this.speechToken || this.call !== call || this.turn !== turn) return;
        turn.t.ttsRequest = res.ttsRequestTs;
        turn.t.ttsFirstByte = res.ttsFirstByteTs;
        turn.t.firstAudioSent = res.firstAudioSentTs;
        turn.t.lastAudioSent = res.lastAudioSentTs;
        if (res.audioMs > 0) turn.audioMs = res.audioMs;
        if (res.playbackAckTs !== undefined) {
          turn.t.playbackAck = res.playbackAckTs;
          turn.playbackAckKind = res.playbackAckKind ?? 'transport-ack';
        }
        turn.spokenText = proposal.text;
        this.transcript.push({
          role: 'user',
          text: proposal.text,
          ts: res.firstAudioSentTs,
          via: { selection: proposal.source, confirm: confirmedBy },
        });
        this.speech = { ...this.speech!, state: res.playbackAckTs !== undefined ? 'played' : 'sent', ...(res.voice ? { voice: res.voice } : {}) };
        this.closeTurn('spoken');
        this.candidateSet = null;
        this.recognition = null;
        this.proposal = null;
        this.notice = null;
        this.phase = 'LISTENING';
        this.changed();
        this.drainPending();
      },
      (err) => {
        if (token !== this.speechToken || this.call !== call || this.turn !== turn) return;
        this.speech = { ...this.speech!, state: 'failed' };
        this.proposal = null;
        this.phase = 'ERROR';
        this.setNotice('error', `Voice output failed: ${errorMessage(err)}. Nothing was sent — select again to retry.`);
        this.changed();
      },
    );
  }

  private speechProgress(replyId: string, state: SpeechState): void {
    if (!this.speech || this.speech.replyId !== replyId) return;
    if (this.phase !== 'SYNTHESIZING' && this.phase !== 'SPEAKING') return;
    if (state === 'first_audio') {
      this.phase = 'SPEAKING';
      this.turn && (this.turn.t.firstAudioSent ??= this.now());
    }
    if (state === 'first_audio' || state === 'sent' || state === 'played') {
      this.speech = { ...this.speech, state };
      this.changed();
    }
  }

  cancel(input: { source: CancelSource }): Verdict {
    const turn = this.turn;
    switch (this.phase) {
      case 'AWAITING_CONFIRMATION':
      case 'SELECTING': {
        this.clearProposalTimer();
        this.proposal = null;
        this.phase = 'CANCELLED';
        if (turn) turn.cancellations += 1;
        this.setNotice('cancelled', input.source === 'timeout' ? 'No confirmation — nothing was said.' : 'Cancelled — nothing was said.');
        this.cue('cancelled');
        this.changed();
        this.drainPending();
        return ok('cancelled');
      }
      case 'SYNTHESIZING':
      case 'SPEAKING': {
        this.speechToken += 1; // ignore the in-flight speak() outcome
        this.call?.cancelSpeech();
        if (this.speech) this.speech = { ...this.speech, state: 'cancelled' };
        this.proposal = null;
        this.phase = 'CANCELLED';
        if (turn) turn.cancellations += 1;
        this.setNotice('cancelled', 'Speech stopped.');
        this.cue('cancelled');
        this.changed();
        this.drainPending();
        return ok('speech_cancelled');
      }
      default:
        return no(`nothing_to_cancel_in_${this.phase}`);
    }
  }

  /** A head gesture from the AirPods helper. Nod = confirm, shake = cancel. */
  gesture(g: { gesture: 'nod' | 'shake'; t: number }): Verdict {
    const verdict = g.gesture === 'nod' ? this.confirm({ source: 'nod', t: g.t }) : this.cancel({ source: 'shake' });
    this.airpods = { ...this.airpods, lastGesture: { gesture: g.gesture, t: g.t, accepted: verdict.accepted, reason: verdict.reason } };
    this.changed();
    return verdict;
  }

  requestAlternatives(): Verdict {
    if (!this.turn || !this.call) return no('no_turn');
    if (!this.selectable() && this.phase !== 'AWAITING_CONFIRMATION' && !(this.phase === 'ERROR')) {
      return no(`not_available_in_${this.phase}`);
    }
    this.clearProposalTimer();
    this.proposal = null;
    this.recognition = null;
    this.turn.alternativesRequested += 1;
    const round = (this.candidateSet?.alternativesRound ?? -1) + 1;
    void this.runGeneration(round);
    return ok();
  }

  rejectAll(): Verdict {
    if (!this.turn) return no('no_turn');
    if (this.phase === 'SYNTHESIZING' || this.phase === 'SPEAKING') return no(`not_available_in_${this.phase}`);
    this.genToken += 1;
    this.clearProposalTimer();
    this.closeTurn('rejected_all');
    this.candidateSet = null;
    this.recognition = null;
    this.proposal = null;
    this.phase = 'LISTENING';
    this.setNotice('info', 'No reply sent.');
    this.changed();
    this.drainPending();
    return ok();
  }

  // ───────────────────────────── internals ─────────────────────────────

  /** If the caller said something while we were busy, respond to it now. */
  private drainPending(): void {
    if (!this.pendingUtterance || !this.call) return;
    if (BUSY_PHASES.includes(this.phase)) return;
    const u = this.pendingUtterance;
    this.pendingUtterance = null;
    this.startTurn(u);
  }

  private closeTurn(outcome: TurnOutcome): void {
    const turn = this.turn;
    if (!turn) return;
    turn.outcome = outcome;
    this.turn = null;
    this.lastCompletedTurn = turn;
    try {
      this.onTurnClosed(turn);
    } catch {
      /* telemetry must never break the conversation */
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function abstainMessage(reason: string | null): string {
  switch (reason) {
    case 'no_face':
      return 'No face in view — nothing selected.';
    case 'no_mouth_motion':
      return 'No mouth movement detected — nothing selected.';
    case 'low_margin':
      return 'Too close to call — nothing selected. Try again, or pick directly.';
    case 'garbage_better':
      return 'That did not match any option — nothing selected.';
    default:
      return `Not confident${reason ? ` (${reason})` : ''} — nothing selected.`;
  }
}
