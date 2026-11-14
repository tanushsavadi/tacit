// Shared loading, segmentation and baseline features for AirPods word sessions (airpods:record --protocol words).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { type Sample, energy, trim } from './motion.ts';

export type Trial = { label: string; cue: string; w: Sample[]; pre: Sample[]; gaps: number };
export const CONTROLS = ['neutral', 'other'];
export const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(a.length, 1);
export const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? NaN;

export function loadSession(dir: string) {
  const raw = readFileSync(`${dir}/motion.csv`, 'utf8');
  const meta = JSON.parse(readFileSync(`${dir}/events.json`, 'utf8'));
  const s: Sample[] = raw.trim().split('\n').slice(1).map((l) => { const p = l.split(','), v = (i: number) => Number(p[i]); return { t: v(0), ax: v(1), ay: v(2), az: v(3), rx: v(4), ry: v(5), rz: v(6), pitch: v(7), roll: v(8), yaw: v(9) }; });
  const win = (a: number, b: number) => s.filter((x) => x.t >= a && x.t < b);
  const trials: Trial[] = meta.events.filter((e: any) => e.kind === 'trial').map((e: any) => {
    const w = win(e.t0, e.t1);
    return { label: e.label, cue: e.cue ?? e.label, w, pre: win(e.t0 - 1.2, e.t0), gaps: w.slice(1).filter((x, i) => x.t - w[i]!.t > 0.1).length };
  });
  const words: string[] = meta.words ?? [...new Set(trials.map((t) => t.label))].filter((l) => !CONTROLS.includes(l)).sort();
  return { dir, meta, trials, words, hash: createHash('sha256').update(raw).digest('hex').slice(0, 16) };
}
export type Session = ReturnType<typeof loadSession>;

export const SEGMENT: Record<string, (t: Trial) => Sample[]> = {
  cue: (t) => t.w, // fixed cue-locked window
  trim: (t) => trim(t.w), // Subvox energy trim
};

/** Energy envelope smoothed over 5 samples (100 ms at 50 Hz). */
export const envelope = (w: Sample[]) => w.map((_, i) => mean(w.slice(Math.max(0, i - 2), i + 3).map(energy)));
/** Syllable-like peak count: local maxima above the envelope's midpoint, ≥150 ms apart. */
export function peakCount(w: Sample[]): number {
  const e = envelope(w); if (e.length < 3) return 0;
  const lo = Math.min(...e), hi = Math.max(...e), th = lo + 0.5 * (hi - lo);
  let n = 0, last = -Infinity;
  for (let i = 1; i < e.length - 1; i++) if (e[i]! > th && e[i]! >= e[i - 1]! && e[i]! > e[i + 1]! && w[i]!.t - last >= 0.15) { n++; last = w[i]!.t; }
  return n;
}
export const duration = (t: Trial) => { const w = trim(t.w); return [w.length ? w.at(-1)!.t - w[0]!.t : 0]; };
export const motionEnergy = (t: Trial) => [mean(t.w.map(energy))];
export const timingBundle = (t: Trial) => [...duration(t), mean(t.w.map(energy)), Math.max(...envelope(t.w)), peakCount(trim(t.w))];
