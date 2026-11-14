// Offline analysis for airpods:record sessions. Never trains and tests on the same trial.
//   npm run airpods:analyze -- <sessionDir> [<sessionDir> ...]   (jaw and/or cmd sessions)
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { FEATURE_SETS, type Feature, type Sample, dtw, energy, frames, channelScales, scaled, trim, margin } from '../src/airpods/motion.ts';

type Ev = { kind: string; label?: string; cue?: string; t0: number; t1?: number };
interface Session { dir: string; protocol: string; s: Sample[]; loc: string[]; events: Ev[] }
const load = (dir: string): Session => {
  const meta = JSON.parse(readFileSync(`${dir}/events.json`, 'utf8'));
  const lines = readFileSync(`${dir}/motion.csv`, 'utf8').trim().split('\n').slice(1);
  const s: Sample[] = [], loc: string[] = [];
  for (const l of lines) {
    const parts = l.split(','), v = (i: number) => Number(parts[i]);
    s.push({ t: v(0), ax: v(1), ay: v(2), az: v(3), rx: v(4), ry: v(5), rz: v(6), pitch: v(7), roll: v(8), yaw: v(9) });
    loc.push(parts[17] ?? '?');
  }
  return { dir, protocol: meta.protocol, s, loc, events: meta.events };
};
const win = (S: Session, a: number, b: number) => S.s.filter((x) => x.t >= a && x.t < b);
const fmt = (x: number, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(a.length, 1);
const std = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const median = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)] ?? NaN; };
const DEG = 180 / Math.PI;
const CH = ['ax', 'ay', 'az', 'rx', 'ry', 'rz'] as const;
const headExcursion = (w: Sample[]) => {
  if (!w.length) return NaN;
  const o = w[0]!;
  return Math.max(...w.map((x) => Math.hypot(x.pitch - o.pitch, x.roll - o.roll, Math.atan2(Math.sin(x.yaw - o.yaw), Math.cos(x.yaw - o.yaw))))) * DEG;
};

function sensorReport(S: Session) {
  const dt = S.s.slice(1).map((x, i) => x.t - S.s[i]!.t);
  const dur = S.s.at(-1)!.t - S.s[0]!.t;
  const locs = S.loc.reduce<Record<string, number>>((m, l) => ((m[l] = (m[l] ?? 0) + 1), m), {});
  console.log(`  samples ${S.s.length} over ${fmt(dur, 1)} s → ${fmt(S.s.length / dur, 1)} Hz; dt median ${fmt(median(dt) * 1000, 1)} ms, ` +
    `p95 ${fmt([...dt].sort((a, b) => a - b)[Math.floor(dt.length * 0.95)]! * 1000, 1)} ms, gaps>100ms: ${dt.filter((d) => d > 0.1).length}; sensor ${JSON.stringify(locs)}`);
}

