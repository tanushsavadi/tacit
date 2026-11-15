// Live Silent Speech session (protocol 'tacit-live-v1', shared/protocol.ts). ONE server-wide instance shared by every
// authenticated user client (browser workspace, menu-bar companion): any client can pause/stop it and all see the same
// status; partially received utterances are tracked per sending connection. Recognised text is only ever SHOWN to the
// user: this module has no path to TTS or the call, and
// `autoTransmitAllowed` is the literal type `false` until a reliability gate is validated on real silent recordings.
import { createHash, randomUUID } from 'node:crypto';
import type { ClientMessage, LiveRecognitionCapability, LiveStatus, PhraseMatch, RecognitionHypothesis, ReviewCandidate, ServerMessage } from '../../shared/protocol.ts';

export const LIVE_CAPABILITY: LiveRecognitionCapability = {
  protocol: 'tacit-live-v1', supportedInputs: ['camera'], automaticSpeechValidated: false, validationEvidence: null,
  maxFrames: 300, maxBytes: 12 * 1024 * 1024, maxDurationMs: 10_000,
};
/** Recognitions running or queued at the recogniser per connection; more are answered 'busy' rather than queued. */
export const MAX_INFLIGHT = 2;
const MAX_SEEN_IDS = 512;
/** How long a shown utterance stays speakable through `speak_reviewed` (review + optional correction). */
export const REVIEW_TTL_MS = 120_000;
const MAX_ALTERNATIVES = 4;
export const sha256Hex = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
export const AUTOMATIC_GATED = 'Automatic transmission is gated until silent-speech reliability is validated on real silent recordings.';

export interface RecognizerResult {
  text: string | null; error?: string; model?: string; n_tokens?: number; face_fraction?: number;
  ms?: Record<string, number>; gate?: Record<string, number | string | null>; phrase?: unknown; alternatives?: unknown;
}

/** Other N-best texts from the sidecar: strings only, trimmed, non-empty, ≤ 200 chars, distinct, never the raw text. */
export function alternatives(x: unknown, raw: string): string[] {
  if (!Array.isArray(x)) return [];
  const out: string[] = [];
  for (const v of x) {
    const t = typeof v === 'string' ? v.trim() : '';
    if (t && t.length <= 200 && t !== raw && !out.includes(t)) out.push(t);
  }
  return out.slice(0, MAX_ALTERNATIVES);
}

/** The exact texts a user may pick for reviewed speech: raw, alternatives, then the phrase only if ACCEPTED. */
function reviewCandidates(raw: string, alts: string[], phrase: PhraseMatch | null): ReviewCandidate[] {
  const list: Omit<ReviewCandidate, 'index' | 'textHash'>[] = [{ kind: 'raw', text: raw }, ...alts.map((text) => ({ kind: 'alternative' as const, text }))];
  if (phrase?.accepted && !list.some((c) => c.text === phrase.phrase)) list.push({ kind: 'phrase', text: phrase.phrase });
  return list.map((c, index) => ({ ...c, index, textHash: sha256Hex(c.text) }));
}

