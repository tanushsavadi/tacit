import { activationBlock, utteranceBytes, utteranceSamples, utteranceSource, type RecognitionMode, type LiveAuthorization, type SilentSpeechPort, type VisualHypothesis, type CommunicationUtterance } from './port.ts';
import type { InputSource } from './capabilities.ts';
import { withDeadline } from './deadline.ts';

export type LivePhase = 'inactive' | 'starting' | 'listening' | 'recognizing' | 'paused' | 'uncertain' | 'error';
export interface LiveSessionState { phase: LivePhase; hypothesis: VisualHypothesis | null; reason: string | null }
/** No TTS or text-send path here. A future shared-contract adapter delegates acceptance/delivery to the server. */
export class LiveSpeechSession {
  private auth: LiveAuthorization | null = null;
  private pausedAuth: LiveAuthorization | null = null;
  private epoch = 0;
  private tasks = new Set<AbortController>();
  private seen = new Set<string>();
  private queued: CommunicationUtterance[] = [];
  private input: InputSource = 'camera';
  private inFlightBytes = 0;
  private overloads = 0;
  private authorizedAtMs = Infinity;
  private retained: CommunicationUtterance | null = null;
  state: LiveSessionState = { phase: 'inactive', hypothesis: null, reason: null };
  constructor(private port: SilentSpeechPort, private changed: (state: LiveSessionState) => void, private now: () => number = () => performance.now(), private timeoutMs = 30000) {}
  private emit(patch: Partial<LiveSessionState>) { this.state = { ...this.state, ...patch }; this.changed(this.state); }
  private invalidate(clearSeen = true) { this.epoch++; this.tasks.forEach(c => c.abort()); this.tasks.clear(); if (clearSeen) this.seen.clear(); this.queued = []; this.retained = null; this.inFlightBytes = 0; }
  async start(callId: string | null, input: InputSource = 'camera', mode: RecognitionMode = 'automatic') {
    const block = activationBlock(this.port, callId, input, mode);
    if (block) { this.stop(); this.emit({ phase: 'inactive', reason: block }); return false; }
    this.stop(); this.input = input; const epoch = this.epoch; const controller = new AbortController(); this.tasks.add(controller);
    this.emit({ phase: 'starting', hypothesis: null, reason: null });
    try {
      if (controller.signal.aborted) return false;
      const auth = await this.port.activate(callId ?? 'display-only', controller.signal, input, mode);
      if (epoch !== this.epoch || controller.signal.aborted) { this.port.end(auth); return false; }
      if (auth.callId !== (callId ?? 'display-only') || auth.mode !== mode) { this.port.end(auth); throw new Error('The live authorization does not match this call and recognition mode.'); }
      this.auth = auth; this.authorizedAtMs = this.now(); this.emit({ phase: 'listening' }); return true;
    } catch (e) { if (epoch === this.epoch) this.emit({ phase: 'error', reason: e instanceof Error ? e.message : String(e) }); return false; }
    finally { this.tasks.delete(controller); }
  }
  async submit(utterance: CommunicationUtterance) {
    const auth = this.auth;
    if (!auth || this.state.phase === 'paused' || this.state.phase === 'inactive' || this.seen.has(utterance.id)) return;
    if (utteranceSource(utterance) !== this.input) { this.emit({ reason: 'Input source changed. Start a new live session.' }); return; }
    if (utterance.startMs < this.authorizedAtMs || ('frames' in utterance && utterance.frames.some(f => f.t < this.authorizedAtMs))) {
      this.emit({ reason: 'Articulation from before live activation was discarded.' }); return;
    }
    if (activationBlock(this.port, auth.callId, this.input, auth.mode)) { this.stop(); return; }
    if (utteranceSamples(utterance) < 8) { this.emit({ phase: 'uncertain', reason: 'Too few captured samples. Nothing was sent.' }); return; }
    const bytes = utteranceBytes(utterance);
    if (bytes > 12 * 1024 * 1024 || this.metrics.heldBytes + bytes > 24 * 1024 * 1024) {
      this.overloads++; this.emit({ phase: 'uncertain', reason: 'Capture memory limit reached. This window was discarded without submission.' }); return;
    }
    this.seen.add(utterance.id);
    // Bound dedup memory for a long conversation. Server must also deduplicate scoped to authorization.
    if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
    if (this.tasks.size) {
      if (this.queued.length < 2) this.queued.push(utterance);
      else { this.overloads++; this.emit({ phase: 'uncertain', reason: 'Recognition is behind. This window was discarded without submission.' }); }
      return;
    }
    const epoch = this.epoch; const controller = new AbortController(); this.tasks.add(controller); this.retained = null; this.inFlightBytes = bytes;
    this.emit({ phase: 'recognizing', reason: null });
    try {
      const result = await withDeadline(() => this.port.submit(auth, utterance, controller.signal), controller, this.timeoutMs);
      if (epoch !== this.epoch || controller.signal.aborted || this.auth !== auth) return;
      const source = this.input === 'camera' ? 'visual-model' : this.input === 'airpods' ? 'airpods-model' : 'combined-model';
      if (result.utteranceId !== utterance.id || result.authorizationId !== auth.id || result.source !== source) throw new Error('Recognition result does not match the active utterance.');
      if (result.decision === 'accepted' && (auth.mode !== 'automatic' || activationBlock(this.port, auth.callId, this.input) || !result.final || !result.stable || !result.rawText.trim())) throw new Error('Unauthorized or unstable recognition was incorrectly marked eligible by the adapter.');
      const completed = result.decision === 'accepted' || result.decision === 'shown';
      this.retained = completed ? null : utterance;
      this.emit({ phase: completed ? 'listening' : 'uncertain', hypothesis: result, reason: result.reason });
    } catch (e) { if (epoch === this.epoch) {
      this.retained = utterance;
      if (controller.signal.aborted) { this.port.interrupt(auth); this.invalidate(false); }
      this.emit({ phase: 'uncertain', reason: e instanceof Error ? e.message : String(e) });
    } }
    finally {
      this.tasks.delete(controller);
      if (epoch === this.epoch && this.auth === auth) {
        this.inFlightBytes = 0;
        const next = this.queued.shift();
        if (next) { this.seen.delete(next.id); void this.submit(next); }
      }
    }
  }
  /** Face loss discards the in-flight window, interrupts pending output, and can recover without session reactivation. */
  trackingLost() {
    if (!this.auth || this.state.phase === 'paused') return;
    this.port.interrupt(this.auth); this.invalidate(false); this.emit({ phase: 'listening', reason: 'Tracking lost. Incomplete articulation discarded.' });
  }
  pause() { if (this.auth) { this.pausedAuth = this.auth; this.port.pause(this.auth); } this.invalidate(); this.auth = null; this.emit({ phase: 'paused', hypothesis: null, reason: 'Live speech paused. No articulation is being transmitted.' }); }
  /** Server status no longer matches this browser. Drop local work without sending another end. */
  relinquish() { if (this.auth) this.pausedAuth = this.auth; this.auth = null; this.invalidate(); this.emit({ phase: 'paused', hypothesis: null, reason: 'The Live session changed. Start Live preview again.' }); }
  interrupt() { if (this.auth) this.port.interrupt(this.auth); this.invalidate(false); this.emit({ phase: this.auth ? 'listening' : this.state.phase, reason: 'Outgoing speech stopped; pending articulation discarded.' }); }
  stop() { if (this.auth) this.port.end(this.auth); else if (this.pausedAuth) this.port.end(this.pausedAuth); this.pausedAuth = null; this.auth = null; this.invalidate(); this.emit({ phase: 'inactive', hypothesis: null, reason: null }); }
  get active() { return this.auth !== null; }
  get authorizationId() { return this.auth?.id ?? null; }
  get automaticSpeechAuthorized() { return this.auth?.mode === 'automatic'; }
  get pendingRetry() { return this.retained; }
  get metrics() { return { queueDepth: this.queued.length, overloads: this.overloads, heldBytes: this.inFlightBytes + this.queued.reduce((n, u) => n + utteranceBytes(u), 0) + (this.retained ? utteranceBytes(this.retained) : 0) }; }
}
