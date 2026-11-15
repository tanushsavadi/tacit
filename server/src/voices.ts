// My Voice: which voice speaks the user's approved words.
//
//   VoiceHelper  supervises `tacit-voice serve` (one warm AVSpeechSynthesizer; lists installed voices, renders WAV).
//   MyVoice      registry (installed Apple voices + the consented ElevenLabs clone + the `say` default), the user's
//                persisted selection, safe fallback, and per-request voice BINDING for SpeechOutput.
//
// Rules: a voice never changes the words (text passes through unchanged); a request is bound to the voice that was
// effective when the user approved it, so a later voice change never alters it; a bound voice that fails makes the
// delivery fail ("nothing was sent") — no silent substitution; Apple Personal Voice is listed for status only.
import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { VoiceControlRange, VoiceOption, VoiceSettings, VoiceStatus } from '../../shared/protocol.ts';
import type { Tts, TtsFormat, TtsResult } from './tts.ts';

export const PREFS_FILE = fileURLToPath(new URL('../data/voice-prefs.json', import.meta.url));
export const SYSTEM_DEFAULT_ID = 'system:default';

export const SAMPLE_PHRASES: readonly string[] = Object.freeze([
  "Hi, it's me. Thanks for waiting while I get my words out.",
  'Could you say that again, a little more slowly?',
  "I'd like a large coffee with oat milk, please.",
  'Give me a moment, I am thinking about that.',
]);
export const MAX_PREVIEW_CHARS = 200;

/** AVSpeechUtterance.rate (0–1, default 0.5) and pitchMultiplier: kept to a comfortable, understandable range. */
export const APPLE_RATE: VoiceControlRange = Object.freeze({ min: 0.3, max: 0.7, default: 0.5, step: 0.05 });
/** Measured on Samantha: ×1.3 raises median F0 171 → 223 Hz; ×0.75 only → 160 Hz. Not an effects range. */
export const APPLE_PITCH: VoiceControlRange = Object.freeze({ min: 0.8, max: 1.25, default: 1.0, step: 0.05 });

export interface AppleVoice { identifier: string; name: string; language: string; quality: string; novelty: boolean; personal: boolean }
export interface AppleCatalog { voices: AppleVoice[]; defaultVoice: string | null; personalVoiceAuthorization: string }
export interface HelperRender { wav: Buffer; sampleRate: number; durationMs: number; firstBufferMs: number | null; totalMs: number; peak: number }

type Spawn = (bin: string, args: string[]) => ChildProcess;

export function voiceBinary(): string | null {
  const p = process.env.TACIT_VOICE_BIN ?? fileURLToPath(new URL('../../macos/TacitVoice/.build/release/tacit-voice', import.meta.url));
  return existsSync(p) ? p : null;
}

/** Supervises `tacit-voice serve`. Requests are matched by id; the helper renders strictly in order. */
export class VoiceHelper extends EventEmitter {
  state: 'starting' | 'ready' | 'unavailable' = 'starting';
  reason: string | null = 'Voice engine starting.';
  catalog: AppleCatalog | null = null;
  private child: ChildProcess | null = null;
  private seq = 0;
  private restarts = 0;
  private closed = false;
  private open = new Map<string, { resolve: (r: HelperRender) => void; reject: (e: Error) => void; path: string; dir: string }>();
  private listWaiters: ((c: AppleCatalog) => void)[] = [];
  static readonly TIMEOUT_MS = 25_000;

  constructor(private readonly bin: string, private readonly spawnFn: Spawn = (b, a) => nodeSpawn(b, a, { stdio: ['pipe', 'pipe', 'pipe'] })) {
    super();
    this.launch();
  }

