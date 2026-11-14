import type { ClientMessage, ServerMessage, SpeechDelivery, SpeechOutputStatus } from '../../../shared/protocol.ts';
import type { LiveSocket } from './liveSocket.ts';

type Action = Extract<ClientMessage, { type: 'output_control' }>['action'];
const terminal = new Set<SpeechDelivery['state']>(['rendered', 'refused', 'interrupted', 'failed']);
/** Own typed requests only; recognition hypotheses never enter this adapter. */
export class SpeechOutputPort {
  private socket: LiveSocket | null = null;
  private ownedAuthorization: string | null = null;
  private pendingControl: { action: Action; baseline: number } | null = null;
  private pendingRequest: { id: string; generation: number } | null = null;
  private controlTimer: ReturnType<typeof setTimeout> | null = null;
  private speechTimer: ReturnType<typeof setTimeout> | null = null;
  status: SpeechOutputStatus | null = null;
  delivery: SpeechDelivery | null = null;
  notice: string | null = null;
  constructor(private changed: () => void = () => {}, private timeoutMs = 30000) {}
  get controlling() { return this.pendingControl?.action ?? null; }
  get waiting() { return this.pendingRequest !== null; }
  get authorized() { return !!this.ownedAuthorization && this.status?.authorizationId === this.ownedAuthorization && this.status.state === 'ready' && !this.pendingControl; }
  get canSpeak() { return this.socket?.readyState === 1 && this.authorized && this.status?.route.state === 'ready' && !this.pendingRequest; }
  attach(socket: LiveSocket) { this.disconnect(); this.socket = socket; }
  disconnect() {
    if (this.controlTimer) clearTimeout(this.controlTimer); if (this.speechTimer) clearTimeout(this.speechTimer);
    this.controlTimer = null; this.speechTimer = null; this.socket = null; this.ownedAuthorization = null; this.pendingControl = null; this.pendingRequest = null;
    this.status = null; this.delivery = null; this.notice = null; this.changed();
  }
  receive(message: ServerMessage) {
    if (message.type === 'output_status') {
      const next = message.status;
      if (this.status && next.generation < this.status.generation) return;
      if (this.status && (next.generation !== this.status.generation || next.authorizationId !== this.status.authorizationId)) {
        this.pendingRequest = null; this.delivery = null; if (this.speechTimer) clearTimeout(this.speechTimer);
      }
      this.status = next;
      const pending = this.pendingControl;
      const expected = pending?.action === 'pause' ? 'paused' : pending?.action === 'stop' ? 'off' : 'ready';
      if (pending && next.state === expected && next.generation > pending.baseline) {
        if (this.controlTimer) clearTimeout(this.controlTimer); this.pendingControl = null;
        this.ownedAuthorization = expected === 'ready' ? next.authorizationId : null;
        this.notice = next.reason;
      } else if (next.state !== 'ready' || next.authorizationId !== this.ownedAuthorization) this.ownedAuthorization = null;
      this.changed();
    } else if (message.type === 'speech_delivery') {
      const d = message.delivery, p = this.pendingRequest;
      if (!p || d.requestId !== p.id || d.source !== 'typed' || !this.authorized) return;
      if (d.outputAuthorizationId !== this.ownedAuthorization || d.generation !== p.generation || d.generation !== this.status?.generation) return;
      this.delivery = d;
      if (terminal.has(d.state)) { this.pendingRequest = null; if (this.speechTimer) clearTimeout(this.speechTimer); }
      this.changed();
    }
  }
  control(action: Action) {
    if (!this.socket || this.socket.readyState !== 1 || !this.status) { this.notice = 'Voice output is not connected. Open the native companion and reconnect TACIT.'; this.changed(); return; }
    // Stop/pause override any outstanding enable; speech is blocked locally immediately.
    if (this.pendingControl && action !== 'pause' && action !== 'stop') return;
    if (this.controlTimer) clearTimeout(this.controlTimer);
    this.ownedAuthorization = null; this.pendingRequest = null; this.delivery = null;
    if (this.speechTimer) clearTimeout(this.speechTimer);
    this.pendingControl = { action, baseline: this.status.generation };
    this.notice = `${action === 'enable' ? 'Enabling' : action === 'resume' ? 'Resuming' : action === 'pause' ? 'Pausing' : 'Stopping'} voice output · awaiting backend acknowledgment.`;
    this.controlTimer = setTimeout(() => {
      this.pendingControl = null; this.notice = 'Voice control was not acknowledged. Output state is unconfirmed. Use Stop in the native companion.';
      this.socket?.send(JSON.stringify({ type: 'output_control', action: 'stop' } satisfies ClientMessage)); this.changed();
    }, 8000);
    this.socket.send(JSON.stringify({ type: 'output_control', action } satisfies ClientMessage)); this.changed();
  }
  speakTyped(text: string): boolean {
    const value = text.trim();
    if (!this.canSpeak || !value || value.length > 500) { this.notice = 'Enable a ready voice output route and enter up to 500 characters.'; this.changed(); return false; }
    const id = crypto.randomUUID();
    this.pendingRequest = { id, generation: this.status!.generation }; this.delivery = null; this.notice = 'Typed message submitted · awaiting backend acknowledgment.';
    this.speechTimer = setTimeout(() => {
      this.control('stop'); this.notice = 'Typed speech timed out. Stop requested; delivery is unconfirmed.'; this.changed();
    }, this.timeoutMs);
    this.socket!.send(JSON.stringify({ type: 'speak_typed', requestId: id, outputAuthorizationId: this.ownedAuthorization!, text: value } satisfies ClientMessage)); this.changed(); return true;
  }
}

/** Local virtual-microphone progress for typed speech. Writing audio here does not establish that a remote person heard it. */
export function describeSpeechDelivery(delivery: SpeechDelivery, deviceName: string | null): { title: string; detail: string } {
  const device = deviceName ?? 'the virtual microphone';
  const unverified = 'Remote audibility is not verified.';
  switch (delivery.state) {
    case 'queued': return { title: 'Queued', detail: `Typed speech is waiting. ${unverified}` };
    case 'synthesizing': return { title: 'Synthesizing', detail: `Typed speech is being synthesized. ${unverified}` };
    case 'routing': return delivery.timings.firstAudioAt
      ? { title: `Speaking into ${device}`, detail: `Audio has started on this Mac. ${unverified}` }
      : { title: `Writing audio to ${device}`, detail: unverified };
    case 'rendered': return { title: `Audio written to ${device}`, detail: unverified };
    case 'refused': return { title: 'Message refused', detail: delivery.reason ?? unverified };
    case 'interrupted': return { title: 'Speech interrupted', detail: unverified };
    case 'failed': return { title: 'Speech failed', detail: delivery.reason ?? unverified };
  }
}
