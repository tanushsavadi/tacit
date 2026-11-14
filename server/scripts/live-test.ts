// Guided, held-out LIVE test of silent recognition through the real browser workspace (camera → MediaPipe →
// endpointing → JPEG upload → Auto-AVSR → display). This script only OBSERVES the user's WebSocket (plus one
// pause/resume for the pause trial); the browser does all capture. Reference sentences are shown to the USER in this
// terminal and are never sent to the server or the model. Speaks nothing; voice output is never touched.
//   1. ./scripts/tacit.sh open → Start Live preview (camera) in the browser, face lit from the front
//   2. cd server && npm run live:test
// Log (refs + hypotheses, no images) → recognition/data/live/<time>-livetest.jsonl (git-ignored, private).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import type { LiveStatus, RecognitionHypothesis, ServerMessage } from '../../shared/protocol.ts';
import { secrets } from './secrets.ts';

// Sentence sets. v1 was the FIRST held-out live test (2026-11-14 19:58 UTC, report in docs/DEMO_READINESS.md); those
// sentences have since been studied and are kept only for reproducibility (`--set v1`). v2 is fresh: written after
// that report, never used in any development evaluation, not in the recorder prompts or the phrase list.
const SETS: Record<string, string[]> = {
  v1: ['yes I understand', 'can we talk later', 'my battery is almost empty', 'please send me the address',
    'I think the meeting went really well today'],
  v2: ['could you turn the music down', 'we should order pizza tonight', 'please close the door behind you',
    'where did you park the car', 'I will be there in ten minutes'],
};
const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const SET = arg('--set') ?? 'v2';
const SENTENCES = SETS[SET];
if (!SENTENCES) { console.error(`unknown --set ${SET}`); process.exit(2); }
// --phrases: in-list attempts for the phrase-mode gate (DEMO_READINESS F), 10 list phrases × 2, random order.
const PHRASE_RUN = process.argv.includes('--phrases');
const LIST_SAMPLE = ['can you call my mother', 'I need help with this', 'thank you for coming', 'please turn on the lights',
  'I am tired', 'call the doctor', 'can you repeat that', 'good morning', 'where are my glasses', 'please wait a moment'];
const WINDOW_MS = 9000;

type Trial = { kind: 'sentence' | 'rest' | 'repeat' | 'pause' | 'phrase'; ref: string | null; instruction: string; expect: number; windowMs?: number };
const TRIALS: Trial[] = PHRASE_RUN
  ? [...LIST_SAMPLE, ...LIST_SAMPLE].map((s) => ({ s, k: Math.random() })).sort((a, b) => a.k - b.k)
      .map(({ s }): Trial => ({ kind: 'phrase', ref: s, instruction: `silently mouth ONCE: «${s}», then keep still`, expect: 1, windowMs: 7000 }))
  : [
      ...SENTENCES.map((s): Trial => ({ kind: 'sentence', ref: s, instruction: `silently mouth ONCE: «${s}», then keep still`, expect: 1 })),
      { kind: 'rest', ref: null, instruction: 'keep your face still and relaxed (do not mouth anything)', expect: 0, windowMs: 15000 },
      { kind: 'rest', ref: null, instruction: 'smile, relax, smile again, relax, smile a third time (do not mouth words)', expect: 0, windowMs: 12000 },
      { kind: 'rest', ref: null, instruction: 'swallow twice, nod twice and glance away briefly (do not mouth words)', expect: 0, windowMs: 12000 },
      { kind: 'rest', ref: null, instruction: 'LISTEN as if someone is talking to you: nod, smile, react naturally — but do not mouth words', expect: 0, windowMs: 20000 },
      { kind: 'repeat', ref: 'can you pass the salt', instruction: 'silently mouth «can you pass the salt» THREE times, ~2 s still between', expect: 3, windowMs: 22000 },
      { kind: 'pause', ref: 'please close the door behind you', instruction: 'silently mouth «please close the door behind you» over and over; this script PAUSES Live after 2 s', expect: 0 },
    ];

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z' ]+/g, ' ').replace(/'/g, '').replace(/\s+/g, ' ').trim();
function wer(ref: string, hyp: string): [number, number] {
  const r = norm(ref).split(' ').filter(Boolean), h = norm(hyp).split(' ').filter(Boolean);
  let d = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const n = [i];
    for (let j = 1; j <= h.length; j++) n[j] = Math.min(d[j]! + 1, n[j - 1]! + 1, d[j - 1]! + (r[i - 1] === h[j - 1] ? 0 : 1));
    d = n;
  }
  return [d[h.length]!, r.length];
}
const pct = (xs: number[], p: number) => xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]! : NaN;

