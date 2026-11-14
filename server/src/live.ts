// Live Silent Speech session (protocol 'tacit-live-v1', shared/protocol.ts). ONE server-wide instance shared by every
// authenticated user client (browser workspace, menu-bar companion): any client can pause/stop it and all see the same
// status; partially received utterances are tracked per sending connection. Recognised text is only ever SHOWN to the
// user: this module has no path to TTS or the call, and
// `autoTransmitAllowed` is the literal type `false` until a reliability gate is validated on real silent recordings.
import { randomUUID } from 'node:crypto';
import type { ClientMessage, LiveRecognitionCapability, LiveStatus, PhraseMatch, RecognitionHypothesis, ServerMessage } from '../../shared/protocol.ts';

export const LIVE_CAPABILITY: LiveRecognitionCapability = {
  protocol: 'tacit-live-v1', supportedInputs: ['camera'], automaticSpeechValidated: false, validationEvidence: null,
  maxFrames: 300, maxBytes: 12 * 1024 * 1024, maxDurationMs: 10_000,
};
/** Recognitions running or queued at the recogniser per connection; more are answered 'busy' rather than queued. */
export const MAX_INFLIGHT = 2;
const MAX_SEEN_IDS = 512;
export const AUTOMATIC_GATED = 'Automatic transmission is gated until silent-speech reliability is validated on real silent recordings.';

export interface RecognizerResult {
  text: string | null; error?: string; model?: string; n_tokens?: number; face_fraction?: number;
  ms?: Record<string, number>; gate?: Record<string, number | string | null>; phrase?: unknown;
}