/** The sidecar is local, but its JSON is still validated field by field before it reaches clients. */
export function phraseMatch(x: unknown): PhraseMatch | null {
  if (!x || typeof x !== 'object') return null;
  const p = x as Record<string, unknown>;
  const str = (v: unknown, max = 200) => typeof v === 'string' && v.length <= max;
  if (!str(p.rule, 40) || !str(p.phrase) || !str(p.runnerUp) || typeof p.accepted !== 'boolean' || !(p.reason === null || str(p.reason))
    || ![p.margin, p.garbageGap, p.listSize].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const att = p.freeAttPerToken;
  if (att !== undefined && att !== null && !(typeof att === 'number' && Number.isFinite(att))) return null;
  return { rule: p.rule as string, phrase: p.phrase as string, runnerUp: p.runnerUp as string, accepted: p.accepted as boolean,
    reason: p.reason as string | null, margin: p.margin as number, garbageGap: p.garbageGap as number, listSize: p.listSize as number,
    ...(att !== undefined ? { freeAttPerToken: att as number | null } : {}) };
}
export type Recognizer = (input: { timesMs: number[]; frames: Buffer[] }, signal: AbortSignal) => Promise<RecognizerResult>;

type Utterance = Extract<ClientMessage, { type: 'visual_utterance' }>;
interface Pending { msg: Utterance; frames: Buffer[]; received: number; bytes: number; generation: number; sequence: number; conn: unknown; reject: string | null; answered: boolean; headerAt: number }

export class LiveSession {
  private status: LiveStatus = { authorizationId: null, generation: 0, state: 'off', mode: 'display-only', autoTransmitAllowed: false, reason: 'Live is off.' };
  /** Utterance being received, per connection (frames follow their header on the same socket). */
  private pending = new Map<unknown, Pending>();
  private inflight = new Set<AbortController>();
  /** utteranceIds already answered under the current authorization (exactly one recognition per id). */
  private seen = new Set<string>();
  /** Server acceptance order, independent of client clocks and inference completion order. */
  private latestAccepted = 0;
  /** Shown result of the most recently accepted header, if it succeeded. Never resurrect an earlier review. */
  private latestShown: RecognitionHypothesis | null = null;
  droppedBinary = 0;

  constructor(private recognize: Recognizer, private send: (m: ServerMessage, replyTo?: unknown) => void, private now = () => Date.now()) {}

  get current(): LiveStatus { return { ...this.status }; }
  /** Current review, invalidated immediately by a valid newer header or any Live generation change. */
  reviewTarget(): RecognitionHypothesis | null {
    const h = this.latestShown;
    return h && this.status.state === 'active' && h.generation === this.status.generation && h.authorizationId === this.status.authorizationId ? h : null;
  }
  announce(): void { this.send({ type: 'live_status', status: this.current }); }

  control(msg: Extract<ClientMessage, { type: 'live_control' }>): void {
    const s = this.status;
    const bump = (patch: Partial<LiveStatus>) => {
      for (const c of this.inflight) c.abort();
      this.inflight.clear();
      this.latestShown = null;
      this.status = { ...s, ...patch, generation: s.generation + 1 };
    };
    switch (msg.action) {
      case 'activate':
        if ((msg.mode ?? 'display-only') === 'automatic') { this.status = { ...s, reason: AUTOMATIC_GATED }; break; }
        if (msg.inputSource && msg.inputSource !== 'camera') { this.status = { ...s, reason: 'Only camera input is supported by this recogniser.' }; break; }
        this.seen.clear();
        this.latestShown = null;
        bump({ authorizationId: randomUUID(), state: 'active', mode: 'display-only', reason: 'Live (display only): recognised words are shown to you, not spoken.' });
        break;
      case 'pause': if (s.state === 'active') bump({ state: 'paused', reason: 'Paused.' }); break;
      case 'resume': if (s.state === 'paused') bump({ state: 'active', reason: 'Live (display only).' }); break;
      case 'interrupt': bump({ reason: s.state === 'off' ? s.reason : 'Interrupted: pending utterances dropped.' }); break;
      case 'end': this.latestShown = null; bump({ authorizationId: null, state: 'off', reason: 'Live ended.' }); break;
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
      this.latestAccepted++;
      this.latestShown = null;
      this.send({ type: 'review_invalidated', authorizationId: msg.authorizationId, generation: this.status.generation, utteranceId: msg.utteranceId });
    }
    const p: Pending = { msg, frames: [], received: 0, bytes: 0, generation: this.status.generation, sequence: this.latestAccepted, conn, reject, answered: false, headerAt: this.now() };
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
    const superseded = p.sequence !== this.latestAccepted;
    if (superseded) err = 'Dropped: a newer utterance was accepted.';
    if (p.generation !== this.status.generation) err = 'Dropped: Live was paused, interrupted or ended.';
    // Observable conversation latency (additive keys in `stages`): the browser's own endpoint wait (last detected lip
    // motion → endpoint decision, browser clock, from the header) and the upload of the frames to this server.
    const endpointWait = p.msg.endpointMs - p.msg.endMs;
    const extra = { ...(Number.isFinite(endpointWait) && endpointWait >= 0 ? { endpoint_wait: Math.round(endpointWait) } : {}), upload: Math.round(received - p.headerAt), ...windowStats(p.msg) };
    // Answer the submitting client so its pending request settles; do not replace other clients' newer review UI.
    this.result(p.msg, r, err, this.now() - received, extra, p.generation, superseded ? p.conn : undefined);
  }

  private result(msg: Utterance, r: RecognizerResult | null, err: string | null, ms: number, extra: Record<string, number> = {}, generation?: number, replyTo?: unknown): void {
    const text = (r?.text ?? '').trim();
    const reason = err ?? (r?.error ? r.error : !text ? 'No words decoded.' : null);
    const margin = r?.gate?.nbest_margin_per_token;
    const phrase = reason ? null : phraseMatch(r?.phrase);
    const alts = reason ? [] : alternatives(r?.alternatives, text);
    const h: RecognitionHypothesis = {
      utteranceId: msg.utteranceId, authorizationId: msg.authorizationId, rawText: reason ? '' : text,
      final: true, stable: false,
      uncertainty: typeof margin === 'number' ? { value: margin, kind: 'nbest-margin-per-token', calibrated: false } : null,
      model: r?.model ?? 'unavailable', source: 'visual-model', decision: reason ? 'abstained' : 'shown', reason,
      recognitionMs: ms, stages: r?.ms || Object.keys(extra).length ? { ...(r?.ms ?? {}), ...extra } : null, gate: r?.gate ?? null, transmitted: false,
      phraseMatch: phrase,
      ...(generation !== undefined ? { generation } : {}),
      ...(reason ? {} : { alternatives: alts, reviewCandidates: reviewCandidates(text, alts, phrase), reviewExpiresAt: this.now() + REVIEW_TTL_MS }),
    };
    if (!reason && generation === this.status.generation && msg.authorizationId === this.status.authorizationId) this.latestShown = h;
    this.send({ type: 'recognition_hypothesis', hypothesis: h }, replyTo);
  }
}

/**
 * Segmentation diagnostics from the browser's own header (browser clock, ms), added to `stages` under `win_*` keys:
 * window start/end (last motion) as sent, captured duration, frame count and the largest gap between frames. They let
 * a test reconstruct the timeline of consecutive windows (e.g. repeated phrases) without storing any image.
 */
export function windowStats(msg: Pick<Utterance, 'startMs' | 'endMs' | 'frameTimesMs'>): Record<string, number> {
  const t = Array.isArray(msg.frameTimesMs) ? msg.frameTimesMs : [];
  if (!t.length || !Number.isFinite(msg.startMs) || !Number.isFinite(msg.endMs)) return {};
  let gap = 0;
  for (let i = 1; i < t.length; i++) gap = Math.max(gap, t[i]! - t[i - 1]!);
  return { win_start: Math.round(msg.startMs), win_end: Math.round(msg.endMs), win_ms: Math.round(t.at(-1)! - t[0]!), win_frames: t.length, win_max_gap: Math.round(gap) };
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
