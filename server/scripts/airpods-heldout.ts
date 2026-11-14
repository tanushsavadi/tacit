// Pre-registered train/held-out evaluation for AirPods silent words (w3 → w4).
//   npm run airpods:heldout -- prereg <w3> [--compare <w1>]  → selects everything on w3 only, writes a frozen config
//   npm run airpods:heldout -- evaluate <w3> <w4>             → applies the frozen config to w4 once; prints decision
// evaluate refuses a config not built from this w3, or created after w4 was recorded.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { FEATURE_SETS, type Feature, dtw, energy, frames, channelScales, scaled, margin } from '../src/airpods/motion.ts';
import { RidgeClassifier, makeKernels, transform, type Series } from '../src/airpods/rocket.ts';
import { type Trial, type Session, CONTROLS, SEGMENT, envelope, loadSession, mean, median, duration, motionEnergy, timingBundle } from '../src/airpods/session.ts';

const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
const SETS = ['rot', 'att', 'acc+rot', 'all'];
const N_KERNELS = 1000, SEED = 1;

// ---------- models: fit(train) → predict(trial) → ranked class scores (higher = better) ----------
type Ranked = { label: string; score: number }[];
type Model = { name: string; fit: (train: Trial[], labelOf: (t: Trial) => string) => (t: Trial) => Ranked; marginOf: (r: Ranked) => number; loo?: (train: Trial[], labelOf: (t: Trial) => string) => Ranked[] };
const seq = (seg: string, set: Feature[]) => (t: Trial): Series => frames(SEGMENT[seg]!(t), set);
const center = (f: number[][]) => { const d = f[0]?.length ?? 0; for (let k = 0; k < d; k++) { const m = mean(f.map((r) => r[k]!)); f.forEach((r) => (r[k]! -= m)); } return f; };
const rhythmSeq = (seg: string) => (t: Trial): Series => center(envelope(SEGMENT[seg]!(t)).map((e) => [e]));

function dtwModel(name: string, featurize: (t: Trial) => Series): Model {
  const build = (train: Trial[], labelOf: (t: Trial) => string) => {
    const tr = train.map(featurize), sc = channelScales(tr), T = tr.map((x) => scaled(x, sc));
    return (t: Trial, skip = -1): Ranked => {
      const q = scaled(featurize(t), sc), best = new Map<string, number>();
      T.forEach((x, j) => { if (j === skip) return; const l = labelOf(train[j]!); best.set(l, Math.min(best.get(l) ?? Infinity, dtw(q, x))); });
      return [...best].map(([label, d]) => ({ label, score: -d })).sort((a, b) => b.score - a.score);
    };
  };
  return {
    name, fit: (tr, lo) => { const f = build(tr, lo); return (t) => f(t); },
    loo: (tr, lo) => { const f = build(tr, lo); return tr.map((t, i) => f(t, i)); },
    marginOf: (r) => margin(r.map((x) => ({ label: x.label, distance: -x.score }))),
  };
}
function rocketModel(name: string, featurize: (t: Trial) => Series, channels: number): Model {
  const build = (train: Trial[], labelOf: (t: Trial) => string) => {
    const S = train.map(featurize), ks = makeKernels(N_KERNELS, channels, median(S.map((s) => s.length)), SEED);
    const clf = new RidgeClassifier().fit(S.map((s) => transform(s, ks)), train.map(labelOf));
    const rank = (sc: number[]): Ranked => clf.classes.map((label, k) => ({ label, score: sc[k]! })).sort((a, b) => b.score - a.score);
    return { predict: (t: Trial) => rank(clf.scores(transform(featurize(t), ks))), loo: () => clf.looScores.map(rank) };
  };
  return { name, fit: (tr, lo) => build(tr, lo).predict, loo: (tr, lo) => build(tr, lo).loo(), marginOf: (r) => r[0]!.score - (r[1]?.score ?? 0) };
}
function scalarNN(name: string, f: (t: Trial) => number[]): Model {
  const build = (train: Trial[], labelOf: (t: Trial) => string) => {
    const A = train.map(f), d = A[0]!.length;
    const mu = Array.from({ length: d }, (_, k) => mean(A.map((r) => r[k]!))), sd = Array.from({ length: d }, (_, k) => Math.sqrt(mean(A.map((r) => (r[k]! - mu[k]!) ** 2))) || 1);
    return (t: Trial, skip = -1): Ranked => {
      const q = f(t), best = new Map<string, number>();
      A.forEach((a, j) => { if (j === skip) return; const dist = Math.hypot(...a.map((x, k) => (x - q[k]!) / sd[k]!)); const l = labelOf(train[j]!); best.set(l, Math.min(best.get(l) ?? Infinity, dist)); });
      return [...best].map(([label, x]) => ({ label, score: -x })).sort((a, b) => b.score - a.score);
    };
  };
  return { name, fit: (tr, lo) => { const g = build(tr, lo); return (t) => g(t); }, loo: (tr, lo) => { const g = build(tr, lo); return tr.map((t, i) => g(t, i)); }, marginOf: (r) => r[0]!.score - (r[1]?.score ?? 0) };
}
const CH: Record<string, number> = { rot: 3, att: 3, 'acc+rot': 6, all: 9 };
function candidate(id: string): Model {
  const [family, seg, set] = id.split('/') as [string, string, string];
  return family === 'dtw' ? dtwModel(id, seq(seg, FEATURE_SETS[set]!)) : rocketModel(id, seq(seg, FEATURE_SETS[set]!), CH[set]!);
}
function baseline(id: string, seg: string): Model {
  switch (id) {
    case 'rhythm-dtw': return dtwModel(id, rhythmSeq(seg));
    case 'rhythm-rocket': return rocketModel(id, rhythmSeq(seg), 1);
    case 'duration': return scalarNN(id, duration);
    case 'energy': return scalarNN(id, motionEnergy);
    default: return scalarNN(id, timingBundle); // duration, mean & peak energy, peak (syllable-like) count
  }
}
const BASELINES = ['rhythm-dtw', 'rhythm-rocket', 'duration', 'energy', 'timing-bundle'];