  private launch(): void {
    const child = this.spawnFn(this.bin, ['serve']);
    this.child = child;
    createInterface({ input: child.stdout! }).on('line', (l) => this.onLine(l));
    child.stderr?.on('data', () => { /* never prints content */ });
    child.stdin?.on('error', () => this.failAll('voice helper pipe closed'));
    child.on('error', (e) => this.set('unavailable', `voice helper failed to start: ${e.message}`));
    child.on('exit', (code) => {
      if (this.child === child) this.child = null;
      this.failAll('voice helper exited');
      if (this.closed) return;
      if (++this.restarts <= 5) {
        this.set('starting', `voice helper exited (${code}); restarting`);
        setTimeout(() => !this.closed && this.launch(), 500 * this.restarts).unref();
      } else this.set('unavailable', 'voice helper keeps exiting');
    });
  }

  private set(state: VoiceHelper['state'], reason: string | null): void {
    this.state = state; this.reason = reason;
    this.emit('change');
  }

  private onLine(line: string): void {
    let e: Record<string, unknown>;
    try { e = JSON.parse(line); } catch { return; }
    const id = typeof e.id === 'string' ? e.id : '';
    switch (e.event) {
      case 'ready':
      case 'voices': {
        this.catalog = parseCatalog(e);
        for (const w of this.listWaiters.splice(0)) w(this.catalog);
        if (e.event === 'ready') { this.restarts = 0; this.set('ready', null); this.warm(); } else this.emit('change');
        break;
      }
      case 'done': {
        const o = this.open.get(id);
        if (!o) return;
        this.open.delete(id);
        readFile(o.path).then((wav) => o.resolve({ wav, sampleRate: Number(e.sampleRate), durationMs: Number(e.durationMs),
          firstBufferMs: typeof e.firstBufferMs === 'number' ? e.firstBufferMs : null, totalMs: Number(e.totalMs), peak: Number(e.peak) }),
        (err: unknown) => o.reject(new Error(`could not read rendered audio: ${err instanceof Error ? err.message : String(err)}`)))
          .finally(() => void rm(o.dir, { recursive: true, force: true }));
        break;
      }
      case 'cancelled': this.settleError(id, 'cancelled'); break;
      case 'error': if (id) this.settleError(id, String(e.message ?? 'voice helper error')); break;
    }
  }

  /** The first render after launch pays ~0.6 s of speech-service start-up; pay it now, not on the user's message. */
  private warm(): void {
    const v = this.catalog?.defaultVoice;
    if (v) this.render({ voice: v, text: 'Ready.' }).catch(() => { /* best effort */ });
  }

  private settleError(id: string, message: string): void {
    const o = this.open.get(id);
    if (!o) return;
    this.open.delete(id);
    void rm(o.dir, { recursive: true, force: true });
    o.reject(new Error(message));
  }

  private failAll(reason: string): void { for (const id of [...this.open.keys()]) this.settleError(id, reason); }

  private send(o: object): boolean {
    if (!this.child?.stdin?.writable) return false;
    this.child.stdin.write(`${JSON.stringify(o)}\n`);
    return true;
  }

  /** Re-read the installed voices (resolves with the current catalog if the helper does not answer in 3 s). */
  refresh(): Promise<AppleCatalog | null> {
    if (!this.send({ op: 'list' })) return Promise.resolve(this.catalog);
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(this.catalog), 3000);
      this.listWaiters.push((c) => { clearTimeout(t); resolve(c); });
    });
  }

  async render(o: { voice: string; text: string; rate?: number; pitch?: number }, signal?: AbortSignal): Promise<HelperRender> {
    if (this.state !== 'ready') throw new Error(`voice engine ${this.state}${this.reason ? ` (${this.reason})` : ''}`);
    if (signal?.aborted) throw new Error('cancelled');
    const id = `v${++this.seq}`;
    const dir = await mkdtemp(join(tmpdir(), 'tacit-voice-')); // 0700; removed when the request settles
    const path = join(dir, 'speech.wav');
    return new Promise<HelperRender>((resolve, reject) => {
      const timer = setTimeout(() => { this.send({ op: 'cancel', id }); this.settleError(id, 'voice helper timed out'); }, VoiceHelper.TIMEOUT_MS);
      timer.unref();
      const onAbort = () => { this.send({ op: 'cancel', id }); this.settleError(id, 'cancelled'); };
      signal?.addEventListener('abort', onAbort, { once: true });
      const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
      this.open.set(id, { resolve: (r) => { done(); resolve(r); }, reject: (e) => { done(); reject(e); }, path, dir });
      const msg: Record<string, unknown> = { op: 'synth', id, voice: o.voice, text: o.text, path };
      if (o.rate !== undefined) msg.rate = o.rate;
      if (o.pitch !== undefined) msg.pitch = o.pitch;
      if (!this.send(msg)) this.settleError(id, 'voice helper not running');
    });
  }

  close(): void {
    this.closed = true;
    this.send({ op: 'quit' });
    this.child?.stdin?.end();
    for (const o of this.open.values()) rmSync(o.dir, { recursive: true, force: true });
    this.failAll('server shutting down');
  }
}

