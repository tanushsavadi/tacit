// Gate 2 with a strict held-out protocol.
//   select:   npm run airpods:gate2 -- select <w1>          → tunes on w1 only (LOO), writes a frozen config
//   evaluate: npm run airpods:gate2 -- evaluate <w1> <w2>   → trains on all of w1, tests w2 ONCE with that config
// The config records a hash of the w1 data; evaluate refuses a config produced from other data.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { FEATURE_SETS, type Feature, type Sample, dtw, energy, frames, channelScales, scaled, trim, margin } from '../src/airpods/motion.ts';

type Trial = { label: string; w: Sample[]; pre: Sample[]; gaps: number };
const CONTROLS = ['neutral', 'other'];
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(a.length, 1);
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? NaN;
const pct = (x: number) => `${(100 * x).toFixed(0)}%`;

function load(dir: string) {
  const raw = readFileSync(`${dir}/motion.csv`, 'utf8');
  const meta = JSON.parse(readFileSync(`${dir}/events.json`, 'utf8'));
  const s: Sample[] = raw.trim().split('\n').slice(1).map((l) => { const p = l.split(','), v = (i: number) => Number(p[i]); return { t: v(0), ax: v(1), ay: v(2), az: v(3), rx: v(4), ry: v(5), rz: v(6), pitch: v(7), roll: v(8), yaw: v(9) }; });
  const win = (a: number, b: number) => s.filter((x) => x.t >= a && x.t < b);
  const trials: Trial[] = meta.events.filter((e: any) => e.kind === 'trial').map((e: any) => {
    const w = win(e.t0, e.t1);
    return { label: e.label, w, pre: win(e.t0 - 1.2, e.t0), gaps: w.slice(1).filter((x, i) => x.t - w[i]!.t > 0.1).length };
  });
  const words: string[] = meta.words ?? [...new Set(trials.map((t) => t.label))].filter((l) => !CONTROLS.includes(l));
  return { dir, trials, words, hash: createHash('sha256').update(raw).digest('hex').slice(0, 16) };
}

const STRATS: Record<string, (t: Trial) => Sample[]> = {
  cue: (t) => t.w,
  trim: (t) => trim(t.w),
  onset: (t) => {
    const b = t.pre.map(energy), m = median(b), th = m + 4 * (median(b.map((x) => Math.abs(x - m))) + 1e-4);
    const i = t.w.findIndex((x) => energy(x) > th), a = i < 0 ? 0 : Math.max(0, i - 2), end = (t.w[a]?.t ?? 0) + 1.6;
    return t.w.slice(a).filter((x) => x.t < end);
  },
};
// Diagnostic featurizers (fixed, not tuned): direction-free magnitudes and the 1-D energy envelope.
const MAG = (w: Sample[]) => w.map((x) => [Math.hypot(x.ax, x.ay, x.az), Math.hypot(x.rx, x.ry, x.rz)]);
const center = (f: number[][]) => { const d = f[0]?.length ?? 0; for (let k = 0; k < d; k++) { const m = mean(f.map((r) => r[k]!)); f.forEach((r) => (r[k]! -= m)); } return f; };

type Featurize = (t: Trial) => number[][];
const featurizer = (strat: string, set: Feature[]): Featurize => (t) => frames(STRATS[strat]!(t), set);
const group = (l: string, words: string[]) => (words.includes(l) ? l : 'none');

/** Nearest-template distance per class (word or 'none'). train/test featurized + scaled on TRAIN statistics only. */
function ranker(train: Trial[], feat: Featurize, words: string[], dist = dtw) {
  const tr = train.map(feat), sc = channelScales(tr), T = tr.map((x) => scaled(x, sc));
  return (t: Trial, skip = -1) => {
    const q = scaled(feat(t), sc), best = new Map<string, number>();
    T.forEach((x, j) => { if (j === skip) return; const g = group(train[j]!.label, words); best.set(g, Math.min(best.get(g) ?? Infinity, dist(q, x))); });
    return [...best].map(([label, distance]) => ({ label, distance })).sort((a, b) => a.distance - b.distance);
  };
}
const scalarNN = (train: Trial[], test: Trial[], f: (t: Trial) => number[], words: string[], loo: boolean) => {
  const A = train.map(f), sd = A[0]!.map((_, k) => Math.max(Math.sqrt(mean(A.map((r) => r[k]! ** 2)) - mean(A.map((r) => r[k]!)) ** 2), 1e-9));
  return test.map((t, i) => { let bj = -1, bd = Infinity; const q = f(t); A.forEach((a, j) => { if (loo && i === j) return; const d = Math.hypot(...a.map((x, k) => (x - q[k]!) / sd[k]!)); if (d < bd) { bd = d; bj = j; } }); return train[bj]!.label; });
};
const dur = (t: Trial) => { const w = trim(t.w); return [w.length ? w.at(-1)!.t - w[0]!.t : 0]; };
const amp = (t: Trial) => [mean(t.w.map(energy))];
const head = (t: Trial) => { const o = t.w[0]!; return (['pitch', 'roll', 'yaw'] as const).map((k) => Math.max(...t.w.map((x) => Math.abs(x[k] - o[k])))); };