const ws = new WebSocket(`${process.env.TACIT_URL ?? 'ws://127.0.0.1:8790'}/ws?token=${secrets.userToken}`);
let live: LiveStatus | null = null;
let sink: { at: number; h: RecognitionHypothesis }[] | null = null;
const t0 = Date.now();
const statusLog: { at: number; state: string }[] = [];
ws.on('message', (d) => {
  const m = JSON.parse(String(d)) as ServerMessage;
  if (m.type === 'live_status') { live = m.status; statusLog.push({ at: Date.now(), state: m.status.state }); }
  if (m.type === 'speech_delivery') console.log(`!! speech delivery observed (${m.delivery.source}, ${m.delivery.state}) — this test never requests speech`);
  if (m.type === 'recognition_hypothesis' && sink) {
    sink.push({ at: Date.now(), h: m.hypothesis });
    const h = m.hypothesis, st = h.stages ?? {};
    console.log(`   → ${h.decision === 'shown' ? `SHOWN ${JSON.stringify(h.rawText)}` : `abstained (${h.reason})`}` +
      `${h.phraseMatch?.accepted ? `  [phrase list: ${h.phraseMatch.phrase}]` : ''}  end→shown ≈ ${(st.endpoint_wait ?? 0) + (st.upload ?? 0) + h.recognitionMs} ms` +
      `${typeof h.gate?.mouth_brightness === 'number' ? `  brightness ${h.gate.mouth_brightness}` : ''}`);
    if (process.env.TACIT_DEBUG) console.log(`     stages ${JSON.stringify(st)} recognitionMs ${h.recognitionMs}`);
  }
});
await new Promise((r) => ws.once('open', r));
await new Promise((r) => setTimeout(r, 400));
const rl = createInterface({ input: process.stdin, output: process.stdout });
// Non-interactive stdin (CI/plumbing checks): do not wait for Enter.
const ask = async (q: string) => { if (!process.stdin.isTTY) { console.log(q); await new Promise((r) => setTimeout(r, 300)); return ''; } return rl.question(q); };
if ((live as LiveStatus | null)?.state !== 'active') {
  console.log(`Live is ${(live as LiveStatus | null)?.state ?? 'unknown'}. In the browser workspace press "Start Live preview" (camera on, face lit from the front), then press Enter here.`);
  await ask('');
  if ((live as LiveStatus | null)?.state !== 'active') { console.log('Live still not active — aborting.'); process.exit(1); }
}
console.log(`\nLive active (display-only). Set ${PHRASE_RUN ? 'phrases' : SET}: ${TRIALS.length} trials (window shown per trial). Silent articulation only — no voice, no whisper.\n`);

const results: { trial: Trial; hyps: RecognitionHypothesis[]; atMs: number[]; startedMs: number; afterPause: number }[] = [];
for (const [k, trial] of TRIALS.entries()) {
  const windowMs = trial.windowMs ?? WINDOW_MS;
  await ask(`[${k + 1}/${TRIALS.length}] ${trial.kind.toUpperCase()} (${windowMs / 1000} s): ${trial.instruction}\n   press Enter to start…`);
  const got: { at: number; h: RecognitionHypothesis }[] = [];
  sink = got;
  const start = Date.now();
  let pausedAt = 0;
  if (trial.kind === 'pause') {
    await new Promise((r) => setTimeout(r, 2000));
    ws.send(JSON.stringify({ type: 'live_control', action: 'pause' })); pausedAt = Date.now();
    console.log('   (Live PAUSED by the test — keep mouthing)');
    await new Promise((r) => setTimeout(r, windowMs - 2000));
    ws.send(JSON.stringify({ type: 'live_control', action: 'resume' }));
    await new Promise((r) => setTimeout(r, 600));
    console.log(`   (Live resumed: state ${(live as LiveStatus | null)?.state})`);
  } else {
    await new Promise((r) => setTimeout(r, windowMs));
    // Results still in flight for motion that ended inside the window are kept (recognition takes ~1 s); the end of
    // the window is announced so the user stops.
    console.log('   (window closed — keep still)');
    await new Promise((r) => setTimeout(r, 1500));
  }
  sink = null;
  // Results arriving after the pause was requested must not be shown (in-flight ones are dropped as abstained).
  const afterPause = pausedAt ? got.filter((g) => g.at > pausedAt + 50 && g.h.decision === 'shown').length : 0;
  results.push({ trial, hyps: got.map((g) => g.h), atMs: got.map((g) => g.at - start), startedMs: start - t0, afterPause });
  if (!got.length) console.log('   → nothing detected in this window');
  void start;
}
rl.close();
ws.close();