/** The sidecar is local, but its JSON is still validated field by field before it reaches clients. */
export function phraseMatch(x: unknown): PhraseMatch | null {
  if (!x || typeof x !== 'object') return null;
  const p = x as Record<string, unknown>;
  const str = (v: unknown, max = 200) => typeof v === 'string' && v.length <= max;
  if (!str(p.rule, 40) || !str(p.phrase) || !str(p.runnerUp) || typeof p.accepted !== 'boolean' || !(p.reason === null || str(p.reason))
    || ![p.margin, p.garbageGap, p.listSize].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  return { rule: p.rule as string, phrase: p.phrase as string, runnerUp: p.runnerUp as string, accepted: p.accepted as boolean,
    reason: p.reason as string | null, margin: p.margin as number, garbageGap: p.garbageGap as number, listSize: p.listSize as number };
}
export type Recognizer = (input: { timesMs: number[]; frames: Buffer[] }, signal: AbortSignal) => Promise<RecognizerResult>;

type Utterance = Extract<ClientMessage, { type: 'visual_utterance' }>;
interface Pending { msg: Utterance; frames: Buffer[]; received: number; bytes: number; generation: number; reject: string | null; answered: boolean; headerAt: number }

export class LiveSession {
  private status: LiveStatus = { authorizationId: null, generation: 0, state: 'off', mode: 'display-only', autoTransmitAllowed: false, reason: 'Live is off.' };
  /** Utterance being received, per connection (frames follow their header on the same socket). */
  private pending = new Map<unknown, Pending>();
  private inflight = new Set<AbortController>();
  /** utteranceIds already answered under the current authorization (exactly one recognition per id). */
  private seen = new Set<string>();
  droppedBinary = 0;

  constructor(private recognize: Recognizer, private send: (m: ServerMessage) => void, private now = () => Date.now()) {}

  get current(): LiveStatus { return { ...this.status }; }
  announce(): void { this.send({ type: 'live_status', status: this.current }); }

  control(msg: Extract<ClientMessage, { type: 'live_control' }>): void {
    const s = this.status;
    const bump = (patch: Partial<LiveStatus>) => {
      for (const c of this.inflight) c.abort();
      this.inflight.clear();
      this.status = { ...s, ...patch, generation: s.generation + 1 };
    };
    switch (msg.action) {
      case 'activate':
        if ((msg.mode ?? 'display-only') === 'automatic') { this.status = { ...s, reason: AUTOMATIC_GATED }; break; }
        if (msg.inputSource && msg.inputSource !== 'camera') { this.status = { ...s, reason: 'Only camera input is supported by this recogniser.' }; break; }
        this.seen.clear();
        bump({ authorizationId: randomUUID(), state: 'active', mode: 'display-only', reason: 'Live (display only): recognised words are shown to you, not spoken.' });
        break;
      case 'pause': if (s.state === 'active') bump({ state: 'paused', reason: 'Paused.' }); break;
      case 'resume': if (s.state === 'paused') bump({ state: 'active', reason: 'Live (display only).' }); break;
      case 'interrupt': bump({ reason: s.state === 'off' ? s.reason : 'Interrupted: pending utterances dropped.' }); break;
      case 'end': bump({ authorizationId: null, state: 'off', reason: 'Live ended.' }); break;
    }
    for (const conn of [...this.pending.keys()]) this.abandonPending(conn, 'Incomplete: Live control changed before all frames arrived.');
    this.announce();
  }

  private abandonPending(conn: unknown, reason: string): void {
    const p = this.pending.get(conn);
    this.pending.delete(conn);
    if (p && !p.answered) this.result(p.msg, null, reason, 0);
  }

  /** A client socket closed: drop only its partially received utterance. */
  disconnect(conn: unknown): void { this.abandonPending(conn, 'Incomplete: the sending client disconnected.'); }

  /** Header for one utterance; the next frameTimesMs.length binary messages are its JPEG frames. */
  utterance(msg: Utterance, conn: unknown = null): void {
    const t = msg.frameTimesMs, L = LIVE_CAPABILITY;
    this.abandonPending(conn, 'Incomplete: a new utterance header arrived before all frames of this one.');
    let reject: string | null = null;
    if (this.status.state !== 'active') reject = `Live is ${this.status.state}.`;
    else if (msg.authorizationId !== this.status.authorizationId) reject = 'Stale authorization.';
    else if (typeof msg.utteranceId !== 'string' || !msg.utteranceId) reject = 'Missing utteranceId.';
    else if (this.seen.has(msg.utteranceId)) reject = 'Duplicate utteranceId: already answered under this authorization.';
    else if (!Array.isArray(t) || t.length < 1 || t.length > L.maxFrames) reject = `Need 1–${L.maxFrames} frames.`;
    else if (!t.every((x, i) => Number.isFinite(x) && (i === 0 || x > t[i - 1]!))) reject = 'Frame times must be finite and strictly increasing.';
    else if (t.at(-1)! - t[0]! > L.maxDurationMs) reject = `Utterance longer than ${L.maxDurationMs} ms.`;
    if (!reject) {
      if (this.seen.size >= MAX_SEEN_IDS) this.seen.delete(this.seen.values().next().value!);
      this.seen.add(msg.utteranceId);
    }
    const p: Pending = { msg, frames: [], received: 0, bytes: 0, generation: this.status.generation, reject, answered: false, headerAt: this.now() };
    this.pending.set(conn, p);
    if (reject) { // answer now; keep `pending` so this utterance's frames are swallowed
      p.answered = true;
      this.result(msg, null, reject, 0);
      if (!Array.isArray(t) || !t.length) this.pending.delete(conn);
    }
  }

  frame(buf: Buffer, conn: unknown = null): void {
    const p = this.pending.get(conn);
    if (!p) { this.droppedBinary++; return; }
    p.received++; p.bytes += buf.length;
    if (!p.reject && p.bytes > LIVE_CAPABILITY.maxBytes) { p.reject = `Utterance larger than ${LIVE_CAPABILITY.maxBytes} bytes.`; p.frames = []; }
    if (!p.reject) p.frames.push(buf); // frames of a rejected utterance are counted and discarded, never retained
    if (p.received < (Array.isArray(p.msg.frameTimesMs) ? p.msg.frameTimesMs.length : 0)) return;
    this.pending.delete(conn);
    if (!p.reject && this.inflight.size >= MAX_INFLIGHT) p.reject = 'Recogniser busy: earlier utterances are still being recognised; this one was dropped, not queued.';
    if (p.reject) { if (!p.answered) this.result(p.msg, null, p.reject, 0); return; }
    void this.run(p);
  }

  close(): void { this.control({ type: 'live_control', action: 'end' }); }

  private async run(p: Pending): Promise<void> {
    const received = this.now(), ctl = new AbortController();
    this.inflight.add(ctl);
    let r: RecognizerResult | null = null, err: string | null = null;
    try { r = await this.recognize({ timesMs: p.msg.frameTimesMs, frames: p.frames }, ctl.signal); }
    catch (e) { err = ctl.signal.aborted ? 'Dropped: Live was paused, interrupted or ended.' : `Recognition failed: ${e instanceof Error ? e.message : String(e)}`; }
    this.inflight.delete(ctl);
    if (p.generation !== this.status.generation) err = 'Dropped: Live was paused, interrupted or ended.';
    // Observable conversation latency (additive keys in `stages`): the browser's own endpoint wait (last detected lip
    // motion → endpoint decision, browser clock, from the header) and the upload of the frames to this server.
    const endpointWait = p.msg.endpointMs - p.msg.endMs;
    const extra = { ...(Number.isFinite(endpointWait) && endpointWait >= 0 ? { endpoint_wait: Math.round(endpointWait) } : {}), upload: Math.round(received - p.headerAt) };
    this.result(p.msg, r, err, this.now() - received, extra);
  }

  private result(msg: Utterance, r: RecognizerResult | null, err: string | null, ms: number, extra: Record<string, number> = {}): void {
    const text = (r?.text ?? '').trim();
    const reason = err ?? (r?.error ? r.error : !text ? 'No words decoded.' : null);
    const margin = r?.gate?.nbest_margin_per_token;
    const h: RecognitionHypothesis = {
      utteranceId: msg.utteranceId, authorizationId: msg.authorizationId, rawText: reason ? '' : text,
      final: true, stable: false,
      uncertainty: typeof margin === 'number' ? { value: margin, kind: 'nbest-margin-per-token', calibrated: false } : null,
      model: r?.model ?? 'unavailable', source: 'visual-model', decision: reason ? 'abstained' : 'shown', reason,
      recognitionMs: ms, stages: r?.ms || Object.keys(extra).length ? { ...(r?.ms ?? {}), ...extra } : null, gate: r?.gate ?? null, transmitted: false,
      phraseMatch: reason ? null : phraseMatch(r?.phrase),
    };
    this.send({ type: 'recognition_hypothesis', hypothesis: h });
  }
}

/** HTTP client for recognition/tacit_vsr/service.py (127.0.0.1 only). */
export function httpRecognizer(baseUrl: string, timeoutMs = 20_000): Recognizer {
  return async ({ timesMs, frames }, signal) => {
    const res = await fetch(`${baseUrl}/recognize`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'jpeg-frames', timesMs, frames: frames.map((f) => f.toString('base64')) }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
    });
    const body = (await res.json()) as RecognizerResult & { error?: string };
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    return body;
  };
}