export function parseCatalog(e: Record<string, unknown>): AppleCatalog {
  const voices = Array.isArray(e.voices) ? e.voices.filter((v): v is AppleVoice =>
    !!v && typeof v === 'object' && typeof (v as AppleVoice).identifier === 'string' && typeof (v as AppleVoice).name === 'string'
    && typeof (v as AppleVoice).language === 'string') : [];
  return { voices, defaultVoice: typeof e.defaultVoice === 'string' ? e.defaultVoice : null,
    personalVoiceAuthorization: typeof e.personalVoiceAuthorization === 'string' ? e.personalVoiceAuthorization : 'unknown' };
}

// ───────────────────────────── registry + selection ─────────────────────────────

/** A request's voice, frozen when the user approved it. */
export interface VoiceBinding { voiceId: string; label: string; rate?: number; pitch?: number; revision: number }
export type BindResult = { ok: true; binding: VoiceBinding } | { ok: false; reason: string };

export interface VoiceRenderer { render(o: { voice: string; text: string; rate?: number; pitch?: number }, signal?: AbortSignal): Promise<HelperRender> }
export interface VoiceEngine extends VoiceRenderer {
  state: 'starting' | 'ready' | 'unavailable';
  reason: string | null;
  catalog: AppleCatalog | null;
  refresh(): Promise<AppleCatalog | null>;
  on(ev: 'change', fn: () => void): unknown;
}

interface Prefs { voiceId: string; rate?: number; pitch?: number }

export interface MyVoiceOptions {
  engine: VoiceEngine | null;
  /** macOS `say` default voice: used when the helper is missing, and as the selection fallback. */
  system: Tts;
  /** The consented ElevenLabs clone (VoiceRouter with its own approved-fallback policy), when configured. */
  personal: { tts: Tts; voiceId: string; available: () => boolean; reason: () => string | null } | null;
  customReason?: string | null;
  prefsPath?: string;
  now?: () => number;
}

const AUTH_STATES = ['notDetermined', 'denied', 'unsupported', 'authorized'] as const;

export class MyVoice extends EventEmitter {
  private prefs: Prefs | null = null;
  private source: 'default' | 'saved' | 'user' = 'default';
  private persistError: string | null = null;
  private revision = 0;
  private lastKey = '';
  private lastChange: VoiceStatus['lastChange'] = null;
  private readonly prefsPath: string;
  private readonly now: () => number;

  constructor(private readonly o: MyVoiceOptions) {
    super();
    this.prefsPath = o.prefsPath ?? PREFS_FILE;
    this.now = o.now ?? Date.now;
    this.load();
    o.engine?.on('change', () => this.changed());
    this.changed();
  }