const wordLabel = (words: string[]) => (t: Trial) => (words.includes(t.label) ? t.label : 'none');
const looAcc = (m: Model, T: Trial[], words: string[]) => { const r = m.loo!(T, wordLabel(words)); return mean(T.map((t, i) => (r[i]![0]!.label === t.label ? 1 : 0))); };
function decide(r: Ranked, words: string[], m: Model, th: number | null) { const p = r[0]!.label; return words.includes(p) ? (th === null || m.marginOf(r) >= th ? p : 'abstain') : 'none'; }
function tally(T: Trial[], outs: string[], words: string[]) {
  const W = T.filter((t) => words.includes(t.label)).length;
  let correct = 0, wrong = 0, abst = 0, none = 0, fa = 0;
  T.forEach((t, i) => { const o = outs[i]!; if (words.includes(t.label)) { if (o === t.label) correct++; else if (words.includes(o)) wrong++; else if (o === 'abstain') abst++; else none++; } else if (words.includes(o)) fa++; });
  return { correct, wrong, abst, none, fa, nW: W, nC: T.length - W, utility: correct - 2 * (wrong + fa) };
}
const binomTail = (k: number, n: number, p: number) => { let s = 0; for (let i = k; i <= n; i++) { let c = 1; for (let j = 1; j <= i; j++) c = (c * (n - i + j)) / j; s += c * p ** i * (1 - p) ** (n - i); } return s; };
const mcnemar = (a: boolean[], b: boolean[]) => { let x = 0, y = 0; a.forEach((v, i) => { if (v && !b[i]) x++; else if (!v && b[i]) y++; }); const n = x + y; return { aOnly: x, bOnly: y, p: n ? Math.min(1, 2 * binomTail(Math.max(x, y), n, 0.5)) : 1 }; };

const CRITERIA = {
  statistical: 'primary forced-choice word accuracy on w4: one-sided binomial p<0.05 vs 20% chance AND ≥15 points above EVERY baseline AND exact McNemar p<0.05 vs the strongest baseline on w4',
  practical: 'at the frozen threshold on w4: accepted-word precision ≥80%, coverage ≥30% of word trials, control false accepts ≤2/20',
  decision: 'GO = statistical AND practical; INCONCLUSIVE = statistical without practical, OR (beats chance p<0.05 AND practical) without beating baselines — the latter means usable timing-based command classification, not articulation evidence; NO-GO otherwise',
};

const [mode, d1, d2] = process.argv.slice(2);
const CFG = join(d1 ?? '.', '..', 'heldout-w3-config.json');