function decide(r: { label: string; distance: number }[], words: string[], m: number) {
  const p = r[0]!.label;
  return words.includes(p) ? (margin(r) >= m ? p : 'abstain') : 'none';
}
function score(test: Trial[], outs: string[], words: string[]) {
  let correct = 0, wrong = 0, abst = 0, fa = 0, missed = 0;
  test.forEach((t, i) => {
    const o = outs[i]!, isW = words.includes(t.label);
    if (isW) { if (o === t.label) correct++; else if (words.includes(o)) wrong++; else if (o === 'abstain') abst++; else missed++; }
    else if (words.includes(o)) fa++;
  });
  const nW = test.filter((t) => words.includes(t.label)).length, nC = test.length - nW;
  return { correct, wrong, abst, missed, fa, nW, nC, utility: correct - 2 * (wrong + fa) };
}

const [mode, d1, d2] = process.argv.slice(2);
const CFG = join(d1 ?? '.', '..', 'gate2-config.json');

if (mode === 'select') {
  const A = load(d1!), W = A.words, AW = A.trials.filter((t) => W.includes(t.label));
  console.log(`# Gate 2 selection on ${basename(A.dir)} ONLY (LOO; w2 not read). words: ${W.join(', ')}; trials ${A.trials.length}`);
  let best = { acc: -1, strat: '', set: '' };
  console.log('5-word LOO 1-NN accuracy (chance 20%):\n  strategy ' + Object.keys(FEATURE_SETS).map((k) => k.padStart(8)).join(''));
  for (const strat of Object.keys(STRATS)) {
    const row = Object.entries(FEATURE_SETS).map(([k, set]) => {
      const r = ranker(AW, featurizer(strat, set), W);
      const acc = mean(AW.map((t, i) => (r(t, i)[0]!.label === t.label ? 1 : 0)));
      if (acc > best.acc + 1e-9) best = { acc, strat, set: k };
      return pct(acc).padStart(8);
    });
    console.log(`  ${strat.padEnd(8)} ${row.join('')}`);
  }
  console.log(`selected: ${best.strat}/${best.set} (${pct(best.acc)} LOO on w1)`);
  // Threshold: maximize utility = correct − 2·(wrong word + control accepted) in w1 LOO incl. reject templates.
  const r = ranker(A.trials, featurizer(best.strat, FEATURE_SETS[best.set]!), W);
  const ranked = A.trials.map((t, i) => r(t, i));
  let bm = { m: 0, u: -Infinity };
  for (let m = 0; m <= 0.3001; m += 0.02) { const s = score(A.trials, ranked.map((x) => decide(x, W, m)), W); if (s.utility > bm.u) bm = { m: +m.toFixed(2), u: s.utility }; }
  const s = score(A.trials, ranked.map((x) => decide(x, W, bm.m)), W);
  console.log(`selected margin threshold ${bm.m} (w1 LOO: correct ${s.correct}/${s.nW}, wrong ${s.wrong}, abstain ${s.abst}, word→none ${s.missed}, control false-accepts ${s.fa}/${s.nC})`);
  writeFileSync(CFG, JSON.stringify({ trainedOn: basename(A.dir), trainHash: A.hash, strat: best.strat, set: best.set, margin: bm.m, words: W, created: new Date().toISOString() }, null, 1));
  console.log(`frozen config → ${CFG}`);
} else if (mode === 'evaluate') {
  if (!existsSync(CFG)) throw new Error('run select first');
  const cfg = JSON.parse(readFileSync(CFG, 'utf8'));
  const A = load(d1!), B = load(d2!), W: string[] = cfg.words;
  if (cfg.trainHash !== A.hash) throw new Error('config was not produced from this w1 data');
  console.log(`# Gate 2 held-out evaluation: train ${basename(A.dir)} → test ${basename(B.dir)} (AirPods re-seated)`);
  console.log(`frozen config (from w1 only, ${cfg.created}): ${cfg.strat}/${cfg.set}, margin ${cfg.margin}`);
  const feat = featurizer(cfg.strat, FEATURE_SETS[cfg.set]!);
  const r = ranker(A.trials, feat, W);
  const lat: number[] = [];
  const ranked = B.trials.map((t) => { const s = performance.now(); const x = r(t); lat.push(performance.now() - s); return x; });
  const outs = ranked.map((x) => decide(x, W, cfg.margin));
  const s = score(B.trials, outs, W);
  const rows = [...W, ...CONTROLS], cols = [...W, 'none', 'abstain'];
  console.log('\nconfusion (rows = actual, cols = output):\n  ' + ''.padEnd(9) + cols.map((c) => c.padStart(8)).join(''));
  for (const l of rows) console.log('  ' + l.padEnd(9) + cols.map((c) => String(B.trials.filter((t, i) => t.label === l && outs[i] === c).length).padStart(8)).join(''));
  console.log('\nper-word: ' + W.map((w) => `${w} ${B.trials.filter((t, i) => t.label === w && outs[i] === w).length}/${B.trials.filter((t) => t.label === w).length}`).join(', '));
  console.log(`words: correct ${s.correct}/${s.nW} (${pct(s.correct / s.nW)}), wrong word accepted ${s.wrong} (${pct(s.wrong / s.nW)}), abstained ${s.abst} (${pct(s.abst / s.nW)}), rejected as none ${s.missed}`);
  console.log(`controls: neutral → word ${B.trials.filter((t, i) => t.label === 'neutral' && W.includes(outs[i]!)).length}/${B.trials.filter((t) => t.label === 'neutral').length}, other → word ${B.trials.filter((t, i) => t.label === 'other' && W.includes(outs[i]!)).length}/${B.trials.filter((t) => t.label === 'other').length}`);
  console.log(`incorrect acceptance (wrong word + control accepted as a word) ${s.wrong + s.fa}/${B.trials.length} trials (${pct((s.wrong + s.fa) / B.trials.length)}); precision of accepted words ${pct(s.correct / Math.max(s.correct + s.wrong + s.fa, 1))}`);
  // Forced choice among words only (no reject/abstain), for comparison with baselines.
  const AW = A.trials.filter((t) => W.includes(t.label)), BW = B.trials.filter((t) => W.includes(t.label));
  const forced = (f: Featurize, dist = dtw) => { const rr = ranker(AW, f, W, dist); return mean(BW.map((t) => (rr(t)[0]!.label === t.label ? 1 : 0))); };
  const nn = (f: (t: Trial) => number[]) => mean(scalarNN(AW, BW, f, W, false).map((l, i) => (l === BW[i]!.label ? 1 : 0)));
  console.log('\nforced-choice 5-word accuracy on w2 (trained on w1; chance 20%):');
  console.log(`  selected model (${cfg.strat}/${cfg.set})         ${pct(forced(feat))}`);
  { const rr = ranker(AW, feat, W), pred = BW.map((t) => rr(t)[0]!.label);
    console.log('  forced-choice confusion (rows actual, cols predicted):\n    ' + ''.padEnd(7) + W.map((w) => w.padStart(7)).join(''));
    for (const l of W) console.log('    ' + l.padEnd(7) + W.map((c) => String(BW.filter((t, i) => t.label === l && pred[i] === c).length).padStart(7)).join(''));
    console.log('  forced-choice per word: ' + W.map((w) => `${w} ${BW.filter((t, i) => t.label === w && pred[i] === w).length}/${BW.filter((t) => t.label === w).length}`).join(', ')); }
  console.log(`  baseline duration-only                ${pct(nn(dur))}`);
  console.log(`  baseline motion-energy-only           ${pct(nn(amp))}`);
  console.log(`  baseline duration + energy            ${pct(nn((t) => [...dur(t), ...amp(t)]))}`);
  console.log(`  baseline rhythm (energy envelope DTW) ${pct(forced((t) => center(STRATS[cfg.strat]!(t).map((x) => [energy(x)]))))}`);
  console.log(`  baseline head-excursion-only          ${pct(nn(head))}`);
  console.log(`  diagnostic: magnitudes only (no axis direction) ${pct(forced((t) => center(MAG(STRATS[cfg.strat]!(t)))))}`);
  for (const k of Object.keys(FEATURE_SETS)) if (k !== cfg.set) console.log(`  diagnostic (not selected, untuned): ${cfg.strat}/${k.padEnd(8)} ${pct(forced(featurizer(cfg.strat, FEATURE_SETS[k]!)))}`);
  // Movement detection (word vs neutral) — threshold on rotation RMS chosen on w1 (balanced accuracy), applied to w2.
  const rotRms = (t: Trial) => Math.sqrt(mean(t.w.map((x) => x.rx ** 2 + x.ry ** 2 + x.rz ** 2)));
  const isMove = (t: Trial) => W.includes(t.label);
  const A2 = A.trials.filter((t) => t.label !== 'other'), B2 = B.trials.filter((t) => t.label !== 'other');
  let bt = { th: 0, ba: -1 };
  for (const th of A2.map(rotRms)) { const tp = mean(A2.filter(isMove).map((t) => (rotRms(t) >= th ? 1 : 0))), tn = mean(A2.filter((t) => !isMove(t)).map((t) => (rotRms(t) < th ? 1 : 0))); if ((tp + tn) / 2 > bt.ba) bt = { th, ba: (tp + tn) / 2 }; }
  const tp2 = B2.filter(isMove).filter((t) => rotRms(t) >= bt.th).length, tn2 = B2.filter((t) => !isMove(t)).filter((t) => rotRms(t) < bt.th).length;
  console.log(`  movement detection (word vs neutral, rotation-RMS threshold ${bt.th.toFixed(4)} from w1): w2 words detected ${tp2}/${B2.filter(isMove).length}, neutral correctly quiet ${tn2}/${B2.filter((t) => !isMove(t)).length}`);
  // Exact binomial tail vs chance 20% for forced choice.
  const k = Math.round(forced(feat) * BW.length), n = BW.length;
  const C = (n: number, k: number) => { let c = 1; for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i; return c; };
  let p = 0; for (let i = k; i <= n; i++) p += C(n, i) * 0.2 ** i * 0.8 ** (n - i);
  console.log(`  selected model vs chance: ${k}/${n}, one-sided binomial p = ${p.toExponential(2)}`);
  // Latency + dropouts.
  const gapTime = (D: typeof A) => { let g = 0, tot = 0; for (const t of D.trials) { tot += t.w.length ? t.w.at(-1)!.t - t.w[0]!.t : 0; t.w.slice(1).forEach((x, i) => { const d = x.t - t.w[i]!.t; if (d > 0.1) g += d; }); } return pct(g / tot); };
  console.log(`\nfraction of trial time lost in >100 ms gaps: w1 ${gapTime(A)}, w2 ${gapTime(B)}`);
  console.log(`classification compute per trial (DTW vs ${A.trials.length} templates, this Mac): median ${median(lat).toFixed(1)} ms, max ${Math.max(...lat).toFixed(1)} ms; capture window ${(median(B.trials.map((t) => t.w.at(-1)!.t - t.w[0]!.t))).toFixed(2)} s (fixed cue window in this experiment)`);
  const withGap = BW.filter((t) => t.gaps > 0), fr = ranker(AW, feat, W);
  const accOf = (T: Trial[]) => (T.length ? `${T.filter((t) => fr(t)[0]!.label === t.label).length}/${T.length}` : 'n/a');
  console.log(`dropouts: ${B.trials.filter((t) => t.gaps > 0).length}/${B.trials.length} w2 trials contain a >100 ms gap; forced-choice word accuracy with gap ${accOf(withGap)}, without ${accOf(BW.filter((t) => t.gaps === 0))}`);
  // Proxy for less exaggerated articulation: accuracy by motion-energy tercile (NOT a natural-speech test).
  const e = BW.map((t) => amp(t)[0]!), sorted = [...e].sort((a, b) => a - b), t1 = sorted[Math.floor(e.length / 3)]!, t2 = sorted[Math.floor((2 * e.length) / 3)]!;
  const terc = (lo: number, hi: number) => accOf(BW.filter((_, i) => e[i]! >= lo && e[i]! < hi));
  console.log(`proxy only — forced-choice accuracy by w2 motion-energy tercile: low ${terc(-Infinity, t1)}, mid ${terc(t1, t2)}, high ${terc(t2, Infinity)}`);
}