  // ── registry ──
  voices(): VoiceOption[] {
    const out: VoiceOption[] = [];
    const engine = this.o.engine;
    const engineReady = engine?.state === 'ready';
    for (const v of engine?.catalog?.voices ?? []) {
      const locale = v.language;
      const personal = v.personal;
      out.push({
        id: `apple:${v.identifier}`, name: v.name, locale, language: locale.split('-')[0]!.toLowerCase(), provider: 'apple-speech',
        quality: v.quality === 'enhanced' || v.quality === 'premium' ? v.quality : 'default',
        kind: personal ? 'apple-personal-voice' : 'system', novelty: !!v.novelty,
        available: engineReady && !personal,
        unavailableReason: personal ? PERSONAL_VOICE_REASON : engineReady ? null : `Voice engine ${engine?.state}.`,
        local: true, controls: personal ? {} : { rate: APPLE_RATE, pitch: APPLE_PITCH },
      });
    }
    const p = this.o.personal;
    if (p) {
      out.push({ id: `elevenlabs:${p.voiceId}`, name: 'Your cloned voice (ElevenLabs)', locale: 'und', language: 'und', provider: 'elevenlabs',
        quality: null, kind: 'personal-clone', novelty: false, available: p.available(), unavailableReason: p.available() ? null : p.reason(),
        local: false, controls: {} });
    }
    out.push({ id: SYSTEM_DEFAULT_ID, name: 'macOS default voice', locale: 'und', language: 'und', provider: 'macos-say', quality: null,
      kind: 'system', novelty: false, available: true, unavailableReason: null, local: true, controls: {} });
    return out;
  }

  private find(id: string): VoiceOption | undefined { return this.voices().find((v) => v.id === id); }

  /** Default when the user never chose: the consented clone (today's behaviour), else the macOS default voice. */
  private defaultSettings(): VoiceSettings {
    const p = this.o.personal;
    if (p) return { voiceId: `elevenlabs:${p.voiceId}` };
    const d = this.o.engine?.state === 'ready' ? this.o.engine.catalog?.defaultVoice : null;
    return d ? { voiceId: `apple:${d}` } : { voiceId: SYSTEM_DEFAULT_ID };
  }

  private selected(): VoiceSettings { return this.prefs ? { ...this.prefs } : this.defaultSettings(); }

  /** Validate settings against the registry: available voice, controls it supports, values in range. */
  check(s: { voiceId: unknown; rate?: unknown; pitch?: unknown }): { ok: true; settings: VoiceSettings; voice: VoiceOption } | { ok: false; reason: string } {
    if (typeof s.voiceId !== 'string' || !s.voiceId || s.voiceId.length > 300) return { ok: false, reason: 'Unknown voice.' };
    const v = this.find(s.voiceId);
    if (!v) return { ok: false, reason: 'That voice is not installed on this Mac.' };
    if (!v.available) return { ok: false, reason: `That voice is unavailable: ${v.unavailableReason ?? 'unknown reason'}` };
    const out: VoiceSettings = { voiceId: v.id };
    for (const k of ['rate', 'pitch'] as const) {
      const val = s[k];
      if (val === undefined || val === null) continue;
      const range = v.controls[k];
      if (!range) return { ok: false, reason: `${v.name} does not support adjusting ${k}.` };
      if (typeof val !== 'number' || !Number.isFinite(val) || val < range.min || val > range.max) return { ok: false, reason: `${k} must be between ${range.min} and ${range.max}.` };
      if (val !== range.default) out[k] = val;
    }
    return { ok: true, settings: out, voice: v };
  }

  /** The effective voice now (selected, or a labelled fallback when the selected voice is unavailable). */
  private effective(): { settings: VoiceSettings; label: string; fallback: string | null } {
    const sel = this.selected();
    const ok = this.check(sel);
    if (ok.ok) return { settings: ok.settings, label: labelFor(ok.voice, ok.settings), fallback: null };
    // The personal clone is NEVER replaced here (AGENTS.md): it stays bound, and VoiceRouter refuses the message or
    // labels an approved substitution per the user's set_voice_policy. If the clone is gone, synthesis fails.
    if (sel.voiceId.startsWith('elevenlabs:')) return { settings: { voiceId: sel.voiceId }, label: 'Your cloned voice (ElevenLabs, personal voice) — currently unavailable', fallback: null };
    const want = this.find(sel.voiceId);
    const why = `Your chosen voice${want ? ` "${want.name}"` : ''} is unavailable (${ok.reason.replace(/\.$/, '')}); using the macOS default voice until it is back.`;
    const sys = this.find(SYSTEM_DEFAULT_ID)!;
    return { settings: { voiceId: SYSTEM_DEFAULT_ID }, label: `${labelFor(sys, {})} — fallback: your chosen voice is unavailable`, fallback: why };
  }