// ── report ──
console.log('\n================ LIVE TEST REPORT (held-out sentences, silent, real browser pipeline) ================');
let E = 0, N = 0, exact = 0, missed = 0, extra = 0;
const lat: number[] = [];
for (const { trial, hyps, afterPause } of results) {
  const shown = hyps.filter((h) => h.decision === 'shown');
  for (const h of hyps) { const st = h.stages ?? {}; if (h.decision === 'shown') lat.push((st.endpoint_wait ?? 0) + (st.upload ?? 0) + h.recognitionMs); }
  if (trial.kind === 'sentence') {
    // the user mouthed one sentence: score the concatenation of everything shown in the window (a split utterance
    // still counts its words; nothing shown = missed)
    const hyp = shown.map((h) => h.rawText).join(' ');
    const [e, n] = wer(trial.ref!, hyp);
    E += e; N += n; exact += e === 0 && shown.length === 1 ? 1 : 0; missed += shown.length ? 0 : 1; extra += Math.max(0, shown.length - 1);
    console.log(`SENTENCE  REF ${JSON.stringify(norm(trial.ref!))}\n          HYP ${shown.length ? shown.map((h) => JSON.stringify(h.rawText)).join(' + ') : '(nothing shown)'}  WER ${e}/${n}${shown.length > 1 ? `  (split into ${shown.length} windows)` : ''}`);
  } else if (trial.kind === 'rest') {
    console.log(`REST      ${trial.instruction}\n          false triggers shown: ${shown.length}${shown.length ? ' → ' + shown.map((h) => JSON.stringify(h.rawText)).join(', ') : ''}; abstained windows: ${hyps.length - shown.length}`);
  } else if (trial.kind === 'repeat') {
    console.log(`REPEAT×3  REF ${JSON.stringify(norm(trial.ref!))}\n          windows shown ${shown.length}/3: ${shown.map((h) => `${JSON.stringify(h.rawText)} (WER ${wer(trial.ref!, h.rawText).join('/')})`).join(', ') || '-'}`);
  } else if (trial.kind === 'phrase') {
    const pm = shown.map((h) => h.phraseMatch).filter((p) => p?.accepted);
    console.log(`PHRASE    REF ${JSON.stringify(norm(trial.ref!))}  windows ${hyps.length}  accepted ${pm.map((p) => JSON.stringify(p!.phrase)).join(', ') || '-'}  raw ${shown.map((h) => JSON.stringify(h.rawText)).join(' + ') || '-'}`);
  } else {
    console.log(`PAUSE     shown after the pause request: ${afterPause} (must be 0); state after resume: ${statusLog.at(-1)?.state}`);
  }
}
const phraseTrials = results.filter((r) => r.trial.kind === 'phrase');
if (phraseTrials.length) {
  let ok = 0, wrong = 0, none = 0;
  for (const r of phraseTrials) {
    const acc = r.hyps.filter((h) => h.decision === 'shown' && h.phraseMatch?.accepted).map((h) => norm(h.phraseMatch!.phrase));
    if (!acc.length) none++; else if (acc.every((p) => p === norm(r.trial.ref!))) ok++; else wrong++;
  }
  console.log(`\nPhrase mode (${phraseTrials[0]!.hyps[0]?.phraseMatch?.rule ?? 'rule ?'}): accepted correctly ${ok}/${phraseTrials.length}, WRONG accepts ${wrong}, not accepted ${none}`);
}
const restFalse = results.filter((r) => r.trial.kind === 'rest').reduce((a, r) => a + r.hyps.filter((h) => h.decision === 'shown').length, 0);
const restPhrase = results.filter((r) => r.trial.kind === 'rest').reduce((a, r) => a + r.hyps.filter((h) => h.decision === 'shown' && h.phraseMatch?.accepted).length, 0);
console.log(`\nSentences: WER ${E}/${N} = ${(E / Math.max(N, 1)).toFixed(3)}; exact ${exact}/${SENTENCES.length}; missed ${missed}; split/extra windows ${extra}`);
console.log(`No-articulation trials: raw text shown ${restFalse}; phrase ACCEPTED ${restPhrase}`);
console.log(`End of articulation (browser motion endpoint) → text shown: p50 ${pct(lat, 0.5)} ms, p95 ${pct(lat, 0.95)} ms, n ${lat.length}` +
  ` (= browser endpoint wait + upload + recognition; excludes the browser's own frame timing jitter)`);
console.log('This is the LIVE result. Offline whole-clip results are reported separately and are not comparable one-to-one.');
const out = join(dirname(fileURLToPath(import.meta.url)), '../../recognition/data/live');
mkdirSync(out, { recursive: true });
const file = join(out, `${new Date().toISOString().replace(/[:.]/g, '-')}-livetest.jsonl`);
writeFileSync(file, results.map((r) => JSON.stringify({ set: PHRASE_RUN ? 'phrases' : SET, kind: r.trial.kind, ref: r.trial.ref, windowMs: r.trial.windowMs ?? WINDOW_MS, startedMs: r.startedMs, atMs: r.atMs, hyps: r.hyps.map((h) => ({ rawText: h.rawText, decision: h.decision, reason: h.reason, recognitionMs: h.recognitionMs, stages: h.stages, gate: h.gate, phraseMatch: h.phraseMatch ?? null })), afterPause: r.afterPause })).join('\n') + '\n', { mode: 0o600 });
console.log(`log (text + timings only, private): ${file}`);
process.exit(0);
