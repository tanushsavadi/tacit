// Speech output session: authorization → policy → TTS → output route → honest status.
// One server-wide session (there is one virtual mic per Mac). Two sources, never confused:
//   'typed'      user-authored AAC text, spoken after an explicit send while output is enabled;
//   'recognized' visual-model output, spoken only if the ReliabilityGate is validated — it is NOT today
//                (UNVALIDATED_GATE), so production never speaks recognised words.
// Reviewed speech (`speakReviewed`) is NOT automatic: the user picked one exact displayed candidate of the current
// utterance and pressed Speak ('reviewed-recognition'), or edited it first ('user-corrected', user-authored text).
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { LiveStatus, RecognitionHypothesis, ReviewChoice, SpeechDelivery, SpeechOutputStatus, SpeechSource, VoiceRouteStatus } from '../../shared/protocol.ts';
import { sha256Hex } from './live.ts';
import type { OutputRoute } from './route.ts';
import type { TtsResult } from './tts.ts';
import type { BindResult, VoiceBinding } from './voices.ts';

export interface ReliabilityGate {
  validated: boolean;
  /** Reference to the held-out silent-speech measurement that justifies `validated` (null when not validated). */
  evidence: string | null;
  accept(h: RecognitionHypothesis): { ok: boolean; reason: string };
}
export const UNVALIDATED_GATE: ReliabilityGate = Object.freeze({
  validated: false, evidence: null,
  accept: () => ({ ok: false, reason: 'Recognised speech is display-only: no silent-speech reliability gate has been validated.' }),
});

export const MAX_TYPED_CHARS = 500;
export const MAX_PENDING = 4;

interface Synth { synth(text: string, format?: 'file', signal?: AbortSignal, voice?: VoiceBinding): Promise<TtsResult>; label: string }
/** My Voice: binds each accepted request to the voice effective at approval time (MyVoice in production). */
export interface VoiceBinder { bind(revision: unknown): BindResult; status(): { revision: number; effective: { voiceId: string; label: string } } }
interface Req { d: SpeechDelivery; say: string; generation: number; abort: AbortController; routed: boolean; voice?: VoiceBinding; expiresAt?: number; expiryTimer?: ReturnType<typeof setTimeout> }
const REVIEW_CHOICES: readonly ReviewChoice[] = ['raw', 'alternative', 'phrase', 'edited'];

/**
 * Model output is ALL CAPS ("I'M TIRED"), which some voices read as shouting or spell out. For synthesis only, such
 * text is put in sentence case; the words are unchanged and the delivery reports the exact approved text. Mixed-case
 * (user-authored) text is never touched, and corrections are never passed through this.
 */