  get label(): string { return this.effective().label; }

  status(): VoiceStatus {
    const eff = this.effective();
    const engine = this.o.engine;
    const auth = engine?.catalog?.personalVoiceAuthorization;
    const p = this.o.personal;
    return {
      revision: this.revision,
      selected: { ...this.selected(), source: this.source },
      effective: { ...eff.settings, label: eff.label },
      fallback: eff.fallback,
      persisted: this.prefs !== null && this.persistError === null,
      persistError: this.persistError,
      voices: this.voices(),
      samples: [...SAMPLE_PHRASES],
      engine: engine ? { state: engine.state, reason: engine.reason }
        : { state: 'unavailable', reason: 'tacit-voice is not built: run ./scripts/tacit.sh build (only the macOS default voice is offered).' },
      applePersonalVoice: { authorization: (AUTH_STATES as readonly string[]).includes(auth ?? '') ? auth as VoiceStatus['applePersonalVoice']['authorization'] : 'unknown',
        usableInCalls: false, reason: PERSONAL_VOICE_REASON },
      custom: { provider: 'elevenlabs', configured: !!p, available: !!p?.available(), reason: p ? p.reason() : (this.o.customReason ?? 'Not configured.') },
      lastChange: this.lastChange,
    };
  }

  /** Recompute; bump the revision only if what would speak changed. */
  changed(): void {
    const eff = this.effective();
    const key = JSON.stringify([eff.settings, eff.label]);
    if (key !== this.lastKey) { this.lastKey = key; this.revision += 1; }
    this.emit('status', this.status());
  }

  async refresh(): Promise<void> {
    await this.o.engine?.refresh();
    this.changed();
  }

  // ── selection ──
  select(msg: { requestId?: unknown; voiceId: unknown; rate?: unknown; pitch?: unknown }): { ok: boolean; reason: string | null } {
    const requestId = typeof msg.requestId === 'string' && msg.requestId.length <= 100 ? msg.requestId : null;
    const result = (ok: boolean, reason: string | null) => {
      this.lastChange = { requestId, ok, reason, at: this.now() };
      this.changed();
      return { ok, reason };
    };
    if (msg.voiceId === null) {
      this.prefs = null; this.source = 'default';
      this.persistError = this.remove();
      return result(true, null);
    }
    const c = this.check({ voiceId: msg.voiceId, rate: msg.rate, pitch: msg.pitch });
    if (!c.ok) return result(false, c.reason);
    this.prefs = c.settings; this.source = 'user';
    this.persistError = this.save(c.settings);
    return result(true, this.persistError ? `Voice changed for this session, but it could not be saved: ${this.persistError}` : null);
  }

  /** Bind a request to the effective voice. `revision` (optional) must match what the user saw. */
  bind(revision: unknown): BindResult {
    if (revision !== undefined && typeof revision !== 'number') return { ok: false, reason: 'Invalid voice revision.' };
    if (typeof revision === 'number' && revision !== this.revision) {
      return { ok: false, reason: 'Your voice changed after this was shown; press Speak again to use the new voice.' };
    }
    const eff = this.effective();
    return { ok: true, binding: { ...eff.settings, label: eff.label, revision: this.revision } };
  }

  /** A preview's voice: any available voice with valid settings, without changing the selection. */
  bindPreview(s: { voiceId: unknown; rate?: unknown; pitch?: unknown }): BindResult {
    const c = this.check(s);
    if (!c.ok) return c;
    return { ok: true, binding: { ...c.settings, label: labelFor(c.voice, c.settings), revision: this.revision } };
  }

