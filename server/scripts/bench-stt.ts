/**
 * STT / endpointing benchmark on REAL human speech: CREMA-D clips in recognition/eval (read-only).
 *  1. Endpointing: for each hangover, how many clips split into >1 utterance (false splits) or produced none.
 *  2. Transcription: WER + latency for whisper.cpp at 16 kHz and after a telephone μ-law 8 kHz round trip,
 *     via the persistent whisper-server (WHISPER_SERVER_URL) and optionally per-call whisper-cli (--cli).
 *   npm run bench:stt [-- --limit 40 --cli]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Segmenter, whisperCpp, whisperServer, type Stt } from '../src/stt.ts';
import { decodeMulaw, encodeMulaw } from '../../voice/src/audio/mulaw.ts';
import { resamplePcm16 } from '../../voice/src/audio/pcm.ts';

const here = dirname(fileURLToPath(import.meta.url));
const evalDir = resolve(here, '..', '..', 'recognition', 'eval');
const arg = (k: string) => process.argv.includes(k);
const limit = Number(process.argv[process.argv.indexOf('--limit') + 1]) || 40;
const manifest = (JSON.parse(readFileSync(join(evalDir, 'cremad_manifest.json'), 'utf8')) as Array<{ file: string; text: string }>).slice(0, limit);

function decode(file: string, rate: number): Int16Array {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', join(evalDir, file), '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', '-'], { maxBuffer: 1 << 26 });
  return new Int16Array(raw.buffer, raw.byteOffset, raw.length >> 1).slice();
}

function pad(pcm: Int16Array, rate: number): Int16Array {
  const noise = (ms: number) => Int16Array.from({ length: (rate * ms) / 1000 }, () => Math.round((Math.random() - 0.5) * 40));
  const a = noise(500), b = noise(1500);
  const out = new Int16Array(a.length + pcm.length + b.length);
  out.set(a);
  out.set(pcm, a.length);
  out.set(b, a.length + pcm.length);
  return out;
}

function segments(pcm: Int16Array, rate: number, hangoverMs: number, minThreshold = 350) {
  let t = 0;
  const seg = new Segmenter({ sampleRate: rate, hangoverMs, minThreshold, now: () => (t += 20) });
  const out: Int16Array[] = [];
  seg.on('segment', (s) => out.push(s.pcm));
  for (let o = 0; o < pcm.length; o += rate / 50) seg.feed(pcm.subarray(o, o + rate / 50));
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/\b11\b/g, 'eleven').replace(/[^a-z' ]/g, ' ').replace(/'/g, '').split(/\s+/).filter(Boolean);
function wer(ref: string, hyp: string): number {
  const r = norm(ref), h = norm(hyp);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0]![j] = j;
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++)
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (r[i - 1] === h[j - 1] ? 0 : 1));
  return d[r.length]![h.length]! / Math.max(1, r.length);
}
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;

// 1. Endpointing
const clips16 = manifest.map((m) => ({ ...m, pcm: decode(m.file, 16000) }));
console.log(`clips: ${clips16.length} (real CREMA-D speech, ${new Set(manifest.map((m) => m.text)).size} sentences)`);
console.log('\nendpointing (16 kHz, clip padded with 0.5 s / 1.5 s low noise):');
const noiseOnly = (rms: number) => Int16Array.from({ length: 16000 * 3 }, () => Math.round((Math.random() * 2 - 1) * rms * Math.sqrt(3)));
for (const floor of [350, 150, 100]) {
  for (const h of [500, 700]) {
    let split = 0, none = 0;
    for (const c of clips16) {
      const n = segments(pad(c.pcm, 16000), 16000, h, floor).length;
      if (n === 0) none++;
      if (n > 1) split++;
    }
    const falseTrig = [40, 120, 200, 400].map((r) => segments(noiseOnly(r), 16000, h, floor).length);
    console.log(`  floor ${floor} RMS, hangover ${h} ms: missed ${none}/${clips16.length}, false splits ${split}, triggers on 3 s white noise @RMS 40/120/200/400: ${falseTrig.join('/')}`);
  }
}
if (arg('--endpoint-only')) process.exit(0);

// 2. Transcription
async function run(name: string, stt: Stt, rate: 16000 | 8000) {
  const wers: number[] = [], ms: number[] = [];
  for (const c of clips16) {
    let pcm = c.pcm;
    if (rate === 8000) pcm = resamplePcm16(decodeMulaw(encodeMulaw(resamplePcm16(c.pcm, 16000, 8000))), 8000, 8000);
    const t0 = Date.now();
    const { text } = await stt.transcribe(pcm, rate);
    ms.push(Date.now() - t0);
    wers.push(wer(c.text, text));
  }
  const meanWer = wers.reduce((a, b) => a + b, 0) / wers.length;
  console.log(`  ${name.padEnd(34)} WER ${(meanWer * 100).toFixed(1)}%  exact ${wers.filter((w) => w === 0).length}/${wers.length}  latency p50 ${pct(ms, 0.5)} ms  p90 ${pct(ms, 0.9)} ms`);
}

console.log('\ntranscription:');
const url = process.env.WHISPER_SERVER_URL ?? 'http://127.0.0.1:8766';
const srv = whisperServer(url, 'bench');
await run(`whisper-server 16 kHz`, srv, 16000);
await run(`whisper-server 8 kHz μ-law (phone)`, srv, 8000);
if (arg('--cli')) {
  const cli = whisperCpp();
  if (cli) await run('whisper-cli (per call) 16 kHz', cli, 16000);
}