export function speakableCase(text: string): string {
  if (/[a-z]/.test(text)) return text;
  const lower = text.toLowerCase().replace(/\bi\b/g, 'I');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export class SpeechOutput extends EventEmitter {
  private st: { authorizationId: string | null; generation: number; state: 'off' | 'ready' | 'paused'; reason: string } =
    { authorizationId: null, generation: 0, state: 'off', reason: 'Voice output is off.' };
  private waiting: Req[] = [];       // accepted, not yet synthesized
  private active = new Set<Req>();   // synthesizing or in the route
  private working = false;
  private seen = new Set<string>();
  /** The current review's one-shot latch must outlive bounded request-id deduplication. */
  private consumedReview: string | null = null;

  constructor(private tts: Synth, private route: () => OutputRoute | null, private unconfigured: () => VoiceRouteStatus,
              private gate: ReliabilityGate = UNVALIDATED_GATE, private now = () => Date.now(),
              private voices: VoiceBinder | null = null) { super(); }

  /** A newer accepted utterance revokes pending reviewed speech, including synthesis already in flight. */
  invalidateReviewed(): void {
    const reason = 'Cancelled: a newer utterance was accepted.';
    const reviewed = (r: Req) => !!r.d.review;
    const waiting = this.waiting.filter(reviewed);
    this.waiting = this.waiting.filter(r => !reviewed(r));
    for (const r of waiting) this.finish(r, 'interrupted', reason);
    const active = [...this.active].filter(reviewed);
    for (const r of active) {
      r.abort.abort();
      this.finish(r, 'interrupted', reason);
    }
    if (active.some(r => r.routed)) this.route()?.stop(reason);
  }

  routeStatus(): VoiceRouteStatus { return this.route()?.status() ?? this.unconfigured(); }

  status(): SpeechOutputStatus {
    const v = this.voices?.status();
    return { ...this.st, route: this.routeStatus(), voice: v?.effective.label ?? this.tts.label, queued: this.waiting.length + this.active.size,
      recognizedSpeechAllowed: false, ...(v ? { voiceId: v.effective.voiceId, voiceRevision: v.revision } : {}) };
  }

  /** Freeze the voice for an approved request; a stale `voiceRevision` is refused (the user approved another voice). */
  private bindVoice(d: SpeechDelivery, revision: unknown): { ok: true; voice?: VoiceBinding } | { ok: false; reason: string } {
    if (!this.voices) return { ok: true };
    const b = this.voices.bind(revision);
    if (!b.ok) return b;
    d.voiceId = b.binding.voiceId; d.voice = b.binding.label;
    return { ok: true, voice: b.binding };
  }
  private announce(): void { this.emit('status', this.status()); }
  private deliver(d: SpeechDelivery): void { this.emit('delivery', { ...d, timings: { ...d.timings } }); }

  control(action: 'enable' | 'pause' | 'resume' | 'stop'): void {
    const s = this.st;
    switch (action) {
      case 'enable':
        this.cut('Voice output re-enabled.');
        this.st = { authorizationId: randomUUID(), generation: this.st.generation, state: 'ready', reason: 'Voice output on: typed messages you send are spoken into the call.' };
        break;
      case 'pause': if (s.state === 'ready') { this.cut('Paused.'); this.st = { ...this.st, state: 'paused', reason: 'Voice output paused: nothing will be spoken.' }; } break;
      case 'resume': if (s.state === 'paused') { this.st = { ...this.st, generation: this.st.generation + 1, state: 'ready', reason: 'Voice output on.' }; } break;
      case 'stop': this.cut('Voice output stopped.'); this.st = { ...this.st, authorizationId: null, state: 'off', reason: 'Voice output is off.' }; break;
    }
    this.announce();
  }

  /** Cancel everything not yet heard (Live paused/interrupted/ended, call change). State is kept. */
  interrupt(reason: string): void {
    if (!this.waiting.length && !this.active.size) return;
    this.cut(reason);
    this.announce();
  }

  private cut(reason: string): void {
    this.st = { ...this.st, generation: this.st.generation + 1 };
    for (const r of this.waiting.splice(0)) this.finish(r, 'interrupted', reason);
    // Still synthesizing: end it now (immediate terminal state) and abort the TTS call — nothing more is sent to it.
    for (const r of [...this.active]) if (!r.routed) { r.abort.abort(); this.finish(r, 'interrupted', reason); }
    if (this.active.size) this.route()?.stop(reason); // route answers 'interrupted' for what it holds
  }

  speakTyped(msg: { requestId: unknown; outputAuthorizationId: unknown; text: unknown; outputGeneration?: unknown; voiceRevision?: unknown; assisted?: unknown }): void {
    const id = typeof msg.requestId === 'string' && msg.requestId.length <= 100 ? msg.requestId : '';
    const text = typeof msg.text === 'string' ? msg.text.trim() : '';
    const d = this.newDelivery(id || `invalid-${randomUUID()}`, 'typed', text);
    if (msg.assisted === true) d.assisted = true; // provenance only: same checks, same explicit user send
    const refuse = (reason: string) => { d.state = 'refused'; d.reason = reason; d.timings.endedAt = this.now(); this.deliver(d); };
    if (!id) return refuse('Missing requestId.');
    if (this.seen.has(id)) return refuse('Duplicate requestId.');
    this.remember(id);
    if (this.st.state !== 'ready') return refuse(this.st.state === 'paused' ? 'Voice output is paused.' : 'Voice output is off: enable it first.');
    if (msg.outputAuthorizationId !== this.st.authorizationId) return refuse('Stale voice-output authorization.');
    if (msg.outputGeneration !== undefined && msg.outputGeneration !== this.st.generation) return refuse('Voice output was paused or interrupted after this message was written; send it again if you still want it spoken.');
    if (!text) return refuse('Nothing to say.');
    if (text.length > MAX_TYPED_CHARS) return refuse(`Longer than ${MAX_TYPED_CHARS} characters.`);
    const v = this.bindVoice(d, msg.voiceRevision);
    if (!v.ok) return refuse(v.reason);
    this.enqueue(d, d.text, undefined, v.voice);
  }

  /**
   * Recognised speech. Only reachable when Live is in automatic mode AND the gate is validated — neither is possible
   * in production today. Returns the refusal reason (nothing is emitted for refusals).
   */
  speakRecognized(h: RecognitionHypothesis, live: LiveStatus): string | null {
    const no = (r: string) => r;
    // Real-time (unreviewed) is the user's explicit, per-activation choice; without it the reliability gate decides.
    const unreviewed = live.unreviewed === true && live.mode === 'automatic';
    // An experimental (personal-overlay) recognizer is Review First: its words are voiced only through speakReviewed.
    if (h.recognizerProfile?.reviewRequired) return no('Review First: an experimental recognizer profile produced this result; it is spoken only after you press Speak.');
    if (!this.gate.validated && !unreviewed) return no(UNVALIDATED_GATE.accept(h).reason);
    if (this.st.state !== 'ready') return no('Voice output is not enabled.');
    if (live.state !== 'active' || live.mode !== 'automatic') return no('Live is not in automatic mode.');
    if (h.authorizationId !== live.authorizationId) return no('Stale Live authorization.');
    if (h.source !== 'visual-model' || h.decision !== 'shown' || !h.rawText.trim()) return no('Not an accepted recognition result.');
    const key = `rec:${h.authorizationId}:${h.utteranceId}`;
    if (this.seen.has(key)) return no('Utterance already spoken.');
    if (unreviewed) {
      const t = h.rawText.trim();
      if (t.length > 200 || !/[A-Za-z]{2}/.test(t)) return no('Not speakable text.');
    } else {
      const verdict = this.gate.accept(h);
      if (!verdict.ok) return no(verdict.reason);
    }
    const d = this.newDelivery(key, 'recognized', h.rawText.trim());
    const v = this.bindVoice(d, undefined);
    if (!v.ok) return no(v.reason);
    this.remember(key);
    this.enqueue(d, speakableCase(d.text), undefined, v.voice); // same words; casing only, for the voice
    return null;
  }

  /**
   * Reviewed speech: one exact candidate of the latest accepted utterance (or the user's correction of it), after an
   * explicit Speak. `target` = LiveSession.reviewTarget(). Every refusal is emitted as a 'refused' delivery.
   */
  speakReviewed(msg: Record<string, unknown>, live: LiveStatus, target: RecognitionHypothesis | null): void {
    const id = typeof msg.requestId === 'string' && msg.requestId.length <= 100 ? msg.requestId : '';
    const choice = REVIEW_CHOICES.includes(msg.candidate as ReviewChoice) ? msg.candidate as ReviewChoice : null;
    const index = Number.isInteger(msg.index) ? msg.index as number : -1;
    const sent = typeof msg.text === 'string' ? msg.text : '';
    const utteranceId = typeof msg.utteranceId === 'string' && msg.utteranceId.length <= 200 ? msg.utteranceId : '';
    const d = this.newDelivery(id || `invalid-${randomUUID()}`, choice === 'edited' ? 'user-corrected' : 'reviewed-recognition', sent.slice(0, MAX_TYPED_CHARS));
    if (choice && utteranceId && live.authorizationId) d.review = { utteranceId, liveAuthorizationId: live.authorizationId, candidate: choice, index };
    const refuse = (reason: string) => { d.state = 'refused'; d.reason = reason; d.timings.endedAt = this.now(); this.deliver(d); };
    if (!id) return refuse('Missing requestId.');
    if (this.seen.has(id)) return refuse('Duplicate requestId.');
    this.remember(id);
    if (this.st.state !== 'ready') return refuse(this.st.state === 'paused' ? 'Voice output is paused.' : 'Voice output is off: enable it first.');
    if (msg.outputAuthorizationId !== this.st.authorizationId) return refuse('Stale voice-output authorization.');
    if (typeof msg.outputGeneration !== 'number') return refuse('Missing output generation.');
    if (msg.outputGeneration !== this.st.generation) return refuse('Voice output was paused or interrupted after this was shown; press Speak again if you still want it spoken.');
    if (live.state !== 'active') return refuse(`Live is ${live.state}: reviewed speech needs an active Live session.`);
    if (msg.liveAuthorizationId !== live.authorizationId) return refuse('Stale Live authorization.');
    const restarted = 'Live was paused, interrupted or restarted after this utterance; mouth it again.';
    if (msg.liveGeneration !== live.generation) return refuse(restarted);
    if (!target || target.decision !== 'shown' || target.authorizationId !== live.authorizationId) return refuse('No recognised utterance to speak.');
    if (target.generation !== live.generation) return refuse(restarted);
    if (target.utteranceId !== utteranceId) return refuse('A newer utterance was recognised: only the latest one can be spoken.');
    if (!Number.isFinite(target.reviewExpiresAt) || this.now() >= target.reviewExpiresAt!) return refuse('Review window expired: mouth it again.');
    const once = `rev:${live.authorizationId}:${utteranceId}`;
    if (this.consumedReview === once || this.seen.has(once)) return refuse('This utterance was already spoken.');
    if (!choice) return refuse('Unknown candidate kind.');
    const shown = target.reviewCandidates ?? [];
    const c = shown[index];
    let say: string;
    if (choice === 'edited') {
      if (!c) return refuse('Unknown basis candidate for the correction.');
      if (!sent.trim()) return refuse('Nothing to say.');
      if (sent.length > MAX_TYPED_CHARS) return refuse(`Longer than ${MAX_TYPED_CHARS} characters.`);
      if (msg.textHash !== sha256Hex(sent)) return refuse('Text hash mismatch.');
      say = sent; // user-authored: spoken byte-for-byte as approved
    } else {
      if (!c || c.index !== index || c.kind !== choice) return refuse('Unknown candidate: not one that was shown for this utterance.');
      if (sent !== c.text) return refuse('Candidate text does not match what was shown.');
      if (msg.textHash !== c.textHash || c.textHash !== sha256Hex(c.text)) return refuse('Text hash mismatch.');
      say = speakableCase(c.text); // same words; casing only, for the voice
    }
    const v = this.bindVoice(d, msg.voiceRevision); // a voice mismatch does not consume the utterance
    if (!v.ok) return refuse(v.reason);
    this.enqueue(d, say, target.reviewExpiresAt, v.voice);
    if (d.state !== 'refused') { this.consumedReview = once; this.remember(once); } // route/queue refusals allow retry
  }

  private remember(id: string): void {
    if (this.seen.size >= 1024) this.seen.delete(this.seen.values().next().value!);
    this.seen.add(id);
  }

  private newDelivery(requestId: string, source: SpeechSource, text: string): SpeechDelivery {
    return { requestId, outputAuthorizationId: this.st.authorizationId, generation: this.st.generation, source, text, state: 'queued', reason: null, voice: null, remoteAudibility: 'unknown', timings: { requestedAt: this.now() } };
  }

  private enqueue(d: SpeechDelivery, say = d.text, expiresAt?: number, voice?: VoiceBinding): void {
    const route = this.route();
    if (!route || route.status().state !== 'ready') {
      d.state = 'refused'; d.reason = `Virtual microphone not ready: ${this.routeStatus().reason ?? this.routeStatus().state}.`; d.timings.endedAt = this.now();
      return this.deliver(d);
    }
    if (this.waiting.length + this.active.size >= MAX_PENDING) {
      d.state = 'refused'; d.reason = `Too many messages waiting (${MAX_PENDING}); wait or stop.`; d.timings.endedAt = this.now();
      return this.deliver(d);
    }
    const r: Req = { d, say, expiresAt, voice, generation: this.st.generation, abort: new AbortController(), routed: false };
    this.waiting.push(r);
    if (expiresAt !== undefined) {
      r.expiryTimer = setTimeout(() => {
        this.waiting = this.waiting.filter(p => p !== r);
        r.abort.abort();
        this.finish(r, 'interrupted', 'Review expired.');
        if (r.routed) this.route()?.stop('Review expired.');
      }, Math.max(0, expiresAt - this.now()));
      r.expiryTimer.unref();
    }
    this.deliver(d);
    this.announce();
    void this.work();
  }

  /** Synthesize strictly in order, hand each to the route's FIFO as soon as it is ready (overlaps with playback). */
  private async work(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      for (let r = this.waiting.shift(); r; r = this.waiting.shift()) {
        this.active.add(r);
        if (r.expiresAt !== undefined && this.now() >= r.expiresAt) { this.finish(r, 'interrupted', 'Review expired before synthesis.'); continue; }
        r.d.state = 'synthesizing'; r.d.timings.synthStartAt = this.now(); this.deliver(r.d);
        let audio: TtsResult;
        try { audio = await this.tts.synth(r.say, 'file', r.abort.signal, r.voice); } catch (e) {
          if (this.active.has(r)) this.finish(r, 'failed', `Speech synthesis failed: ${e instanceof Error ? e.message : String(e)}. Nothing was sent.`);
          continue;
        }
        if (!this.active.has(r)) continue; // already ended by a cut while synthesizing
        if (r.expiresAt !== undefined && this.now() >= r.expiresAt) { this.finish(r, 'interrupted', 'Review expired before playback.'); continue; }
        r.d.timings.synthEndAt = this.now(); r.d.voice = audio.voice;
        if (r.generation !== this.st.generation || this.st.state !== 'ready') { this.finish(r, 'interrupted', 'Cancelled before playback.'); continue; }
        const route = this.route();
        if (!route) { this.finish(r, 'failed', 'Virtual microphone disappeared.'); continue; }
        r.routed = true;
        r.d.state = 'routing'; this.deliver(r.d);
        void route.play(r.d.requestId, audio.audio, audio.mime, (t) => {
          if (!this.active.has(r)) return;
          r.d.timings.firstAudioAt = t; this.deliver(r.d);
        }).then((o) => {
          if (!this.active.has(r)) return;
          if (o.state === 'rendered') { r.d.timings.renderedAt = o.renderedAt; this.finish(r, 'rendered', null); }
          else this.finish(r, o.state, o.reason);
        });
      }
    } finally { this.working = false; }
  }

  private finish(r: Req, state: 'rendered' | 'interrupted' | 'failed', reason: string | null): void {
    if (r.d.state === 'rendered' || r.d.state === 'interrupted' || r.d.state === 'failed') return; // exactly one terminal state
    if (r.expiryTimer) clearTimeout(r.expiryTimer);
    this.active.delete(r);
    r.d.state = state; r.d.reason = reason; r.d.timings.endedAt = this.now();
    this.deliver(r.d);
    this.announce();
  }
}