  /** Render `text` (unchanged) with a bound voice. No substitution here: a failing voice fails the request. */
  async synth(text: string, format: TtsFormat = 'file', signal?: AbortSignal, binding?: VoiceBinding): Promise<TtsResult> {
    const b = binding ?? (this.bind(undefined) as { binding: VoiceBinding }).binding;
    const requestTs = this.now();
    if (b.voiceId.startsWith('apple:')) {
      if (format !== 'file') throw new Error('Apple voices render WAV files only');
      if (!this.o.engine) throw new Error('voice engine not built');
      const r = await this.o.engine.render({ voice: b.voiceId.slice('apple:'.length), text, rate: b.rate, pitch: b.pitch }, signal);
      if (!(r.peak > 1e-4)) throw new Error('the voice rendered silence');
      return { audio: r.wav, mime: 'audio/wav', requestTs, firstByteTs: this.now(), voice: b.label };
    }
    if (b.voiceId.startsWith('elevenlabs:')) {
      const p = this.o.personal;
      if (!p || b.voiceId !== `elevenlabs:${p.voiceId}`) throw new Error('your cloned voice is no longer configured');
      return p.tts.synth(text, format, signal); // VoiceRouter: refuses or labels substitution per the user's policy
    }
    if (b.voiceId === SYSTEM_DEFAULT_ID) {
      const r = await this.o.system.synth(text, format, signal);
      return { ...r, voice: b.label };
    }
    throw new Error('unknown voice');
  }

  // ── persistence (server/data, git-ignored; 0600; atomic) ──
  private load(): void {
    try {
      if (!existsSync(this.prefsPath)) return;
      const raw = JSON.parse(readFileSync(this.prefsPath, 'utf8')) as { version?: number; voiceId?: unknown; rate?: unknown; pitch?: unknown };
      if (raw.version !== 1 || typeof raw.voiceId !== 'string') { this.persistError = 'saved voice preference is unreadable; using the default'; return; }
      this.prefs = { voiceId: raw.voiceId };
      if (typeof raw.rate === 'number') this.prefs.rate = raw.rate;
      if (typeof raw.pitch === 'number') this.prefs.pitch = raw.pitch;
      this.source = 'saved';
    } catch (e) {
      this.persistError = `saved voice preference is unreadable (${e instanceof Error ? e.message : String(e)}); using the default`;
    }
  }

  private save(s: VoiceSettings): string | null {
    try {
      mkdirSync(dirname(this.prefsPath), { recursive: true, mode: 0o700 });
      const tmp = `${this.prefsPath}.${process.pid}.tmp`;
      writeFileSync(tmp, `${JSON.stringify({ version: 1, ...s, savedAt: new Date(this.now()).toISOString() }, null, 2)}\n`, { mode: 0o600 });
      renameSync(tmp, this.prefsPath);
      return null;
    } catch (e) { return e instanceof Error ? e.message : String(e); }
  }

  private remove(): string | null {
    try { rmSync(this.prefsPath, { force: true }); return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
  }
}

export const PERSONAL_VOICE_REASON = 'Apple Personal Voice cannot be used for call audio by TACIT: Apple does not allow apps to capture '
  + 'Personal Voice speech, and macOS offers apps no supported way to speak into a call. Apple\'s own Live Speech can use your '
  + 'Personal Voice in calls (documented for FaceTime on Mac; not verified for Google Meet).';

export function labelFor(v: VoiceOption, s: { rate?: number; pitch?: number }): string {
  const adj = [s.rate !== undefined ? `rate ${s.rate}` : '', s.pitch !== undefined ? `pitch ×${s.pitch}` : ''].filter(Boolean).join(', ');
  switch (v.provider) {
    case 'apple-speech': return `${v.name} (${v.locale}, macOS voice, on this Mac${adj ? `; ${adj}` : ''})`;
    case 'elevenlabs': return 'Your cloned voice (ElevenLabs, personal voice)';
    default: return 'macOS default voice (system voice, not personal)';
  }
}
