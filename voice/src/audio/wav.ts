/** Minimal RIFF/WAVE reader + writer for 16-bit PCM (test fixtures and tooling only). */

export interface WavData {
  sampleRate: number;
  channels: number;
  /** Interleaved if channels > 1. */
  samples: Int16Array;
}

export function parseWav(buf: Buffer): WavData {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }
  let off = 12;
  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | undefined;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV data chunk before fmt chunk');
      if (fmt.format !== 1 || fmt.bits !== 16) {
        throw new Error(`unsupported WAV encoding (format=${fmt.format}, bits=${fmt.bits}); need 16-bit PCM`);
      }
      const end = Math.min(buf.length, body + size);
      const n = (end - body) >> 1;
      const samples = new Int16Array(n);
      for (let i = 0; i < n; i++) samples[i] = buf.readInt16LE(body + i * 2);
      return { sampleRate: fmt.sampleRate, channels: fmt.channels, samples };
    }
    off = body + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}

export function writeWav(samples: Int16Array, sampleRate: number, channels = 1): Buffer {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export function toMono(wav: WavData): Int16Array {
  if (wav.channels === 1) return wav.samples;
  const n = Math.floor(wav.samples.length / wav.channels);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let c = 0; c < wav.channels; c++) sum += wav.samples[i * wav.channels + c]!;
    out[i] = Math.round(sum / wav.channels);
  }
  return out;
}
