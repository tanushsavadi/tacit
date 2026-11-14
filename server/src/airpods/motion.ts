// AirPods motion features + DTW template matching.
// Ported from Subvox (MIT, (c) 2026 Joe Blau, github.com/joeblau/subvox): MotionFeatures.swift, DTW.swift,
// TemplateClassifier.swift. Changes: TypeScript, extra feature sets, explicit "none" (reject) templates.
export interface Sample {
  t: number; ax: number; ay: number; az: number; rx: number; ry: number; rz: number;
  pitch: number; roll: number; yaw: number;
}
export type Feature = 'acc' | 'rot' | 'att';
export const FEATURE_SETS: Record<string, Feature[]> = {
  acc: ['acc'], rot: ['rot'], att: ['att'], 'acc+rot': ['acc', 'rot'], all: ['acc', 'rot', 'att'],
};

export const energy = (s: Sample) => Math.hypot(s.rx, s.ry, s.rz) + 5 * Math.hypot(s.ax, s.ay, s.az);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Subvox trim: drop quiet lead-in/out relative to the segment's own energy range. */
export function trim(samples: Sample[], padding = 2): Sample[] {
  if (samples.length <= 6) return samples;
  const e = samples.map(energy);
  const sorted = [...e].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length / 5)]!, peak = sorted[sorted.length - 1]!;
  if (!(peak > floor * 1.5)) return samples;
  const th = floor + 0.15 * (peak - floor);
  const first = e.findIndex((x) => x > th);
  let last = -1;
  for (let i = e.length - 1; i >= 0; i--) if (e[i]! > th) { last = i; break; }
  if (first < 0 || last < 0) return samples;
  const lo = Math.max(0, first - padding), hi = Math.min(samples.length - 1, last + padding);
  return hi - lo + 1 >= 5 ? samples.slice(lo, hi + 1) : samples;
}

/** Per-frame vectors, mean-centered per channel. */
export function frames(samples: Sample[], set: Feature[]): number[][] {
  if (!samples.length) return [];
  const o = samples[0]!;
  const f = samples.map((s) => {
    const v: number[] = [];
    if (set.includes('acc')) v.push(s.ax, s.ay, s.az);
    if (set.includes('rot')) v.push(s.rx, s.ry, s.rz);
    if (set.includes('att')) v.push(wrap(s.pitch - o.pitch), wrap(s.roll - o.roll), wrap(s.yaw - o.yaw));
    return v;
  });
  const dims = f[0]!.length;
  for (let d = 0; d < dims; d++) {
    const mean = f.reduce((a, x) => a + x[d]!, 0) / f.length;
    for (const x of f) x[d]! -= mean;
  }
  return f;
}

export function channelScales(seqs: number[][][]): number[] {
  const dims = seqs.find((s) => s.length)?.[0]?.length ?? 0;
  const sum = new Array(dims).fill(0), sq = new Array(dims).fill(0);
  let n = 0;
  for (const s of seqs) for (const fr of s) { for (let d = 0; d < dims; d++) { sum[d] += fr[d]!; sq[d] += fr[d]! * fr[d]!; } n++; }
  if (n < 2) return new Array(dims).fill(1);
  return sum.map((s, d) => Math.max(Math.sqrt(sq[d] / n - (s / n) ** 2), 1e-6)) as number[];
}
export const scaled = (f: number[][], sc: number[]) => f.map((fr) => fr.map((x, d) => x / sc[d]!));

/** DTW with a Sakoe–Chiba band, normalized by n+m. */
export function dtw(a: number[][], b: number[][], bandFraction = 0.25): number {
  const n = a.length, m = b.length;
  if (!n || !m) return Infinity;
  const band = Math.max(Math.abs(n - m), Math.floor(Math.max(n, m) * bandFraction));
  let prev = new Float64Array(m + 1).fill(Infinity), cur = new Float64Array(m + 1);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    cur.fill(Infinity);
    for (let j = Math.max(1, i - band); j <= Math.min(m, i + band); j++) {
      let c = 0;
      const x = a[i - 1]!, y = b[j - 1]!;
      for (let k = 0; k < x.length; k++) c += (x[k]! - y[k]!) ** 2;
      cur[j] = Math.sqrt(c) + Math.min(prev[j]!, cur[j - 1]!, prev[j - 1]!);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[m]! / (n + m);
}

export interface Ranked { label: string; distance: number }
export const margin = (r: Ranked[]) => (r.length >= 2 && r[1]!.distance > 0 ? Math.max(0, 1 - r[0]!.distance / r[1]!.distance) : 0);

export class TemplateClassifier {
  private entries: { label: string; f: number[][] }[];
  private scales: number[];
  constructor(templates: { label: string; samples: Sample[] }[], readonly set: Feature[], readonly doTrim = true) {
    const raw = templates.map((t) => frames(doTrim ? trim(t.samples) : t.samples, set));
    this.scales = channelScales(raw);
    this.entries = templates.map((t, i) => ({ label: t.label, f: scaled(raw[i]!, this.scales) }));
  }
  rank(samples: Sample[]): Ranked[] {
    const q = scaled(frames(this.doTrim ? trim(samples) : samples, this.set), this.scales);
    const best = new Map<string, number>();
    for (const e of this.entries) best.set(e.label, Math.min(best.get(e.label) ?? Infinity, dtw(q, e.f)));
    return [...best].map(([label, distance]) => ({ label, distance })).sort((a, b) => a.distance - b.distance);
  }
}
