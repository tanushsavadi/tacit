import type { ClientMessage, LiveRecognitionCapability, LiveStatus, RecognitionHypothesis, ServerMessage, Snapshot } from '../../../shared/protocol.ts';
import type { CommunicationUtterance, LiveAuthorization, RecognitionMode, SilentSpeechAvailability, SilentSpeechPort } from './port.ts';
import type { InputSource } from './capabilities.ts';

type Control = Extract<ClientMessage, { type: 'live_control' }>;
export interface LiveSocket {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string | Blob): void;
  close(): void;
}
interface PendingControl {
  action: Control['action'];
  mode?: LiveStatus['mode'];
  baselineGeneration: number;
  baselineAuthorizationId: string | null;
  baselineState: LiveStatus['state'];
  resolve(status: LiveStatus): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}
interface PendingResult {
  id: string; localId: string; auth: LiveAuthorization; generation: number;
  resolve(result: RecognitionHypothesis): void; reject(error: Error): void;
}
const error = (message: string) => new Error(message);

/** One adapter on useTacit's authenticated socket. A batch is enqueued atomically, never across an await. */
export class LiveSocketPort implements SilentSpeechPort {
  private socket: LiveSocket | null = null;
  private capability: LiveRecognitionCapability | null = null;
  private model: string | null = null;
  private current: LiveStatus | null = null;
  private auth: LiveAuthorization | null = null;
  private controls: PendingControl[] = [];
  private pending: PendingResult | null = null;
  private barrier: Promise<unknown> = Promise.resolve();
  private epoch = 0;
  private sequence = 0;
  constructor(private changed: () => void = () => {}, private timeoutMs = 30000) {}