function jawReport(S: Session) {
  console.log(`\n## Gate 1 — ${basename(S.dir)}`);
  sensorReport(S);
  const still = S.events.filter((e) => e.kind === 'still').flatMap((e) => win(S, e.t0 + 0.5, e.t1!));
  const ticks = (l: string) => S.events.filter((e) => e.kind === 'tick' && e.label === l);
  const epochs = (l: string) => ticks(l).map((e) => win(S, e.t0, e.t0 + 1.6));
  const rms = (w: Sample[], c: (typeof CH)[number]) => Math.sqrt(mean(w.map((x) => x[c] ** 2)));
  console.log('  channel RMS (acc g, rot rad/s):   ' + CH.map((c) => c.padStart(8)).join(''));
  for (const [name, w] of [['still', still], ['jaw', epochs('jaw').flat()], ['nod', epochs('nod').flat()]] as const)
    console.log(`  ${name.padEnd(34)}` + CH.map((c) => fmt(rms(w, c), 4).padStart(8)).join(''));
  // Per-epoch energy vs still windows of equal length → separability (AUC) and reproducibility.
  const stillEpochs: Sample[][] = [];
  for (const e of S.events.filter((e) => e.kind === 'still')) for (let t = e.t0 + 0.5; t + 1.6 <= e.t1!; t += 0.8) stillEpochs.push(win(S, t, t + 1.6));
  const eMean = (w: Sample[]) => mean(w.map(energy));
  const auc = (pos: number[], neg: number[]) => mean(pos.map((p) => mean(neg.map((n) => (p > n ? 1 : p === n ? 0.5 : 0)))));
  const sE = stillEpochs.map(eMean);
  for (const l of ['jaw', 'nod']) {
    const ep = epochs(l);
    const pE = ep.map(eMean);
    console.log(`  ${l}: mean energy ${fmt(mean(pE), 4)} vs still ${fmt(mean(sE), 4)} (×${fmt(mean(pE) / mean(sE), 1)}); AUC epoch-vs-still ${fmt(auc(pE, sE), 2)}; ` +
      `head excursion median ${fmt(median(ep.map(headExcursion)), 2)}° (still ${fmt(median(stillEpochs.map(headExcursion)), 2)}°)`);
    // Split-half reliability of the epoch-averaged waveform per channel.
    const L = Math.min(...ep.map((w) => w.length));
    const avg = (set: Sample[][], c: (typeof CH)[number]) => Array.from({ length: L }, (_, i) => mean(set.map((w) => w[i]![c])));
    const corr = (a: number[], b: number[]) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; a.forEach((x, i) => { n += (x - ma) * (b[i]! - mb); da += (x - ma) ** 2; db += (b[i]! - mb) ** 2; }); return n / Math.sqrt(da * db); };
    const odd = ep.filter((_, i) => i % 2), even = ep.filter((_, i) => !(i % 2));
    console.log(`     split-half waveform r: ` + CH.map((c) => `${c} ${fmt(corr(avg(odd, c), avg(even, c)), 2)}`).join('  '));
  }
}

// ---------- Gate 3 ----------
function readWav(path: string): { rate: number; x: Float32Array } {
  const b = readFileSync(path);
  let o = 12, rate = 16000;
  while (o + 8 <= b.length) {
    const id = b.toString('ascii', o, o + 4), len = b.readUInt32LE(o + 4);
    if (id === 'fmt ') rate = b.readUInt32LE(o + 12);
    if (id === 'data') { const n = Math.floor(Math.min(len, b.length - o - 8) / 2), x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = b.readInt16LE(o + 8 + 2 * i) / 32768; return { rate, x }; }
    o += 8 + len + (len % 2);
  }
  throw new Error('no data chunk');
}
function micReport(S: Session) {
  console.log(`\n## Gate 3 — ${basename(S.dir)} (outward mic, processed HFP stream)`);
  let w: { rate: number; x: Float32Array };
  try { w = readWav(`${S.dir}/audio.wav`); } catch (e) { console.log(`  no audio: ${(e as Error).message}`); return; }
  const a0 = S.events.find((e) => e.kind === 'audio_start')!.t0;
  console.log(`  audio ${fmt(w.x.length / w.rate, 1)} s @ ${w.rate} Hz (Nyquist ${w.rate / 2} Hz — no ultrasonic band available)`);
  const seg = (t: number, d: number) => w.x.subarray(Math.max(0, Math.round((t - a0) * w.rate)), Math.max(0, Math.round((t - a0 + d) * w.rate)));
  const db = (v: Float32Array) => 10 * Math.log10(mean(Array.from(v, (y) => y * y)) + 1e-12);
  const hp = (v: Float32Array) => Float32Array.from(v.subarray(1), (y, i) => y - v[i]!); // first difference ≈ high-pass
  const auc = (pos: number[], neg: number[]) => mean(pos.map((p) => mean(neg.map((n) => (p > n ? 1 : p === n ? 0.5 : 0)))));
  // Skip the first 0.35 s after the tick (cue sound), analyse 0.35–2.0 s.
  const ep = (l: string) => S.events.filter((e) => e.kind === 'tick' && e.label === l).map((e) => e.t0 + 0.35);
  const sham = ep('sham');
  for (const l of ['jaw', 'mouth']) {
    const pos = ep(l);
    if (!pos.length) continue;
    const full = (ts: number[]) => ts.map((t) => db(seg(t, 1.65))), high = (ts: number[]) => ts.map((t) => db(hp(seg(t, 1.65))));
    const imu = (ts: number[]) => ts.map((t) => mean(win(S, t, t + 1.65).map(energy)));
    console.log(`  ${l.padEnd(5)} vs sham: mic full-band ${fmt(mean(full(pos)), 1)} vs ${fmt(mean(full(sham)), 1)} dBFS (AUC ${fmt(auc(full(pos), full(sham)), 2)}); ` +
      `high-pass ${fmt(mean(high(pos)), 1)} vs ${fmt(mean(high(sham)), 1)} dB (AUC ${fmt(auc(high(pos), high(sham)), 2)}); IMU energy AUC ${fmt(auc(imu(pos), imu(sham)), 2)}  [n=${pos.length}/${sham.length}]`);
  }
}

