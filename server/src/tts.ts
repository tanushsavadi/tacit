/**
 * Text-to-speech providers.
 *  - ElevenLabs (personal cloned voice) when ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID are set.
 *  - macOS `say` otherwise: a generic SYSTEM voice, never presented as the user's personal voice.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { encodeMulaw } from '../../voice/src/audio/mulaw.ts';
import { parseWav, toMono } from '../../voice/src/audio/wav.ts';

const run = promisify(execFile);

/**
 * macOS `say` executes embedded speech commands written in the text ("[[volm 0]]", "[[slnc 3000]]"), so user text
 * could silence or reshape itself instead of being spoken. A zero-width space between the brackets stops the command
 * parser (measured: "[[slnc 3000]]" then renders as spoken words, not 3 s of silence); the words are unchanged.
 * AVSpeechSynthesizer (tacit-voice) does not execute embedded commands and needs no escaping.
 */
export function sayLiteral(text: string): string {
  return text.replace(/\[\[/g, '[\u200B[');
}

/** 'file' = a playable file (WAV/MP3) for browsers; 'ulaw_8000' = raw G.711 μ-law 8 kHz for telephony. */
export type TtsFormat = 'file' | 'ulaw_8000';

export interface TtsResult {
  audio: Buffer;
  mime: string;
  requestTs: number;
  /** When the first byte of audio was available to send. */
  firstByteTs: number;
  /** The voice that actually produced this audio (differs from the provider label after a fallback). */
  voice: string;
}

export interface Tts {
  /** Shown in the UI, e.g. "elevenlabs:<voice>" or "macos-say (system voice, not personal)". */
  label: string;
  personal: boolean;
  /** `signal` aborts synthesis (e.g. the user stopped voice output while it was being generated). */
  synth(text: string, format?: TtsFormat, signal?: AbortSignal): Promise<TtsResult>;
}

export function macSay(voice = process.env.SAY_VOICE): Tts {
  const label = `macos-say${voice ? `:${voice}` : ''} (system voice, not personal)`;
  return {
    label,
    personal: false,
    async synth(text, format = 'file', signal) {
      const requestTs = Date.now();
      const rate = format === 'ulaw_8000' ? 8000 : 22050;
      const dir = await mkdtemp(join(tmpdir(), 'tacit-tts-'));
      const out = join(dir, 'reply.wav');
      try {
        const args = ['-o', out, '--file-format=WAVE', `--data-format=LEI16@${rate}`];
        if (voice) args.push('-v', voice);
        args.push('--', sayLiteral(text));
        await run('say', args, { timeout: 15_000, signal });
        const wav = await readFile(out);
        if (format === 'ulaw_8000') {
          return { audio: encodeMulaw(toMono(parseWav(wav))), mime: 'audio/x-mulaw;rate=8000', requestTs, firstByteTs: Date.now(), voice: label };
        }
        return { audio: wav, mime: 'audio/wav', requestTs, firstByteTs: Date.now(), voice: label };
      } finally {
        void rm(dir, { recursive: true, force: true });
      }
    },
  };
}

export interface ElevenLabsOptions {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/** Personal voice via ElevenLabs. MP3 (CBR 128 kbps) for browsers, raw μ-law 8 kHz for Twilio. */
export function elevenLabs(o: ElevenLabsOptions): Tts {
  const modelId = o.modelId ?? 'eleven_flash_v2_5';
  const base = (o.baseUrl ?? 'https://api.elevenlabs.io').replace(/\/$/, '');
  const label = `elevenlabs:${o.voiceId} (${modelId}, personal voice)`;
  return {
    label,
    personal: true,
    async synth(text, format = 'file', signal) {
      const requestTs = Date.now();
      const outFmt = format === 'ulaw_8000' ? 'ulaw_8000' : 'mp3_44100_128';
      const res = await fetch(`${base}/v1/text-to-speech/${encodeURIComponent(o.voiceId)}?output_format=${outFmt}`, {
        method: 'POST',
        headers: { 'xi-api-key': o.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: modelId }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(o.timeoutMs ?? 10_000)]) : AbortSignal.timeout(o.timeoutMs ?? 10_000),
      });
      if (!res.ok || !res.body) throw new Error(`ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      const chunks: Buffer[] = [];
      let firstByteTs = 0;
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        if (!firstByteTs) firstByteTs = Date.now();
        chunks.push(Buffer.from(chunk));
      }
      let audio: Buffer = Buffer.concat(chunks);
      if (!audio.length) throw new Error('ElevenLabs returned no audio');
      if (format === 'ulaw_8000') audio = stripWavHeader(audio); // defensive: Twilio needs raw μ-law
      const mime = format === 'ulaw_8000' ? 'audio/x-mulaw;rate=8000' : 'audio/mpeg';
      return { audio, mime, requestTs, firstByteTs: firstByteTs || Date.now(), voice: label };
    },
  };
}

/** If a RIFF/WAVE container slipped through, return only its data chunk. */
export function stripWavHeader(buf: Buffer): Buffer {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return buf;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'data') return buf.subarray(off + 8, Math.min(buf.length, off + 8 + size));
    off += 8 + size + (size & 1);
  }
  return buf;
}

/** Audio length from the bytes we actually send. */
export function audioDurationMs(audio: Buffer, mime: string): number | null {
  if (mime.startsWith('audio/x-mulaw')) return audio.length / 8;
  if (mime === 'audio/wav' && audio.length >= 44 && audio.toString('ascii', 0, 4) === 'RIFF') {
    const byteRate = audio.readUInt32LE(28);
    return byteRate ? ((audio.length - 44) / byteRate) * 1000 : null;
  }
  if (mime === 'audio/mpeg') return (audio.length * 8) / 128; // mp3_44100_128 is constant 128 kbps
  return null;
}

export interface VoiceCheck {
  ok: boolean;
  name?: string;
  category?: string;
  /** True only for cloned/professional voices; premade/generated library voices are not the user's voice. */
  personal: boolean;
  error?: string;
}

/** GET /v1/voices/{id}: confirms the configured voice exists and whether it is a cloned (personal) voice. */
export async function checkElevenLabsVoice(apiKey: string, voiceId: string, baseUrl = 'https://api.elevenlabs.io'): Promise<VoiceCheck> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/voices/${encodeURIComponent(voiceId)}`, { headers: { 'xi-api-key': apiKey }, signal: AbortSignal.timeout(8_000) });
    const body = (await res.json().catch(() => ({}))) as { name?: string; category?: string; detail?: unknown };
    if (!res.ok) return { ok: false, personal: false, error: `HTTP ${res.status}` };
    return { ok: true, name: body.name, category: body.category, personal: body.category === 'cloned' || body.category === 'professional' };
  } catch (e) {
    return { ok: false, personal: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Chooses the voice for every synthesis under the USER's session policy (`set_voice_policy`):
 *  - No personal voice configured → the labelled system voice (that is the expected voice; nothing substituted).
 *  - Personal voice configured → used for every reply. If it fails or is unavailable, NOTHING is synthesized or sent
 *    unless the user has explicitly allowed the system voice for this session (`allowSystemFallback`, default false);
 *    substituted audio is labelled as such.
 *  - Speculative pre-synthesis of displayed options: always allowed for the local system voice; for the personal
 *    voice only after explicit user opt-in (`personalPresynth`, default false). TTS_PRESYNTH=off disables both.
 */
export interface VoicePolicy {
  allowSystemFallback: boolean;
  personalPresynth: boolean;
}

export class VoiceRouter implements Tts {
  policy: VoicePolicy = { allowSystemFallback: false, personalPresynth: false };
  /** Bumped whenever policy or availability changes so cached audio from an old policy is never reused. */
  private version = 0;

  constructor(
    readonly system: Tts,
    readonly personalTts: Tts | null,
    public personalError: string | null = null,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  get personal(): boolean {
    return this.personalTts !== null;
  }

  get label(): string {
    return this.personalTts ? this.personalTts.label : this.system.label;
  }

  setPolicy(patch: Partial<VoicePolicy>): void {
    this.policy = { ...this.policy, ...patch };
    this.version += 1;
  }

  disablePersonal(reason: string): void {
    this.personalError = reason;
    this.version += 1;
  }

  cacheKey(): string {
    return String(this.version);
  }

  presynthAllowed(): boolean {
    if (this.env.TTS_PRESYNTH === 'off') return false;
    if (!this.personalTts) return true; // local system voice; nothing leaves the machine before confirmation
    if (this.personalError) return this.policy.allowSystemFallback; // would be the (approved) system voice
    return this.policy.personalPresynth;
  }

  async synth(text: string, format?: TtsFormat, signal?: AbortSignal): Promise<TtsResult> {
    if (!this.personalTts) return this.system.synth(text, format, signal);
    let reason: string;
    if (this.personalError) reason = `unavailable (${this.personalError})`;
    else {
      try {
        return await this.personalTts.synth(text, format, signal);
      } catch (e) {
        if (signal?.aborted) throw e; // cancelled by the user: never fall back to another voice
        reason = `failed (${(e instanceof Error ? e.message : String(e)).slice(0, 80)})`;
      }
    }
    if (!this.policy.allowSystemFallback) throw new Error(`Personal voice ${reason}. The system voice is not approved for this session`);
    console.warn(`[tts] personal voice ${reason}; user-approved system voice substituted`);
    const r = await this.system.synth(text, format, signal);
    return { ...r, voice: `${this.system.label} — SUBSTITUTED for your personal voice (approved fallback; personal voice ${reason})` };
  }

  status() {
    return {
      personalConfigured: this.personalTts !== null,
      personalAvailable: this.personalTts !== null && this.personalError === null,
      personalVoice: this.personalTts?.label ?? null,
      personalError: this.personalError,
      systemVoice: this.system.label,
      allowSystemFallback: this.policy.allowSystemFallback,
      personalPresynth: this.policy.personalPresynth,
      presynthActive: this.presynthAllowed(),
    };
  }
}

/**
 * Personal voice requires: API key, voice ID, AND ELEVENLABS_VOICE_CONSENT=self (the user affirms the voice is
 * their own, cloned with their consent). `reason` explains why the personal voice is not configured.
 */
export function createTts(env = process.env): { tts: VoiceRouter; reason: string | null } {
  const system = macSay(env.SAY_VOICE);
  const key = env.ELEVENLABS_API_KEY;
  const voiceId = env.ELEVENLABS_VOICE_ID;
  if (!key || !voiceId) return { tts: new VoiceRouter(system, null, null, env), reason: 'ElevenLabs key/voice ID not configured' };
  if (env.ELEVENLABS_VOICE_CONSENT !== 'self') return { tts: new VoiceRouter(system, null, null, env), reason: 'ELEVENLABS_VOICE_CONSENT=self not set — personal voice disabled' };
  const el = elevenLabs({ apiKey: key, voiceId, modelId: env.ELEVENLABS_MODEL, baseUrl: env.ELEVENLABS_BASE_URL });
  return { tts: new VoiceRouter(system, el, null, env), reason: null };
}

/**
 * Per-call cache of synthesized replies. `prepare()` synthesizes the displayed options while the user is still
 * choosing; NOTHING is sent until the controller's confirmed speak(). Whether it runs is decided per call by the
 * voice policy (system voice: yes; personal voice: only with the user's opt-in).
 */
export class TtsCache {
  private readonly cache = new Map<string, Promise<TtsResult>>();

  constructor(private readonly tts: Tts, private readonly format: TtsFormat, private readonly enabledOverride?: boolean) {}

  get enabled(): boolean {
    if (this.enabledOverride !== undefined) return this.enabledOverride;
    const router = this.tts as Partial<VoiceRouter>;
    if (typeof router.presynthAllowed === 'function') return router.presynthAllowed.call(this.tts);
    return process.env.TTS_PRESYNTH !== 'off' && !this.tts.personal;
  }

  private key(text: string): string {
    const router = this.tts as Partial<VoiceRouter>;
    return `${typeof router.cacheKey === 'function' ? router.cacheKey.call(this.tts) : ''}|${text}`;
  }

  prepare(texts: string[]): void {
    if (!this.enabled) return;
    for (const text of texts) {
      const k = this.key(text);
      if (this.cache.has(k)) continue;
      const p = this.tts.synth(text, this.format);
      p.catch(() => this.cache.delete(k)); // a failed pre-synthesis is simply retried at speak time
      this.cache.set(k, p);
    }
    while (this.cache.size > 12) this.cache.delete(this.cache.keys().next().value!);
  }

  /** Cached (possibly still in flight) synthesis under the CURRENT policy, or a fresh one. */
  async get(text: string): Promise<TtsResult & { cached: boolean }> {
    const k = this.key(text);
    const hit = this.cache.get(k);
    if (hit) {
      try {
        return { ...(await hit), cached: true };
      } catch {
        this.cache.delete(k);
      }
    }
    return { ...(await this.tts.synth(text, this.format)), cached: false };
  }
}
