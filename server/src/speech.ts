// Speech output session: authorization → policy → TTS → output route → honest status.
// One server-wide session (there is one virtual mic per Mac). Two sources, never confused:
//   'typed'      user-authored AAC text, spoken after an explicit send while output is enabled;
//   'recognized' visual-model output, spoken only if the ReliabilityGate is validated — it is NOT today
//                (UNVALIDATED_GATE), so production never speaks recognised words.
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { LiveStatus, RecognitionHypothesis, SpeechDelivery, SpeechOutputStatus, SpeechSource, VoiceRouteStatus } from '../../shared/protocol.ts';
import type { OutputRoute } from './route.ts';
import type { TtsResult } from './tts.ts';

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

interface Synth { synth(text: string, format?: 'file'): Promise<TtsResult>; label: string }
interface Req { d: SpeechDelivery; generation: number }

export class SpeechOutput extends EventEmitter {
  private st: { authorizationId: string | null; generation: number; state: 'off' | 'ready' | 'paused'; reason: string } =
    { authorizationId: null, generation: 0, state: 'off', reason: 'Voice output is off.' };
  private waiting: Req[] = [];       // accepted, not yet synthesized
  private active = new Set<Req>();   // synthesizing or in the route
  private working = false;
  private seen = new Set<string>();

  constructor(private tts: Synth, private route: () => OutputRoute | null, private unconfigured: () => VoiceRouteStatus,
              private gate: ReliabilityGate = UNVALIDATED_GATE, private now = () => Date.now()) { super(); }

  routeStatus(): VoiceRouteStatus { return this.route()?.status() ?? this.unconfigured(); }

  status(): SpeechOutputStatus {
    return { ...this.st, route: this.routeStatus(), voice: this.tts.label, queued: this.waiting.length + this.active.size,
      recognizedSpeechAllowed: false };
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
    if (this.active.size) this.route()?.stop(reason); // route answers 'interrupted' for what it holds
  }

  speakTyped(msg: { requestId: unknown; outputAuthorizationId: unknown; text: unknown }): void {
    const id = typeof msg.requestId === 'string' && msg.requestId.length <= 100 ? msg.requestId : '';
    const text = typeof msg.text === 'string' ? msg.text.trim() : '';
    const d = this.newDelivery(id || `invalid-${randomUUID()}`, 'typed', text);
    const refuse = (reason: string) => { d.state = 'refused'; d.reason = reason; d.timings.endedAt = this.now(); this.deliver(d); };
    if (!id) return refuse('Missing requestId.');
    if (this.seen.has(id)) return refuse('Duplicate requestId.');
    this.remember(id);
    if (this.st.state !== 'ready') return refuse(this.st.state === 'paused' ? 'Voice output is paused.' : 'Voice output is off: enable it first.');
    if (msg.outputAuthorizationId !== this.st.authorizationId) return refuse('Stale voice-output authorization.');
    if (!text) return refuse('Nothing to say.');
    if (text.length > MAX_TYPED_CHARS) return refuse(`Longer than ${MAX_TYPED_CHARS} characters.`);
    this.enqueue(d);
  }

  /**
   * Recognised speech. Only reachable when Live is in automatic mode AND the gate is validated — neither is possible
   * in production today. Returns the refusal reason (nothing is emitted for refusals).
   */
  speakRecognized(h: RecognitionHypothesis, live: LiveStatus): string | null {
    const no = (r: string) => r;
    if (!this.gate.validated) return no(UNVALIDATED_GATE.accept(h).reason);
    if (this.st.state !== 'ready') return no('Voice output is not enabled.');
    if (live.state !== 'active' || live.mode !== 'automatic') return no('Live is not in automatic mode.');
    if (h.authorizationId !== live.authorizationId) return no('Stale Live authorization.');
    if (h.source !== 'visual-model' || h.decision !== 'shown' || !h.rawText.trim()) return no('Not an accepted recognition result.');
    const key = `rec:${h.authorizationId}:${h.utteranceId}`;
    if (this.seen.has(key)) return no('Utterance already spoken.');
    const verdict = this.gate.accept(h);
    if (!verdict.ok) return no(verdict.reason);
    this.remember(key);
    this.enqueue(this.newDelivery(key, 'recognized', h.rawText.trim()));
    return null;
  }

  private remember(id: string): void {
    if (this.seen.size >= 1024) this.seen.delete(this.seen.values().next().value!);
    this.seen.add(id);
  }

  private newDelivery(requestId: string, source: SpeechSource, text: string): SpeechDelivery {
    return { requestId, outputAuthorizationId: this.st.authorizationId, generation: this.st.generation, source, text, state: 'queued', reason: null, voice: null, remoteAudibility: 'unknown', timings: { requestedAt: this.now() } };
  }

  private enqueue(d: SpeechDelivery): void {
    const route = this.route();
    if (!route || route.status().state !== 'ready') {
      d.state = 'refused'; d.reason = `Virtual microphone not ready: ${this.routeStatus().reason ?? this.routeStatus().state}.`; d.timings.endedAt = this.now();
      return this.deliver(d);
    }
    if (this.waiting.length + this.active.size >= MAX_PENDING) {
      d.state = 'refused'; d.reason = `Too many messages waiting (${MAX_PENDING}); wait or stop.`; d.timings.endedAt = this.now();
      return this.deliver(d);
    }
    this.waiting.push({ d, generation: this.st.generation });
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
        r.d.state = 'synthesizing'; r.d.timings.synthStartAt = this.now(); this.deliver(r.d);
        let audio: TtsResult;
        try { audio = await this.tts.synth(r.d.text, 'file'); } catch (e) {
          this.finish(r, 'failed', `Speech synthesis failed: ${e instanceof Error ? e.message : String(e)}. Nothing was sent.`);
          continue;
        }
        r.d.timings.synthEndAt = this.now(); r.d.voice = audio.voice;
        if (r.generation !== this.st.generation || this.st.state !== 'ready') { this.finish(r, 'interrupted', 'Cancelled before playback.'); continue; }
        const route = this.route();
        if (!route) { this.finish(r, 'failed', 'Virtual microphone disappeared.'); continue; }
        r.d.state = 'routing'; this.deliver(r.d);
        void route.play(r.d.requestId, audio.audio, audio.mime, (t) => { r.d.timings.firstAudioAt = t; this.deliver(r.d); }).then((o) => {
          if (o.state === 'rendered') { r.d.timings.renderedAt = o.renderedAt; this.finish(r, 'rendered', null); }
          else this.finish(r, o.state, o.reason);
        });
      }
    } finally { this.working = false; }
  }

  private finish(r: Req, state: 'rendered' | 'interrupted' | 'failed', reason: string | null): void {
    this.active.delete(r);
    r.d.state = state; r.d.reason = reason; r.d.timings.endedAt = this.now();
    this.deliver(r.d);
    this.announce();
  }
}