// ---------- Gate 2 ----------
type Trial = { label: string; w: Sample[]; pre: Sample[]; session: string };
const trials = (S: Session): Trial[] =>
  S.events.filter((e) => e.kind === 'trial').map((e) => ({ label: e.label!, w: win(S, e.t0, e.t1 ?? e.t0 + 2.3), pre: win(S, e.t0 - 1.2, e.t0), session: basename(S.dir) }));

const STRATS: Record<string, (t: Trial) => Sample[]> = {
  cue: (t) => t.w, // fixed cue-locked window
  trim: (t) => trim(t.w), // Subvox energy trim
  onset: (t) => { // first crossing above the pre-cue baseline, fixed 1.6 s
    const base = t.pre.map(energy); const th = median(base) + 4 * (median(base.map((x) => Math.abs(x - median(base)))) + 1e-4);
    const i = t.w.findIndex((x) => energy(x) > th);
    const a = i < 0 ? 0 : Math.max(0, i - 2);
    const tEnd = (t.w[a]?.t ?? 0) + 1.6;
    return t.w.slice(a).filter((x) => x.t < tEnd);
  },
};
const CONTROLS = ['neutral', 'other'];
let COMMANDS = ['c1', 'c2', 'c3']; // set per session from its labels
const isCmd = (l: string) => COMMANDS.includes(l);
const LABELS = () => [...COMMANDS, ...CONTROLS];
const group = (l: string) => (isCmd(l) ? l : 'none');

function prep(train: Trial[], test: Trial[], strat: string, set: Feature[]) {
  const f = (t: Trial) => frames(STRATS[strat]!(t), set);
  const tr = train.map(f), te = test.map(f);
  const sc = channelScales(tr);
  return { tr: tr.map((x) => scaled(x, sc)), te: te.map((x) => scaled(x, sc)) };
}
/** Rank classes for each test item by nearest template distance; excludeSelf for LOO on one set. */
function rankAll(train: Trial[], test: Trial[], strat: string, set: Feature[], loo: boolean) {
  const { tr, te } = prep(train, test, strat, set);
  return te.map((q, i) => {
    const best = new Map<string, number>();
    tr.forEach((x, j) => { if (loo && i === j) return; const g = group(train[j]!.label); best.set(g, Math.min(best.get(g) ?? Infinity, dtw(q, x))); });
    return [...best].map(([label, distance]) => ({ label, distance })).sort((a, b) => a.distance - b.distance);
  });
}

function commandsOnlyLoo(T: Trial[], strat: string, set: Feature[], perms = 300) {
  const C = T.filter((t) => isCmd(t.label));
  const { tr } = prep(C, C, strat, set);
  const n = C.length, D = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) D[i]![j] = D[j]![i] = dtw(tr[i]!, tr[j]!);
  const acc = (lab: string[]) => {
    let ok = 0;
    for (let i = 0; i < n; i++) { let bj = -1; for (let j = 0; j < n; j++) if (j !== i && (bj < 0 || D[i]![j]! < D[i]![bj]!)) bj = j; if (lab[bj] === lab[i]) ok++; }
    return ok / n;
  };
  const truth = C.map((t) => t.label), obs = acc(truth);
  let ge = 0;
  for (let p = 0; p < perms; p++) { const sh = [...truth].sort(() => Math.random() - 0.5); if (acc(sh) >= obs) ge++; }
  return { acc: obs, p: (ge + 1) / (perms + 1), n };
}

