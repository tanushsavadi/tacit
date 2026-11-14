import { decodeMulaw, encodeMulaw, MULAW_SILENCE } from './mulaw.ts';

/** Wire formats used end to end. Names match ElevenLabs `audio_format` / `output_format` values. */
export type AudioFormat = 'ulaw_8000' | 'pcm_16000' | 'pcm_24000';

export interface FormatInfo {
  sampleRate: number;
  bytesPerSample: 1 | 2;
  encoding: 'mulaw' | 'pcm_s16le';
}

export const FORMATS: Record<AudioFormat, FormatInfo> = {
  ulaw_8000: { sampleRate: 8000, bytesPerSample: 1, encoding: 'mulaw' },
  pcm_16000: { sampleRate: 16000, bytesPerSample: 2, encoding: 'pcm_s16le' },
  pcm_24000: { sampleRate: 24000, bytesPerSample: 2, encoding: 'pcm_s16le' },
};

export function bytesPerMs(format: AudioFormat): number {
  const f = FORMATS[format];
  return (f.sampleRate * f.bytesPerSample) / 1000;
}

export function bytesToMs(format: AudioFormat, bytes: number): number {
  return bytes / bytesPerMs(format);
}

/** View a little-endian PCM16 buffer as samples (copies only when the buffer is unaligned). */
export function bufferToInt16(buf: Buffer): Int16Array {
  const len = buf.length >> 1;
  if (buf.byteOffset % 2 === 0) return new Int16Array(buf.buffer, buf.byteOffset, len);
  const out = new Int16Array(len);
  for (let i = 0; i < len; i++) out[i] = buf.readInt16LE(i * 2);
  return out;
}

export function int16ToBuffer(pcm: Int16Array): Buffer {
  return Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
}

/** Decode any supported wire format to linear PCM16 samples at the format's native rate. */
export function toPcm16(format: AudioFormat, audio: Buffer): Int16Array {
  return FORMATS[format].encoding === 'mulaw' ? decodeMulaw(audio) : bufferToInt16(audio);
}

/** Encode linear PCM16 samples (already at the format's rate) to the wire format. */
export function fromPcm16(format: AudioFormat, pcm: Int16Array): Buffer {
  return FORMATS[format].encoding === 'mulaw' ? encodeMulaw(pcm) : Buffer.from(int16ToBuffer(pcm));
}

/** A buffer of digital silence of the same byte length, in the given format. */
export function silence(format: AudioFormat, byteLength: number): Buffer {
  return Buffer.alloc(byteLength, FORMATS[format].encoding === 'mulaw' ? MULAW_SILENCE : 0);
}

/** Root-mean-square amplitude on the int16 scale (0..32768). */
export function rms(pcm: Int16Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i]! * pcm[i]!;
  return Math.sqrt(sum / pcm.length);
}

/**
 * Linear-interpolation resampler with a box low-pass when downsampling.
 * Stateless (whole-buffer). NOT used on the live call path -- only for test
 * fixtures and the fake providers -- so chunk-boundary continuity is not handled.
 */
export function resamplePcm16(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return input.slice();
  if (input.length === 0) return new Int16Array(0);
  let src: Float64Array | Int16Array = input;
  if (toRate < fromRate) {
    const win = Math.max(1, Math.round(fromRate / toRate));
    const filtered = new Float64Array(input.length);
    let acc = 0;
    for (let i = 0; i < input.length; i++) {
      acc += input[i]!;
      if (i >= win) acc -= input[i - win]!;
      filtered[i] = acc / Math.min(i + 1, win);
    }
    src = filtered;
  }
  const outLen = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const out = new Int16Array(outLen);
  const step = fromRate / toRate;
  for (let i = 0; i < outLen; i++) {
    const pos = i * step;
    const i0 = Math.min(src.length - 1, Math.floor(pos));
    const i1 = Math.min(src.length - 1, i0 + 1);
    const frac = pos - i0;
    const v = src[i0]! * (1 - frac) + src[i1]! * frac;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v)));
  }
  return out;
}

/**
 * Re-frames an arbitrary byte stream into fixed-size frames. Provider TTS
 * chunks arrive at arbitrary (even odd) byte boundaries; transports want
 * 20 ms mu-law frames or sample-aligned PCM.
 */
export class Rechunker {
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  constructor(
    private readonly frameBytes: number,
    private readonly alignBytes = 1,
  ) {
    if (frameBytes <= 0 || frameBytes % alignBytes !== 0) throw new Error('invalid frame size');
  }

  push(chunk: Buffer): Buffer[] {
    if (chunk.length === 0) return [];
    this.pending.push(chunk);
    this.pendingBytes += chunk.length;
    if (this.pendingBytes < this.frameBytes) return [];
    const all = this.pending.length === 1 ? this.pending[0]! : Buffer.concat(this.pending, this.pendingBytes);
    const frames: Buffer[] = [];
    let off = 0;
    while (all.length - off >= this.frameBytes) {
      frames.push(all.subarray(off, off + this.frameBytes));
      off += this.frameBytes;
    }
    const rest = all.subarray(off);
    this.pending = rest.length ? [rest] : [];
    this.pendingBytes = rest.length;
    return frames;
  }

  /** Remaining partial frame, truncated to sample alignment (a dangling half-sample is dropped). */
  flush(): Buffer | undefined {
    if (this.pendingBytes === 0) return undefined;
    const all = Buffer.concat(this.pending, this.pendingBytes);
    this.pending = [];
    this.pendingBytes = 0;
    const usable = all.length - (all.length % this.alignBytes);
    return usable > 0 ? all.subarray(0, usable) : undefined;
  }
}