  get status() { return this.current; }
  get availability(): SilentSpeechAvailability {
    const connected = this.socket?.readyState === 1;
    const ready = connected && !!this.current && !!this.capability;
    return { connected, recognitionReady: ready, supportedInputs: this.capability?.supportedInputs ?? [], validatedInputs: [],
      automaticSpeechValidated: false, validationEvidence: null, model: this.model,
      reason: !connected ? 'Connect to TACIT to recognize your words.' : !this.capability ? 'Visual recognition is unavailable. Check that the TACIT recognition service is running.' : !this.current ? 'Waiting for the Live connection. The backend may need a restart.' : 'Display-only recognition available. Automatic speech is gated.' };
  }
  attach(socket: LiveSocket) { this.disconnect(); this.socket = socket; this.changed(); }
  disconnect() {
    this.epoch++; this.socket = null; this.current = null; this.capability = null; this.auth = null;
    this.rejectPending('Connection changed. Start Live preview again.');
    for (const c of this.controls.splice(0)) { clearTimeout(c.timer); c.reject(error('Live connection ended.')); }
    this.barrier = Promise.resolve(); this.changed();
  }
  updateSnapshot(snapshot: Snapshot) {
    const previous = this.capability;
    this.capability = snapshot.services.recognition.reachable && snapshot.services.recognition.live?.protocol === 'tacit-live-v1' ? snapshot.services.recognition.live : null;
    this.model = snapshot.services.recognition.model;
    if (previous && !this.capability) { this.epoch++; this.auth = null; this.rejectPending('Recognition service became unavailable.'); this.control({ type: 'live_control', action: 'end' }).catch(() => {}); }
    this.changed();
  }
  receive(message: ServerMessage) {
    if (message.type === 'live_status') {
      const status = message.status;
      if (this.current && status.generation < this.current.generation) return;
      this.current = status;
      // An interrupt keeps this authorization, but every subsequent request uses the new server generation.
      if (this.auth && status.authorizationId === this.auth.id && status.state === 'active' && status.mode === this.auth.mode) this.auth.generation = String(status.generation);
      else if (this.auth) { this.epoch++; this.auth = null; this.rejectPending('Live authorization changed.'); }
      const pending = this.controls[0];
      if (pending && this.matches(pending, status)) { this.controls.shift(); clearTimeout(pending.timer); pending.resolve(status); }
      this.changed();
    } else if (message.type === 'recognition_hypothesis') {
      const p = this.pending, h = message.hypothesis;
      if (!p || h.utteranceId !== p.id || h.authorizationId !== p.auth.id) return;
      if (this.auth !== p.auth || this.current?.state !== 'active' || this.current.generation !== p.generation) return;
      this.pending = null;
      if (h.transmitted !== false || h.stable !== false || !['shown', 'abstained'].includes(h.decision)) p.reject(error('Unsupported recognition policy. Live preview stopped.'));
      else p.resolve({ ...h, utteranceId: p.localId });
    }
  }
  private rejectPending(reason: string) { const p = this.pending; this.pending = null; p?.reject(error(reason)); }
  /** The protocol has no control request id. Match the oldest control to a later generation and the state that action produces. */
  private matches(pending: PendingControl, status: LiveStatus): boolean {
    if (status.generation <= pending.baselineGeneration || status.autoTransmitAllowed !== false) return false;
    switch (pending.action) {
      case 'activate':
        return status.state === 'active' && !!status.authorizationId && status.mode === (pending.mode ?? 'display-only');
      case 'resume':
        return status.state === 'active' && status.authorizationId === pending.baselineAuthorizationId && status.mode === (pending.mode ?? 'display-only');
      case 'pause':
        return status.state === 'paused' && status.authorizationId === pending.baselineAuthorizationId;
      case 'interrupt':
        return status.state === pending.baselineState && status.authorizationId === pending.baselineAuthorizationId;
      case 'end':
        return status.state === 'off' && status.authorizationId === null;
    }
  }
  private control(message: Control): Promise<LiveStatus> {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1) return Promise.reject(error('TACIT is disconnected.'));
    if (this.controls.length >= 8) return Promise.reject(error('Live controls are busy. Wait for acknowledgment.'));
    const baselineGeneration = this.current?.generation ?? -1;
    const baselineAuthorizationId = this.current?.authorizationId ?? null;
    const baselineState = this.current?.state ?? 'off';
    const promise = new Promise<LiveStatus>((resolve, reject) => {
      const pending: PendingControl = {
        action: message.action, mode: message.mode ?? this.current?.mode, baselineGeneration, baselineAuthorizationId, baselineState, resolve, reject,
        timer: setTimeout(() => {
          socket.close(); this.disconnect(); reject(error('Live control timed out. Reconnect before starting again.'));
        }, 8000),
      };
      this.controls.push(pending);
      try { socket.send(JSON.stringify(message)); }
      catch { socket.close(); this.disconnect(); }
    });
    this.barrier = promise.catch(() => {});
    return promise;
  }
  async activate(callId: string, signal: AbortSignal, input: InputSource, mode: RecognitionMode): Promise<LiveAuthorization> {
    if (signal.aborted) throw error('Live activation cancelled.');
    if (!this.availability.recognitionReady || input !== 'camera') throw error(this.availability.reason);
    if (mode !== 'display-only') throw error('Automatic speech has not passed the backend reliability gate.');
    this.epoch++; this.auth = null; this.rejectPending('New Live activation.');
    const epoch = this.epoch;
    const cancelled = () => { if (epoch === this.epoch) { this.epoch++; void this.control({ type: 'live_control', action: 'end' }).catch(() => {}); } };
    signal.addEventListener('abort', cancelled, { once: true });
    try {
      const status = await this.control({ type: 'live_control', action: 'activate', mode, inputSource: 'camera' });
      if (signal.aborted || epoch !== this.epoch || !this.availability.recognitionReady) throw error('Live activation cancelled.');
      if (status.state !== 'active' || !status.authorizationId || status.mode !== mode || status.autoTransmitAllowed !== false) throw error(status.reason);
      if (this.current?.authorizationId !== status.authorizationId || this.current.generation !== status.generation || this.current.state !== 'active') throw error('Live authorization changed.');
      const auth = { id: status.authorizationId, generation: String(status.generation), callId, mode };
      this.auth = auth; return auth;
    } finally { signal.removeEventListener('abort', cancelled); }
  }
  async submit(auth: LiveAuthorization, utterance: CommunicationUtterance, signal: AbortSignal): Promise<RecognitionHypothesis> {
    const epoch = this.epoch;
    await this.barrier;
    const socket = this.socket, c = this.capability, s = this.current;
    const valid = () => !signal.aborted && epoch === this.epoch && this.auth === auth && socket === this.socket && socket?.readyState === 1 && this.current?.state === 'active' && this.current.authorizationId === auth.id;
    if (!valid() || !c || !s) throw error('Live authorization is no longer active.');
    if (this.pending) throw error('Recognition is busy. This window was not uploaded.');
    if (!('frames' in utterance) || utterance.inputSource && utterance.inputSource !== 'camera') throw error('Only camera JPEG input is supported.');
    const frames = utterance.frames;
    const bytes = frames.reduce((n, f) => n + f.jpeg.size, 0);
    const times = frames.map(f => f.t);
    if (!frames.length || frames.length > Math.min(300, c.maxFrames) || bytes > Math.min(12 * 1024 * 1024, c.maxBytes) || times.at(-1)! - times[0]! > Math.min(10000, c.maxDurationMs) || !frames.every((f, i) => f.jpeg.type === 'image/jpeg' && f.jpeg.size > 0 && Number.isFinite(f.t) && (!i || f.t > times[i - 1]!))) throw error('Invalid or oversized JPEG capture. Window discarded.');
    if (![utterance.startMs, utterance.endMs, utterance.detectedAtMs, utterance.endpointMs].every(Number.isFinite) || utterance.startMs > utterance.endMs || utterance.detectedAtMs < utterance.endMs || utterance.endpointMs < 0) throw error('Invalid capture timing.');
    // Drain before starting: never leave a partially uploaded batch behind an asynchronous pause/control.
    const deadline = performance.now() + 5000;
    while (socket!.bufferedAmount > 1024 * 1024) {
      if (!valid()) throw error('Upload interrupted before transmission.');
      if (performance.now() > deadline) throw error('Upload congested. This window was discarded.');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    if (!valid()) throw error('Upload interrupted before transmission.');
    if (this.pending) throw error('Recognition is busy. This window was not uploaded.');
    const wireId = `${this.current!.generation}:${++this.sequence}:${utterance.id}`;
    return new Promise<RecognitionHypothesis>((resolve, reject) => {
      const onAbort = () => { if (this.pending?.id === wireId) { this.rejectPending('Recognition interrupted.'); this.interrupt(auth); } };
      const timer = setTimeout(() => { if (this.pending?.id === wireId) { this.rejectPending('Recognition timed out. Nothing was spoken in display-only mode.'); this.interrupt(auth); } }, this.timeoutMs);
      const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); };
      this.pending = { id: wireId, localId: utterance.id, auth, generation: this.current!.generation, resolve: h => { finish(); resolve(h); }, reject: e => { finish(); reject(e); } };
      signal.addEventListener('abort', onAbort, { once: true });
      const header: Extract<ClientMessage, { type: 'visual_utterance' }> = { type: 'visual_utterance', utteranceId: wireId, authorizationId: auth.id, startMs: utterance.startMs, endMs: utterance.endMs, endpointMs: utterance.detectedAtMs, frameTimesMs: times };
      try {
        socket!.send(JSON.stringify(header));
        for (const frame of frames) socket!.send(frame.jpeg);
      } catch { socket!.close(); this.disconnect(); }
    });
  }
  pause(auth: LiveAuthorization) { if (this.auth !== auth) return; this.epoch++; this.auth = null; this.rejectPending('Live paused.'); void this.control({ type: 'live_control', action: 'pause' }).catch(() => {}); }
  interrupt(auth: LiveAuthorization) { if (this.auth !== auth) return; this.epoch++; this.rejectPending('Pending articulation interrupted.'); void this.control({ type: 'live_control', action: 'interrupt' }).catch(() => {}); }
  end(auth: LiveAuthorization) { if (this.auth !== auth && this.current?.authorizationId !== auth.id) return; this.epoch++; this.auth = null; this.rejectPending('Live ended.'); void this.control({ type: 'live_control', action: 'end' }).catch(() => {}); }
}