function confusion(test: Trial[], ranked: { label: string; distance: number }[][], minMargin: number) {
  const rows = LABELS(), cols = [...COMMANDS, 'none', 'abstain'];
  const M = rows.map(() => cols.map(() => 0));
  test.forEach((t, i) => {
    const r = ranked[i]!, pred = r[0]!.label;
    const out = isCmd(pred) && margin(r) < minMargin ? 'abstain' : pred;
    M[rows.indexOf(t.label)]![cols.indexOf(out)]!++;
  });
  console.log(`     actual\\pred ` + cols.map((c) => c.padStart(8)).join(''));
  rows.forEach((r, i) => console.log(`     ${r.padEnd(11)} ` + M[i]!.map((x) => String(x).padStart(8)).join('')));
  return M;
}
function sweep(test: Trial[], ranked: { label: string; distance: number }[][]) {
  for (const m of [0, 0.05, 0.1, 0.2, 0.3]) {
    let cmdN = 0, acc = 0, ok = 0, noneN = 0, fa = 0;
    test.forEach((t, i) => {
      const r = ranked[i]!, pred = r[0]!.label, accepted = isCmd(pred) && margin(r) >= m;
      if (isCmd(t.label)) { cmdN++; if (accepted) { acc++; if (pred === t.label) ok++; } } else { noneN++; if (accepted) fa++; }
    });
    console.log(`     margin≥${m.toFixed(2)}: commands accepted ${acc}/${cmdN} (coverage ${pct(acc / cmdN)}), correct-when-accepted ${ok}/${acc} (${acc ? pct(ok / acc) : 'n/a'}), ` +
      `command-correct overall ${pct(ok / cmdN)}; non-command false accepts ${fa}/${noneN}`);
  }
}

function headConfound(T: Trial[]) {
  console.log('  head-motion control (per class: median head excursion °, median rotation RMS rad/s, median accel RMS g):');
  for (const l of LABELS()) {
    const W = T.filter((t) => t.label === l).map((t) => t.w);
    console.log(`     ${l.padEnd(8)} ${fmt(median(W.map(headExcursion)), 2).padStart(6)}°  ${fmt(median(W.map((w) => Math.sqrt(mean(w.map((x) => x.rx ** 2 + x.ry ** 2 + x.rz ** 2))))), 4)}  ${fmt(median(W.map((w) => Math.sqrt(mean(w.map((x) => x.ax ** 2 + x.ay ** 2 + x.az ** 2))))), 4)}`);
  }
  // Baseline: 1-NN on scalar head-excursion features only (commands). If this matches DTW accuracy, suspect head motion.
  const C = T.filter((t) => isCmd(t.label));
  const feat = (w: Sample[]) => { const o = w[0]; return ['pitch', 'roll', 'yaw'].map((k) => Math.max(...w.map((x) => Math.abs((x as any)[k] - (o as any)[k])))); };
  const F = C.map((t) => feat(t.w));
  let ok = 0;
  F.forEach((f, i) => { let bj = -1, bd = Infinity; F.forEach((g, j) => { if (i === j) return; const d = Math.hypot(...f.map((x, k) => x - g[k]!)); if (d < bd) { bd = d; bj = j; } }); if (C[bj]!.label === C[i]!.label) ok++; });
  console.log(`     head-excursion-only 1-NN (commands, LOO): ${pct(ok / C.length)} (chance ${pct(1 / COMMANDS.length)})`);
  // Baselines that would mean "movement detected" rather than "word identified".
  const nn1 = (F: number[][]) => F.filter((f, i) => { let bj = -1, bd = Infinity; F.forEach((g, j) => { if (i === j) return; const d = Math.hypot(...f.map((x, k) => x - g[k]!)); if (d < bd) { bd = d; bj = j; } }); return C[bj]!.label === C[i]!.label; }).length / F.length;
  const dur = C.map((t) => { const w = trim(t.w); return [w.length ? w.at(-1)!.t - w[0]!.t : 0]; });
  const amp = C.map((t) => [mean(t.w.map(energy))]);
  console.log(`     duration-only 1-NN: ${pct(nn1(dur))}; mean-energy-only 1-NN: ${pct(nn1(amp))}; duration+energy: ${pct(nn1(dur.map((d, i) => [d[0]! * 10, amp[i]![0]! * 10])))}`);
  const env = C.map((t) => trim(t.w).map((x) => [energy(x)]));
  let okE = 0;
  env.forEach((q, i) => { let bj = -1, bd = Infinity; env.forEach((g, j) => { if (i === j) return; const d = dtw(q, g); if (d < bd) { bd = d; bj = j; } }); if (C[bj]!.label === C[i]!.label) okE++; });
  console.log(`     energy-envelope DTW 1-NN (rhythm only, no axis/shape info): ${pct(okE / C.length)}`);
}

