import { activationBlock, type LiveAuthorization, type SilentSpeechPort, type VisualHypothesis, type VisualUtterance } from './port.ts';

export type LivePhase = 'inactive' | 'starting' | 'listening' | 'recognizing' | 'paused' | 'uncertain' | 'error';
export interface LiveSessionState { phase: LivePhase; hypothesis: VisualHypothesis | null; reason: string | null }
/** No TTS or text-send path here. A future shared-contract adapter delegates acceptance/delivery to the server. */
export class LiveSpeechSession {
  private auth: LiveAuthorization | null = null;
  private epoch = 0;
  private tasks = new Set<AbortController>();
  private seen = new Set<string>();
  private queued: VisualUtterance[] = [];
  private authorizedAtMs = Infinity;
  private retained: VisualUtterance | null = null;
  state: LiveSessionState = { phase: 'inactive', hypothesis: null, reason: null };
  constructor(private port: SilentSpeechPort, private changed: (state: LiveSessionState) => void, private now: () => number = () => performance.now()) {}
  private emit(patch: Partial<LiveSessionState>) { this.state = { ...this.state, ...patch }; this.changed(this.state); }
  private invalidate(clearSeen = true) { this.epoch++; this.tasks.forEach(c => c.abort()); this.tasks.clear(); if (clearSeen) this.seen.clear(); this.queued = []; this.retained = null; }
  async start(callId: string | null) {
    const block = activationBlock(this.port, callId);
    if (block) { this.emit({ phase: 'inactive', reason: block }); return false; }
    this.stop(); const epoch = this.epoch; const controller = new AbortController(); this.tasks.add(controller);
    this.emit({ phase: 'starting', hypothesis: null, reason: null });
    try {
      const auth = await this.port.activate(callId!, controller.signal);
      if (epoch !== this.epoch || controller.signal.aborted) { this.port.end(auth); return false; }
      if (auth.callId !== callId) { this.port.end(auth); throw new Error('The live authorization does not match this call.'); }
      this.auth = auth; this.authorizedAtMs = this.now(); this.emit({ phase: 'listening' }); return true;
    } catch (e) { if (epoch === this.epoch) this.emit({ phase: 'error', reason: e instanceof Error ? e.message : String(e) }); return false; }
    finally { this.tasks.delete(controller); }
  }
  async submit(utterance: VisualUtterance) {
    const auth = this.auth;
    if (!auth || this.state.phase === 'paused' || this.state.phase === 'inactive' || this.seen.has(utterance.id)) return;
    if (utterance.startMs < this.authorizedAtMs || utterance.frames.some(f => f.t < this.authorizedAtMs)) {
      this.emit({ reason: 'Articulation from before live activation was discarded.' }); return;
    }
    if (activationBlock(this.port, auth.callId)) { this.stop(); return; }
    if (utterance.frames.length < 8) { this.emit({ phase: 'uncertain', reason: 'Too few captured frames. Nothing was sent.' }); return; }
    this.seen.add(utterance.id);
    // Bound dedup memory for a long conversation. Server must also deduplicate scoped to authorization.
    if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
    if (this.tasks.size) {
      if (this.queued.length < 2) this.queued.push(utterance);
      else { this.retained = utterance; this.emit({ phase: 'uncertain', reason: 'Recognition is behind. This utterance was retained locally and was not submitted.' }); }
      return;
    }
    const epoch = this.epoch; const controller = new AbortController(); this.tasks.add(controller);
    this.emit({ phase: 'recognizing', reason: null });
    try {
      const result = await this.port.submit(auth, utterance, controller.signal);
      if (epoch !== this.epoch || controller.signal.aborted || this.auth !== auth) return;
      if (result.utteranceId !== utterance.id || result.authorizationId !== auth.id || result.source !== 'visual-model') throw new Error('Recognition result does not match the active utterance.');
      if (result.decision === 'accepted' && (!result.final || !result.stable || !result.rawText.trim())) throw new Error('Unstable recognition was incorrectly marked eligible by the adapter.');
      this.retained = result.decision === 'accepted' ? null : utterance;
      this.emit({ phase: result.decision === 'accepted' ? 'listening' : 'uncertain', hypothesis: result, reason: result.reason });
    } catch (e) { if (epoch === this.epoch) { this.retained = utterance; this.emit({ phase: 'uncertain', reason: e instanceof Error ? e.message : String(e) }); } }
    finally {
      this.tasks.delete(controller);
      if (epoch === this.epoch && this.auth === auth) {
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
  pause() { if (this.auth) this.port.pause(this.auth); this.invalidate(); this.auth = null; this.emit({ phase: 'paused', hypothesis: null, reason: 'Live speech paused. No articulation is being transmitted.' }); }
  interrupt() { if (this.auth) this.port.interrupt(this.auth); this.invalidate(false); this.emit({ phase: this.auth ? 'listening' : this.state.phase, reason: 'Outgoing speech stopped; pending articulation discarded.' }); }
  stop() { if (this.auth) this.port.end(this.auth); this.auth = null; this.invalidate(); this.emit({ phase: 'inactive', hypothesis: null, reason: null }); }
  get active() { return this.auth !== null; }
  get pendingRetry() { return this.retained; }
}
