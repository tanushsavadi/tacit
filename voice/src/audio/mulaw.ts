/**
 * G.711 mu-law (PCMU) <-> 16-bit linear PCM.
 *
 * Twilio Media Streams carry `audio/x-mulaw`, 8000 Hz, mono, base64, no file
 * headers. The live call path never transcodes (ElevenLabs accepts and emits
 * `ulaw_8000` natively); these functions are used for local voice-activity
 * timestamps, the fake providers, and tests.
 *
 * Algorithm: the classic Sun Microsystems g711.c reference (public domain).
 */

const BIAS = 0x84;
const CLIP = 32635;

export function linearToMulawSample(pcm: number): number {
  let sample = pcm | 0;
  const sign = sample < 0 ? 0x80 : 0;
  if (sign) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function mulawToLinearSample(mulaw: number): number {
  const u = ~mulaw & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  const sample = (((mantissa << 3) + BIAS) << exponent) - BIAS;
  return sign ? -sample : sample;
}

const DECODE_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) DECODE_TABLE[i] = mulawToLinearSample(i);

const ENCODE_TABLE = new Uint8Array(65536);
for (let i = 0; i < 65536; i++) ENCODE_TABLE[i] = linearToMulawSample(i - 32768);

/** mu-law silence byte (decodes to 0). */
export const MULAW_SILENCE = 0xff;

export function decodeMulaw(mulaw: Uint8Array): Int16Array {
  const out = new Int16Array(mulaw.length);
  for (let i = 0; i < mulaw.length; i++) out[i] = DECODE_TABLE[mulaw[i]!]!;
  return out;
}

export function encodeMulaw(pcm: Int16Array): Buffer {
  const out = Buffer.allocUnsafe(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = ENCODE_TABLE[pcm[i]! + 32768]!;
  return out;
}
