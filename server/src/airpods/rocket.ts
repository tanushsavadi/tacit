// ROCKET (Dempster, Petitjean & Webb 2020, "ROCKET: exceptionally fast and accurate time series classification
// using random convolutional kernels") — multivariate variant as in sktime (BSD-3): random kernels over random
// channel subsets, PPV + max features, then a ridge classifier with closed-form leave-one-out alpha selection.
// Small, data-efficient, no training of the kernels — appropriate for ~10 examples per class.
export type Series = number[][]; // [time][channel]

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
interface Kernel { len: number; ch: number[]; w: number[][]; bias: number; dil: number; pad: number }

export function makeKernels(n: number, channels: number, refLength: number, seed = 1): Kernel[] {
  const r = rng(seed), normal = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const ks: Kernel[] = [];
  for (let i = 0; i < n; i++) {
    const len = [7, 9, 11][Math.floor(r() * 3)]!;
    const nch = Math.floor(2 ** (r() * Math.log2(Math.min(channels, len) + 1)));
    const ch = [...Array(channels).keys()].sort(() => r() - 0.5).slice(0, Math.max(1, nch));
    const w = Array.from({ length: len }, () => ch.map(() => normal()));
    for (let k = 0; k < ch.length; k++) { const m = w.reduce((s, row) => s + row[k]!, 0) / len; w.forEach((row) => (row[k]! -= m)); }
    const dil = Math.floor(2 ** (r() * Math.log2(Math.max(1, (refLength - 1) / (len - 1)))));
    const pad = r() < 0.5 ? Math.floor(((len - 1) * dil) / 2) : 0;
    ks.push({ len, ch, w, bias: r() * 2 - 1, dil, pad });
  }
  return ks;
}

export function transform(x: Series, ks: Kernel[]): number[] {
  const T = x.length, out: number[] = [];
  for (const k of ks) {
    const n = T + 2 * k.pad - (k.len - 1) * k.dil;
    let ppv = 0, max = -Infinity;
    for (let s = 0; s < n; s++) {
      let v = k.bias;
      for (let j = 0; j < k.len; j++) {
        const t = s - k.pad + j * k.dil;
        if (t < 0 || t >= T) continue;
        const row = x[t]!, wj = k.w[j]!;
        for (let c = 0; c < k.ch.length; c++) v += wj[c]! * row[k.ch[c]!]!;
      }
      if (v > 0) ppv++;
      if (v > max) max = v;
    }
    out.push(n > 0 ? ppv / n : 0, n > 0 ? max : 0);
  }
  return out;
}

function invert(A: number[][]): number[][] {
  const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    const d = M[c]![c]!; for (let j = 0; j < 2 * n; j++) M[c]![j]! /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r]![c]!; if (f) for (let j = 0; j < 2 * n; j++) M[r]![j]! -= f * M[c]![j]!; }
  }
  return M.map((r) => r.slice(n));
}
const dot = (a: number[], b: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!; return s; };

/** Ridge one-vs-rest classifier (dual form) with alpha picked by closed-form LOO accuracy on the training set. */
export class RidgeClassifier {
  classes: string[] = []; alpha = 1; private mu: number[] = []; private sd: number[] = []; private X: number[][] = []; private A: number[][] = []; private ybar: number[] = [];
  /** LOO class scores for each training row at the chosen alpha (for threshold selection without refitting). */
  looScores: number[][] = [];
  fit(F: number[][], labels: string[], alphas = [1e-3, 1e-2, 1e-1, 1, 10, 100, 1e3, 1e4]) {
    this.classes = [...new Set(labels)].sort();
    const d = F[0]!.length, n = F.length;
    this.mu = Array.from({ length: d }, (_, j) => F.reduce((s, r) => s + r[j]!, 0) / n);
    this.sd = Array.from({ length: d }, (_, j) => Math.sqrt(F.reduce((s, r) => s + (r[j]! - this.mu[j]!) ** 2, 0) / n) || 1);
    this.X = F.map((r) => r.map((v, j) => (v - this.mu[j]!) / this.sd[j]!));
    const K = this.X.map((a) => this.X.map((b) => dot(a, b)));
    const Y = labels.map((l) => this.classes.map((c) => (c === l ? 1 : -1)));
    // Dual ridge on rows `idx`: returns intercept + dual coefficients. Intercept uses only those rows.
    const solve = (idx: number[], alpha: number) => {
      const ybar = this.classes.map((_, k) => idx.reduce((s, r) => s + Y[r]![k]!, 0) / idx.length);
      const M = invert(idx.map((r, a) => idx.map((c, b) => K[r]![c]! + (a === b ? alpha : 0))));
      const A = M.map((row) => this.classes.map((_, k) => idx.reduce((s, r, b) => s + row[b]! * (Y[r]![k]! - ybar[k]!), 0)));
      return { ybar, A };
    };
    // Exact leave-one-out (refit without row i; no information from row i, including its label, enters the fit).
    let best = { acc: -1, alpha: 1, loo: [] as number[][] };
    for (const alpha of alphas) {
      const loo = labels.map((_, i) => {
        const idx = labels.map((_, r) => r).filter((r) => r !== i), { ybar, A } = solve(idx, alpha);
        return this.classes.map((_, k) => idx.reduce((s, r, b) => s + K[i]![r]! * A[b]![k]!, 0) + ybar[k]!);
      });
      const acc = loo.filter((sc, i) => this.classes[sc.indexOf(Math.max(...sc))] === labels[i]).length / n;
      if (acc > best.acc) best = { acc, alpha, loo };
    }
    const all = solve(labels.map((_, r) => r), best.alpha);
    this.ybar = all.ybar; this.A = all.A;
    this.alpha = best.alpha; this.looScores = best.loo;
    return this;
  }
  scores(f: number[]): number[] {
    const x = f.map((v, j) => (v - this.mu[j]!) / this.sd[j]!), kx = this.X.map((r) => dot(r, x));
    return this.classes.map((_, k) => dot(kx, this.A.map((a) => a[k]!)) + this.ybar[k]!);
  }
}