if (mode === 'prereg') {
  const A = loadSession(d1!), W = A.words, AW = A.trials.filter((t) => W.includes(t.label));
  console.log(`# Pre-registration on ${basename(A.dir)} only — ${A.trials.length} trials (${[...W, ...CONTROLS].map((l) => `${l} ${A.trials.filter((t) => t.label === l).length}`).join(', ')}); style: ${A.meta.style ?? 'n/a'}`);
  console.log('w3 LOO 5-word accuracy (chance 20%):');
  const res: { id: string; acc: number }[] = [];
  for (const family of ['dtw', 'rocket']) for (const seg of Object.keys(SEGMENT)) {
    const row = SETS.map((set) => { const id = `${family}/${seg}/${set}`; const acc = looAcc(candidate(id), AW, W); res.push({ id, acc }); return `${set} ${pct(acc)}`; });
    console.log(`  ${family.padEnd(6)} ${seg.padEnd(5)} ${row.join('  ')}`);
  }
  const order = (a: { id: string; acc: number }, b: { id: string; acc: number }) => b.acc - a.acc || (a.id.startsWith('dtw') ? -1 : 1);
  const primary = [...res].sort(order)[0]!, bestOf = (f: string) => [...res].filter((r) => r.id.startsWith(f)).sort(order)[0]!;
  console.log(`primary: ${primary.id} (${pct(primary.acc)}); secondary: ${bestOf('dtw').id}, ${bestOf('rocket').id}`);
  const seg = primary.id.split('/')[1]!;
  // Threshold on w3 LOO with reject class (neutral+other → none).
  const m = candidate(primary.id), r = m.loo!(A.trials, wordLabel(W)), margins = r.map((x) => m.marginOf(x)).sort((a, b) => a - b);
  let best: { th: number | null; u: number } = { th: null, u: -Infinity };
  for (const q of [0, ...Array.from({ length: 19 }, (_, i) => (i + 1) / 20)]) { const th = q === 0 ? null : margins[Math.floor(q * (margins.length - 1))]!; const s = tally(A.trials, r.map((x) => decide(x, W, m, th)), W); if (s.utility > best.u) best = { th, u: s.utility }; }
  const s = tally(A.trials, r.map((x) => decide(x, W, m, best.th)), W);
  console.log(`threshold ${best.th ?? 'none (accept all)'} (w3 LOO: correct ${s.correct}/${s.nW}, wrong ${s.wrong}, abstain ${s.abst}, none ${s.none}, control false accepts ${s.fa}/${s.nC})`);
  console.log('baselines (w3 LOO): ' + BASELINES.map((b) => `${b} ${pct(looAcc(baseline(b, seg), AW, W))}`).join(', '));
  const cmp = process.argv.indexOf('--compare');
  if (cmp > 0) { // Q1 descriptive: same fixed model (dtw/cue/rot, the w1-selected config) and motion energy, w1 vs w3.
    const P = loadSession(process.argv[cmp + 1]!), PW = P.trials.filter((t) => P.words.includes(t.label));
    const fixed = candidate('dtw/cue/rot'), rot = (T: Trial[]) => median(T.map((t) => Math.sqrt(mean(t.w.map((x) => x.rx ** 2 + x.ry ** 2 + x.rz ** 2)))));
    console.log(`articulation strength (median rotation RMS, words / neutral): w1 ${rot(PW).toFixed(4)} / ${rot(P.trials.filter((t) => t.label === 'neutral')).toFixed(4)}, w3 ${rot(AW).toFixed(4)} / ${rot(A.trials.filter((t) => t.label === 'neutral')).toFixed(4)}`);
    console.log(`fixed dtw/cue/rot within-session LOO: w1 ${pct(looAcc(fixed, PW, P.words))}, w3 ${pct(looAcc(fixed, AW, W))}`);
  }
  writeFileSync(CFG, JSON.stringify({ trainedOn: basename(A.dir), trainHash: A.hash, words: W, primary: primary.id, secondary: [bestOf('dtw').id, bestOf('rocket').id], threshold: best.th, baselines: BASELINES, baselineSegment: seg, kernels: N_KERNELS, seed: SEED, criteria: CRITERIA, created: new Date().toISOString() }, null, 1));
  console.log(`frozen → ${CFG}`);
} else if (mode === 'evaluate') {
  const cfg = JSON.parse(readFileSync(CFG, 'utf8'));
  const A = loadSession(d1!), B = loadSession(d2!), W: string[] = cfg.words;
  if (cfg.trainHash !== A.hash) throw new Error('frozen config was not built from this w3 data');
  if (!(new Date(B.meta.created) > new Date(cfg.created))) throw new Error(`w4 (${B.meta.created}) was recorded before the config was frozen (${cfg.created})`);
  console.log(`# Held-out: ${basename(A.dir)} → ${basename(B.dir)}; config frozen ${cfg.created}, w4 recorded ${B.meta.created}`);
  console.log(`w4 trials ${B.trials.length}: ${[...W, ...CONTROLS].map((l) => `${l} ${B.trials.filter((t) => t.label === l).length}`).join(', ')}`);
  const AW = A.trials.filter((t) => W.includes(t.label)), BW = B.trials.filter((t) => W.includes(t.label));
  const forced = (m: Model) => { const p = m.fit(AW, wordLabel(W)); const lat: number[] = []; const ok = BW.map((t) => { const s = performance.now(); const r = p(t); lat.push(performance.now() - s); return r[0]!.label; }); return { pred: ok, hit: ok.map((l, i) => l === BW[i]!.label), lat }; };
  const P = forced(candidate(cfg.primary)), k = P.hit.filter(Boolean).length, pBin = binomTail(k, BW.length, 0.2);
  console.log(`\nPRIMARY ${cfg.primary} forced choice: ${k}/${BW.length} = ${pct(k / BW.length)} (chance 20%, binomial p=${pBin.toExponential(2)})`);
  console.log('  confusion (rows actual, cols predicted):\n    ' + ''.padEnd(7) + W.map((w) => w.padStart(7)).join(''));
  for (const l of W) console.log('    ' + l.padEnd(7) + W.map((c) => String(BW.filter((t, i) => t.label === l && P.pred[i] === c).length).padStart(7)).join(''));
  const bl = cfg.baselines.map((b: string) => ({ b, r: forced(baseline(b, cfg.baselineSegment)) }));
  console.log('baselines (trained on w3): ' + bl.map((x: any) => `${x.b} ${pct(mean(x.r.hit.map(Number)))}`).join(', '));
  const strongest = [...bl].sort((x: any, y: any) => mean(y.r.hit.map(Number)) - mean(x.r.hit.map(Number)))[0];
  const mc = mcnemar(P.hit, strongest.r.hit), margin15 = bl.every((x: any) => k / BW.length - mean(x.r.hit.map(Number)) >= 0.15);
  console.log(`vs strongest baseline (${strongest.b}): primary-only correct ${mc.aOnly}, baseline-only ${mc.bOnly}, exact McNemar p=${mc.p.toFixed(3)}; ≥15 points above every baseline: ${margin15}`);
  const tb = bl.find((x: any) => x.b === 'timing-bundle').r.hit as boolean[];
  console.log(`primary accuracy on trials the timing/syllable/amplitude baseline gets WRONG: ${P.hit.filter((h, i) => h && !tb[i]).length}/${tb.filter((x) => !x).length}`);
  for (const id of cfg.secondary) console.log(`secondary ${id}: ${pct(mean(forced(candidate(id)).hit.map(Number)))}`);
  console.log(`fixed dtw/cue/rot (earlier w1-selected config) w3→w4: ${pct(mean(forced(candidate('dtw/cue/rot')).hit.map(Number)))}  (w1→w2 was 34%)`);
  // Thresholded operation with reject class.
  const m = candidate(cfg.primary), pr = m.fit(A.trials, wordLabel(W)), outs = B.trials.map((t) => decide(pr(t), W, m, cfg.threshold));
  const s = tally(B.trials, outs, W), accepted = s.correct + s.wrong + s.fa;
  console.log(`\nthresholded (frozen ${cfg.threshold}): accepted ${s.correct + s.wrong}/${s.nW} words (coverage ${pct((s.correct + s.wrong) / s.nW)}), correct ${s.correct}, wrong ${s.wrong}, abstained ${s.abst}, rejected as none ${s.none}`);
  console.log(`  accepted-word precision ${accepted ? pct(s.correct / accepted) : 'n/a'}; control false accepts ${s.fa}/${s.nC}: ` + [...new Set(B.trials.filter((t) => !W.includes(t.label)).map((t) => t.cue))].map((c) => `${c} ${B.trials.filter((t, i) => t.cue === c && !W.includes(t.label) && W.includes(outs[i]!)).length}/${B.trials.filter((t) => t.cue === c && !W.includes(t.label)).length}`).join(', '));
  const statistical = pBin < 0.05 && margin15 && mc.p < 0.05, practical = accepted > 0 && s.correct / accepted >= 0.8 && (s.correct + s.wrong) / s.nW >= 0.3 && s.fa <= 2;
  console.log(`\nlatency: classification ${median(P.lat).toFixed(1)} ms median (max ${Math.max(...P.lat).toFixed(1)}); capture window ${median(B.trials.map((t) => t.w.at(-1)!.t - t.w[0]!.t)).toFixed(2)} s`);
  const g = BW.map((t) => t.gaps > 0);
  console.log(`dropouts: ${B.trials.filter((t) => t.gaps).length}/${B.trials.length} trials with >100 ms gap; primary accuracy with gap ${P.hit.filter((h, i) => h && g[i]).length}/${g.filter(Boolean).length}, without ${P.hit.filter((h, i) => h && !g[i]).length}/${g.filter((x) => !x).length}`);
  const verdict = statistical && practical ? 'GO' : statistical ? 'INCONCLUSIVE (signal beyond timing, not usable at the frozen threshold)'
    : pBin < 0.05 && practical ? 'INCONCLUSIVE (usable closed-set classification, but not beyond timing/amplitude baselines)' : 'NO-GO';
  console.log(`\nPRE-REGISTERED DECISION: statistical ${statistical ? 'PASS' : 'FAIL'} (chance p ${pBin < 0.05 ? '<' : '≥'} 0.05, +15 pts over all baselines ${margin15}, McNemar ${mc.p < 0.05 ? '<' : '≥'} 0.05), practical ${practical ? 'PASS' : 'FAIL'} → ${verdict}`);
}
