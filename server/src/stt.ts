/**
 * Server-side speech-to-text for raw caller audio (Twilio PSTN).
 *  - Segmenter: energy-based endpointing over 16-bit PCM (adaptive noise floor, pre-roll, hangover).
 *  - whisperCpp: local whisper.cpp (`whisper-cli`) transcription — no network, no credentials.
 */
import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { rms, resamplePcm16 } from '../../voice/src/audio/pcm.ts';
import { writeWav } from '../../voice/src/audio/wav.ts';

const run = promisify(execFile);

export interface Segment {
  pcm: Int16Array;
  sampleRate: number;
  /** Epoch ms of detected speech onset / offset (offset = last voiced frame, before hangover). */
  startTs: number;
  endTs: number;
}

export interface SegmenterOptions {
  sampleRate: number;
  frameMs?: number;
  /** Consecutive voiced time needed to declare speech. */
  onsetMs?: number;
  /** Unvoiced time after speech that ends the utterance. */
  hangoverMs?: number;
  preRollMs?: number;
  minSpeechMs?: number;
  maxSpeechMs?: number;
  /** Absolute RMS floor for "voiced", whatever the noise estimate says. */
  minThreshold?: number;
  /** Starting background-noise RMS estimate (adapts during non-speech). */
  initialNoise?: number;
  now?: () => number;
}

/** Emits 'start' (ts) when speech begins and 'segment' (Segment) when an utterance ends. */
export class Segmenter extends EventEmitter {
  private readonly o: Required<SegmenterOptions>;
  private readonly frameLen: number;
  private carry = new Int16Array(0);
  private noise: number;
  /** Recent frame levels (~3 s); the noise floor is a low percentile of these, so steady background raises it. */
  private levels: number[] = [];
  private voicedRun = 0;
  private silentRun = 0;
  private inSpeech = false;
  private frames: Int16Array[] = [];
  private preRoll: Int16Array[] = [];
  private startTs = 0;
  private lastVoicedTs = 0;
  /** Audio time (ms of samples received). Durations use this, not the wall clock, so bursty delivery is safe. */
  private streamMs = 0;
  private startStream = 0;
  private lastVoicedStream = 0;
  private enabled = true;

  constructor(opts: SegmenterOptions) {
    super();
    this.o = {
      frameMs: 20, onsetMs: 100, hangoverMs: Number(process.env.STT_HANGOVER_MS ?? 700), preRollMs: 200, minSpeechMs: 250, maxSpeechMs: 15_000,
      minThreshold: Number(process.env.STT_MIN_RMS ?? 150), initialNoise: 50, now: Date.now, ...opts,
    };
    this.noise = this.o.initialNoise;
    this.frameLen = Math.round((this.o.sampleRate * this.o.frameMs) / 1000);
  }

  /** While disabled (e.g. TACIT is talking), audio is discarded and any partial utterance is dropped. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.reset();
  }

  private reset(): void {
    this.inSpeech = false;
    this.voicedRun = this.silentRun = 0;
    this.frames = [];
    this.preRoll = [];
  }

  feed(pcm: Int16Array): void {
    const buf = new Int16Array(this.carry.length + pcm.length);
    buf.set(this.carry);
    buf.set(pcm, this.carry.length);
    let off = 0;
    for (; off + this.frameLen <= buf.length; off += this.frameLen) this.frame(buf.subarray(off, off + this.frameLen));
    this.carry = buf.slice(off);
  }

  private frame(f: Int16Array): void {
    if (!this.enabled) return;
    const now = this.o.now();
    this.streamMs += this.o.frameMs;
    const level = rms(f);
    this.levels.push(level);
    if (this.levels.length > 150) this.levels.shift();
    // Low-percentile noise tracking: word gaps keep it low during speech; steady noise lifts it.
    const warm = this.levels.length >= 15;
    if (warm) this.noise = [...this.levels].sort((a, b) => a - b)[Math.floor(this.levels.length * 0.1)]!;
    const threshold = Math.max(this.o.minThreshold, this.noise * 3);
    const voiced = warm && level > threshold;
    const copy = f.slice();

    if (!this.inSpeech) {
      this.preRoll.push(copy);
      const keep = Math.ceil(this.o.preRollMs / this.o.frameMs) + Math.ceil(this.o.onsetMs / this.o.frameMs);
      if (this.preRoll.length > keep) this.preRoll.shift();
      this.voicedRun = voiced ? this.voicedRun + this.o.frameMs : 0;
      if (this.voicedRun >= this.o.onsetMs) {
        this.inSpeech = true;
        this.startTs = now - this.voicedRun;
        this.lastVoicedTs = now;
        this.startStream = this.streamMs - this.voicedRun;
        this.lastVoicedStream = this.streamMs;
        this.frames = this.preRoll;
        this.preRoll = [];
        this.silentRun = 0;
        this.emit('start', this.startTs);
      }
      return;
    }

    this.frames.push(copy);
    if (voiced) {
      this.silentRun = 0;
      this.lastVoicedTs = now;
      this.lastVoicedStream = this.streamMs;
    } else this.silentRun += this.o.frameMs;
    const speechMs = this.lastVoicedStream - this.startStream;
    if (this.silentRun >= this.o.hangoverMs || speechMs >= this.o.maxSpeechMs) {
      const frames = this.frames;
      const seg = { startTs: this.startTs, endTs: this.lastVoicedTs };
      this.reset();
      if (speechMs < this.o.minSpeechMs) return;
      const total = frames.reduce((n, x) => n + x.length, 0);
      const out = new Int16Array(total);
      let p = 0;
      for (const x of frames) {
        out.set(x, p);
        p += x.length;
      }
      this.emit('segment', { pcm: out, sampleRate: this.o.sampleRate, ...seg } satisfies Segment);
    }
  }
}

// ───────────────────────────── whisper.cpp ─────────────────────────────

export interface Stt {
  label: string;
  transcribe(pcm: Int16Array, sampleRate: number): Promise<{ text: string; ms: number }>;
}

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Whisper's markers for non-speech ([BLANK_AUDIO], (music), …); treated as "nothing said". */
const NON_SPEECH = /^\s*(\[.*\]|\(.*\)|\.+)?\s*$/;

export function whisperCpp(
  model = process.env.WHISPER_MODEL ?? join(serverRoot, 'models', 'ggml-base.en.bin'),
  bin = process.env.WHISPER_BIN ?? 'whisper-cli',
): Stt | null {
  if (!existsSync(model)) return null;
  return {
    label: `whisper.cpp local (${model.split('/').pop()})`,
    async transcribe(pcm, sampleRate) {
      const start = Date.now();
      const pcm16k = sampleRate === 16000 ? pcm : resamplePcm16(pcm, sampleRate, 16000);
      const dir = await mkdtemp(join(tmpdir(), 'tacit-stt-'));
      try {
        const wav = join(dir, 'in.wav');
        await writeFile(wav, writeWav(pcm16k, 16000));
        const { stdout } = await run(bin, ['-m', model, '-f', wav, '-nt', '-np', '-l', 'en'], { timeout: 30_000 });
        const text = stdout.replace(/\s+/g, ' ').trim();
        return { text: NON_SPEECH.test(text) ? '' : text, ms: Date.now() - start };
      } finally {
        void rm(dir, { recursive: true, force: true });
      }
    },
  };
}

/** Persistent whisper.cpp HTTP server (model stays loaded): measured ~0.1 s vs ~0.45–1.2 s per whisper-cli call. */
export function whisperServer(url: string, label = url): Stt {
  return {
    label: `whisper.cpp server (${label})`,
    async transcribe(pcm, sampleRate) {
      const start = Date.now();
      const pcm16k = sampleRate === 16000 ? pcm : resamplePcm16(pcm, sampleRate, 16000);
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(writeWav(pcm16k, 16000))], { type: 'audio/wav' }), 'in.wav');
      form.append('response_format', 'json');
      form.append('temperature', '0');
      const res = await fetch(`${url}/inference`, { method: 'POST', body: form, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`whisper-server HTTP ${res.status}`);
      const body = (await res.json()) as { text?: string; error?: string };
      if (body.error) throw new Error(`whisper-server: ${body.error}`);
      const text = (body.text ?? '').replace(/\s+/g, ' ').trim();
      return { text: NON_SPEECH.test(text) ? '' : text, ms: Date.now() - start };
    },
  };
}