const sessions = process.argv.slice(2).filter((a) => !a.startsWith('--')).map(load);
for (const S of sessions.filter((s) => s.protocol === 'jaw')) jawReport(S);
for (const S of sessions.filter((s) => s.protocol === 'mic')) micReport(S);
const cmdSessions = sessions.filter((s) => s.protocol === 'cmd' || s.protocol === 'words');
for (const S of cmdSessions) {
  console.log(`\n## Gate 2 within-session — ${basename(S.dir)}`);
  sensorReport(S);
  const T = trials(S);
  COMMANDS = [...new Set(T.map((t) => t.label))].filter((l) => !CONTROLS.includes(l)).sort();
  console.log(`  trials: ${T.length} (${LABELS().map((l) => `${l} ${T.filter((t) => t.label === l).length}`).join(', ')})`);
  console.log(`  ${COMMANDS.length}-class LOO 1-NN DTW accuracy (chance ${pct(1 / COMMANDS.length)}), permutation p — each trial is its own recording:`);
  console.log('     strategy  ' + Object.keys(FEATURE_SETS).map((k) => k.padStart(15)).join(''));
  let best = { acc: -1, strat: 'cue', set: 'all' };
  for (const strat of Object.keys(STRATS)) {
    const row = Object.entries(FEATURE_SETS).map(([k, set]) => { const r = commandsOnlyLoo(T, strat, set); if (r.acc > best.acc) best = { acc: r.acc, strat, set: k }; return `${pct(r.acc)} p=${fmt(r.p, 3)}`.padStart(15); });
    console.log(`     ${strat.padEnd(9)} ` + row.join(''));
  }
  headConfound(T);
  console.log(`  5-class LOO with reject templates (neutral+other → none), best combo ${best.strat}/${best.set} (selected on this table; optimistic):`);
  const ranked = rankAll(T, T, best.strat, FEATURE_SETS[best.set]!, true);
  confusion(T, ranked, 0);
  sweep(T, ranked);
}
if (cmdSessions.length >= 2) {
  for (const [A, B] of [[cmdSessions[0]!, cmdSessions[1]!], [cmdSessions[1]!, cmdSessions[0]!]] as const) {
    console.log(`\n## Gate 2 cross-session (train ${basename(A.dir)} → test ${basename(B.dir)}; AirPods re-seated between)`);
    const TA = trials(A), TB = trials(B);
    COMMANDS = [...new Set(TA.map((t) => t.label))].filter((l) => !CONTROLS.includes(l)).sort();
    console.log('     strategy  ' + Object.keys(FEATURE_SETS).map((k) => k.padStart(9)).join(''));
    for (const strat of Object.keys(STRATS)) {
      const row = Object.entries(FEATURE_SETS).map(([, set]) => {
        const C = TB.filter((t) => isCmd(t.label));
        const r = rankAll(TA.filter((t) => isCmd(t.label)), C, strat, set, false);
        return pct(r.filter((x, i) => x[0]!.label === C[i]!.label).length / C.length).padStart(9);
      });
      console.log(`     ${strat.padEnd(9)} ` + row.join(''));
    }
    const strat = process.argv.includes('--strat') ? process.argv[process.argv.indexOf('--strat') + 1] ?? 'trim' : 'trim';
    const set = process.argv.includes('--set') ? process.argv[process.argv.indexOf('--set') + 1] ?? 'all' : 'all';
    console.log(`  5-class with reject templates, ${strat}/${set} (fixed before looking at cross-session results):`);
    const ranked = rankAll(TA, TB, strat, FEATURE_SETS[set] ?? FEATURE_SETS.all!, false);
    confusion(TB, ranked, 0);
    sweep(TB, ranked);
  }
}