/** Try `primary`; on error use `secondary` (e.g. whisper-server → whisper-cli). */
export function withSttFallback(primary: Stt, secondary: Stt | null): Stt {
  if (!secondary) return primary;
  return {
    label: `${primary.label} (fallback: ${secondary.label})`,
    async transcribe(pcm, rate) {
      try {
        return await primary.transcribe(pcm, rate);
      } catch (e) {
        console.warn(`[stt] ${primary.label} failed (${e instanceof Error ? e.message : e}); using ${secondary.label}`);
        return secondary.transcribe(pcm, rate);
      }
    },
  };
}

/** Spawn a local whisper-server bound to 127.0.0.1 and wait until it answers. Returns null if unavailable. */
export async function launchWhisperServer(
  port = Number(process.env.WHISPER_SERVER_PORT ?? 8766),
  model = process.env.WHISPER_MODEL ?? join(serverRoot, 'models', 'ggml-base.en.bin'),
  bin = process.env.WHISPER_SERVER_BIN ?? 'whisper-server',
  onExit?: () => void,
): Promise<{ url: string; stop: () => void } | null> {
  if (!existsSync(model)) return null;
  const { spawn } = await import('node:child_process');
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(bin, ['-m', model, '--host', '127.0.0.1', '--port', String(port), '-l', 'en'], { stdio: 'ignore' });
  let failed = false;
  let stopping = false;
  let ready = false;
  child.on('error', () => (failed = true));
  child.on('exit', () => {
    failed = true;
    if (ready && !stopping) onExit?.();
  });
  const stop = () => {
    stopping = true;
    if (!child.killed) child.kill();
  };
  for (let i = 0; i < 50 && !failed; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (res.ok) {
        ready = true;
        return { url, stop };
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  stop();
  return null;
}

/**
 * Wires a Segmenter to an STT provider for one call: transcriptions run one at a time, in order; an empty
 * result or an STT error emits an empty interim so the controller returns to LISTENING instead of sticking.
 */
export function attachTranscriber(
  seg: Segmenter,
  stt: Stt,
  target: EventEmitter,
  opts: { idPrefix: string; active: () => boolean },
): void {
  let n = 0;
  let queue: Promise<void> = Promise.resolve();
  seg.on('start', () => opts.active() && target.emit('transcript', { text: '…', isFinal: false }));
  seg.on('segment', (s: Segment) => {
    queue = queue.then(async () => {
      if (!opts.active()) return;
      try {
        const { text } = await stt.transcribe(s.pcm, s.sampleRate);
        if (!opts.active()) return;
        if (!text) return void target.emit('transcript', { text: '', isFinal: false });
        target.emit('utterance', { utteranceId: `${opts.idPrefix}-${++n}`, text, tsSpeechStart: s.startTs, tsSpeechEnd: s.endTs, tsTranscriptFinal: Date.now() });
      } catch (e) {
        console.error('[stt] transcription failed:', e instanceof Error ? e.message : e);
        if (opts.active()) target.emit('transcript', { text: '', isFinal: false });
      }
    });
  });
}
