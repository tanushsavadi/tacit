# TACIT personal adaptation V2 (`silent2_251`): pre-registration

**Written 2026-11-15 12:38–12:50 UTC, before any V2 training or V2 evaluation.** Author: Claude (recognition owner).
Requested by the user on 2026-11-15 ~11:13 UTC, which lifts the 00:48 UTC ML freeze for this one bounded experiment.
This document fixes the data, the recipe, the candidates, the metrics and the decision rules. Any later change is
appended as a dated amendment with its reason. Nothing above the amendments section is edited after training starts.

## 1. Data inventory (verified on disk, not taken from documentation)
| Set | Sessions (`recognition/data/webcam/`, git-ignored) | Clips used | Unique sentences | Role |
|---|---|---|---|---|
| v1 training | `…232916Z-adaptA` (50), `…234421Z-adaptB` (51 − 8 excluded), `…000100Z-adaptBretake` (8) | 101 | 101 = `adapt_v1.txt` | train (as silent1) |
| V2 set C | `…113516Z-adaptC` (50 − 9), `…115544Z-adaptCretake` (9 − 1), `…122336Z-adaptCDretake` (1 of 4) | 50 | 50 = `adapt_v2_c.txt` | train |
| V2 set D | `…115728Z-adaptD` (50 − 3), `…122336Z-adaptCDretake` (3 of 4) | 50 | 50 = `adapt_v2_d.txt` | train |
| V2 set E (demo domain) | `…122758Z-adaptE` (50 − 2), `adaptEretake` (2, pending) | 50 | 50 = `adapt_v2_e.txt` | train |
| Validation | `…000409Z-adaptVal` | 20 silent + 3 non-speech | 20 = `adapt_val_v1.txt` | epoch selection and development comparison |
| Final held-out | none recorded (`…215105Z-heldout1` is empty) | 0 | 60 = `heldout_v2.txt` | ONE final test (Section 8) |
| Regression | CREMA-D 96 clips (`eval/cremad_manifest.json`); dev sets s1/bright-test/diag1; rest probe | — | — | generalisation and safety guards |

Excluded takes, with the original files preserved: adaptB clip21/24/25/29/30/34/35/46 (smiles, earlier audit);
adaptC clip04/16/17/18/21/25/30 (grin) and 22/35 (sentence cut off at the end of the clip); adaptCretake clip08 (grin);
adaptD clip36/44 (grin) and 50 (finishes less than 0.1 s before the end of the clip, excluded as a precaution); adaptE clip03 (grin) and 05 (late
start, finishes about 0.2 s before the end, grin-like spreads, precaution). Audit method: identical scripts for every session
(`recognition/data/eval/audit_v2/`, git-ignored). Checks: decode, resolution, frames, fps, dropped-frame gaps, audio
streams, FaceMesh coverage, ROI brightness, inter-ocular distance, light asymmetry, roll, articulation span. Smile
screen: lip width ≥ 25 % over rest for ≥ 6 frames; on adaptB it matches 5/8 historical exclusions and 2/43 kept takes.
Every take the screen flags is then checked visually on a frame strip.

Recording quality (median): ROI brightness A 150, B 153, C accepted 140, D 151, E 139; IOD 142/156/145/151/143 px;
FaceMesh 100 % everywhere; 0 audio streams; all clips 1280x720, 6.01 s, 179–180 frames.

## 2. New clips
150 new unique silent training sentences (C 50 + D 50 + E 50). They come from 165 recorded V2 clips: 50 + 9 + 4 + 50 + 50 +
2 (pending), minus 15 excluded takes.

## 3. Total training corpus and separation
- **Training: 251 clips = 251 unique sentences** (101 v1 + 150 V2), one clip per sentence, no duplicate labels.
  Dry-run 12:37 UTC with adaptEretake still pending: 249 clips, 249 unique, hygiene passed. The final dry-run must
  report 251.
- Train ∩ adapt_val_v1 = ∅; train ∩ heldout_v2 = ∅; adapt_val_v1 ∩ heldout_v2 = ∅. The trainer enforces this and
  refuses to run otherwise.
- Prompt-level leakage control for V2: `eval.dataset prompts-check` (exact, normalised) against every prompt file and
  every recorded sentence. A near-duplicate scan (content-word Jaccard and shared 3/4-grams) was added: all
  neighbours of heldout_v2 or adapt_val_v1 sentences were rewritten before recording. Final scan: no V2 sentence has a
  near-duplicate in any evaluation set.
- Disclosed: to run that scan, the agent read heldout_v2 *prompt text*. No heldout_v2 clip exists, so no decoder output
  for it has been seen. The user has not rehearsed it.
- **Set E is demo-domain** (self-introduction with the user's name, product explanation, call phrases), recorded at the
  user's request. Recognising these phrases later is **training-set performance**. It is never evidence of
  generalisation, and no metric in this document is computed on them.

## 4. Model and fine-tuning scope (unchanged from silent1)
Base: Auto-AVSR `LRS3_V_WER19.1`, `model.pth` sha256 `e740cef369abeabd0ba2c18e37a0661342e1d94d432d6caa77755a11821d8fe3`,
read-only, re-hashed by the trainer before and after training. Production preprocessing (decode → FaceMesh → mean-face
warp → 96×96 grey ROI). Scope `frontend+embed+block0` (25.8 M of 250.4 M parameters). All other Conformer blocks, the
CTC head and the decoder are frozen. BatchNorm statistics are frozen. Output: an isolated overlay `data/adapt/silent2_251/`.

## 5. Frozen hyperparameters (identical to silent1's run.json)
AdamW lr 1e-4, weight decay 1e-4, batch 1, gradient clip 5.0, loss = 0.1·CTC + 0.9·label-smoothed attention per token.
Augmentation: random 88 crop, flip p = 0.5, gain 0.85–1.15, bias ±0.06, 2 time masks ≤ 10 frames. Up to 6 epochs,
patience 2, seed 0, device MPS. Validation runs after every epoch with the production decoder. Epoch 0 = base. The
overlay with the fewest validation word errors is kept (tie: higher reference log-prob). No overlay is written if no
epoch beats the base. There is no hyperparameter search: the command is fixed (Section 13).

## 6. Candidates (no others will be evaluated)
- **A** base (no overlay). **B** `silent1` (overlay sha `aa2d8de5…`). **C** `silent1_w50` (sha `cda5dabf…`).
  These are references only, re-benched for paired, same-session numbers.
- **D** `silent2_251`: the primary arm, the default recipe on 251 sentences.
- **D50** `silent2_251_w50`: conditional fallback, defined now. Weight-space interpolation of D toward the base at
  alpha 0.5 (`adapt.interpolate`, no training, one fixed alpha, no search). It is built and evaluated **only if** D meets
  every validation condition in Section 9 except the CREMA-D guard. If D50 is built, the selection rule is: D50 replaces D
  only if D50 passes ALL conditions. If both pass, D is preferred.
- Not run, with reasons: multi-speaker replay (no independently licensed multi-speaker video on disk; CREMA-D is the
  frozen guard and must not be trained on); synthetic lip-sync footage (excluded by the user); voiced data (none recorded).

## 7. Metrics (all from `eval.bench`, gate included, unless stated)
Unit of analysis: the clip (one sentence), compared paired across candidates.
- **Primary:** adaptVal silent word errors / 114 words (WER).
- **Gate metrics:** clips better / worse than base (per-clip word errors); CREMA-D word errors / 536; adaptVal non-speech
  clips shown (raw and after the evidence floor); rest probe clips shown (dev 36 + val 13, raw and after floor);
  model latency p50/p95 ms on val.
- **Secondary (reported, not gating):** exact sentences /20; top-1/3/5/10 coverage of the reference among candidates;
  abstentions (+floor); dev silent/voiced WER; selected epoch; training loss and validation errors per epoch (log.jsonl,
  selection data); per-sentence table for A/B/C/D.
- **Uncertainty:** exact two-sided sign test on better/worse clips (ties dropped). Paired bootstrap (10 000 resamples of
  clips, seed 0) 95 % CI for the WER difference D − A, and D − B as descriptive. CREMA-D difference D − A gets the same
  bootstrap CI as supporting detail. The gate itself uses the fixed rule in Section 9.
- **Overfitting signs:** training loss falling while validation errors rise; selected epoch; the train/val gap. Training
  accuracy is never used as evidence of improvement.

## 8. Final held-out evaluation (Phase C): once, and only if Section 9 passes
1. Confirm `heldout_v2` is still unrecorded and unused.
2. Record it once: `record_webcam.py --name heldout1 --modes silent --prompts prompts/heldout_v2.txt --free 0 --nonspeech 2`
   (60 sentences + 6 non-speech controls). Audit it with the same scripts. A defective take may be retaken once, before
   any scoring, judged only by the audit (never by decoder output).
3. `eval.bench --session heldout1 --tag final --variant base`, then the same with `--overlay data/adapt/<selected>`, on
   exactly the same clips.
4. **Adopt only if:** held-out silent WER is ≥ 10 points lower than base; non-speech shown is not higher than base;
   CREMA-D WER is ≤ base + 1 point. The sign test and bootstrap CI over 60 clips are reported as supporting detail.
5. The held-out set is never trained on and never used to choose between candidates. If it fails, it is not re-run with
   a revised model: the result informs future research only.

## 9. Validation gate (Phase-C entry). Unchanged historical E.5 conditions, all must hold
1. adaptVal silent WER ≤ base − 5 points (≤ 78/114 errors, base = 84).
2. More validation clips better than worse vs base.
3. CREMA-D WER ≤ base + 1 point (≤ 38/536 errors, base = 33).
4. adaptVal non-speech shown not higher than base (raw and after floor).
5. Rest probe shown not higher than base (dev and val, after floor).
6. Model latency p95 ≤ base + 300 ms.
7. Run integrity: run.json present, base sha unchanged, selected epoch > 0, no NaN or zero losses, dry-run = 251/20.

The gate is a conjunction (an intersection–union test), so no multiplicity correction applies to it. Comparisons with B
and C are **descriptive**: on 20 clips the earlier runs showed ±7-error epoch-to-epoch noise, so a D vs B difference of
that size is not a finding. Statistical power is stated, not assumed. With 20 clips, a two-sided exact sign test
reaches p < 0.05 only at ≥ 15/20 clips in one direction (ties excluded from n). silent1 reached 15 better / 3 worse.
Validation reuse: adaptVal already chose silent1's epoch and the W50/W75 comparison, and it chooses D's epoch here.
**Every adaptVal number is therefore optimistic development evidence, not an independent test.** Only Section 8
produces independent evidence.

## 10. Non-speech safeguards
Non-speech controls (3 in adaptVal; 6 in the future heldout1) and the resting-face probe are gate conditions (Section 9 items
4–5; Section 8 item 4). Automatic speech stays DISABLED regardless of any result. The reliability gate
(`autoTransmitAllowed:false`) is untouched. Adapted text could only ever reach a call through the user-reviewed Speak
path.

## 11. Success / failure criteria
- **V2 success (research question answered "yes"):** D (or D50 under Section 6) passes every Section 9 condition, where
  silent1 failed on CREMA-D with 101 clips.
- **Adoption success:** Section 8 criteria met on the single held-out run.
- **Failure is reported as failure:** if D improves validation but breaks a guard, the report says so and names the
  failed condition. A more permissive speaker-personalised trade-off (for example accepting a CREMA-D regression for a
  single-user device) may be written up separately as a *proposal*, never as a release decision.

## 12. Deployment decision rules and rollback
- No deployment without (a) Section 8 adoption criteria met and (b) the user's explicit approval after a written
  GO/NO-GO.
- If approved: add a default-off, environment-selected overlay to the recognition sidecar. The base hash is checked and
  logged at startup; the base weights are never modified. Restart `:8790` only when idle (Live off, output off, no
  BlackHole reader). Verify `live:check`, `reviewed:check`, review/correction, Review-First authorisation, Real-time
  still off unless separately chosen.
- **Rollback:** unset the selector and restart the sidecar; the base path is the default. silent1, silent1_w50/w75 and
  front1 are preserved unchanged (hashes re-checked at the end of the run).

## 13. Fixed commands
```
cd recognition
EX="--exclude adaptB/clip21 --exclude adaptB/clip24 --exclude adaptB/clip25 --exclude adaptB/clip29 --exclude adaptB/clip30 \
 --exclude adaptB/clip34 --exclude adaptB/clip35 --exclude adaptB/clip46 --exclude adaptC/clip04 --exclude adaptC/clip16 \
 --exclude adaptC/clip17 --exclude adaptC/clip18 --exclude adaptC/clip21 --exclude adaptC/clip22 --exclude adaptC/clip25 \
 --exclude adaptC/clip30 --exclude adaptC/clip35 --exclude adaptCretake/clip08 --exclude adaptD/clip36 --exclude adaptD/clip44 \
 --exclude adaptD/clip50 --exclude adaptE/clip03 --exclude adaptE/clip05"
TR="--train adaptA --train adaptB --train adaptBretake --train adaptC --train adaptCretake --train adaptCDretake \
 --train adaptD --train adaptE --train adaptEretake"
.venv/bin/python -m adapt.finetune --name silent2_251 $TR --val adaptVal $EX --dry-run     # must print 251 / 20
.venv/bin/python -m adapt.finetune --name silent2_251 $TR --val adaptVal $EX
# Benches: archive the existing data/eval/bench/{base,base+silent1,base+silent1_w50}{,@val}.jsonl first (re-runs overwrite),
# then run A, B, C, D back to back in one session (same MPS conditions for latency):
.venv/bin/python -m eval.bench --session adaptVal --tag val --variant base [--overlay data/adapt/<cand>]
.venv/bin/python -m eval.bench --variant base [--overlay data/adapt/<cand>]          # CREMA-D, dev, rest, non-speech
.venv/bin/python -m eval.bench --compare base@val base+silent2_251@val
```
Run conditions: training and benches only while the TACIT demo is idle (Live off, no session using the sidecar on MPS).
The running server is never restarted for this experiment.

## Amendments
(none yet)

## Results (appended 2026-11-15 13:10 UTC; nothing above was edited after training started)
**Run:** `data/adapt/silent2_251`, git 508ade4 (V2 prompt files and this document uncommitted at run time), MPS,
12:43:54–13:02:49 UTC, 251 train / 20 val, overlay sha `48460d67…`. The trainer re-verified the base sha `e740cef3…`.
All 9 preserved files (base, silent1/w50/w75/front1 overlays + run.json) hash-identical afterwards. Trainer validation
errors/114 by epoch 0–6: 84, 56, 55, 49, 43, 45, **36** (train loss 1.20 → 0.58). Selected epoch 6 = the epoch cap
(still improving; more epochs were NOT tried: not pre-registered).

**Benches** (13:05–13:10 UTC, all four back to back, same MPS session; references reproduce their historical numbers
exactly; logs `data/eval/silent2_251_bench.log`, `data/eval/silent2_251_analysis.txt`):
```
                            A base        B silent1     C silent1_w50  D silent2_251
val errors /114 (WER)       84 (73.7%)    48 (42.1%)    64 (56.1%)     36 (31.6%)
  vs base better/worse      —             15/3 p=.008   11/3 p=.057    15/1 p=.001
  ΔWER vs base, 95% CI      —             [-47.5,-14.3] [-31.3,-4.5]   [-57.0,-27.3] pt
  exact /20                 0             4             1              4
  top-1/3/5/10              0/1/1/2       4/5/6/6       1/2/4/6        4/6/7/8
  abstained (+floor)        0 (+0)        0 (+0)        0 (+0)         0 (+0)
val non-speech shown        2/3 (fl 2)    2/3 (fl 1)    2/3 (fl 2)     2/3 (fl 1)
rest shown dev /36 (floor)  4 (0)         4 (1)         4 (0)          4 (1)
rest shown val /13 (floor)  4 (0)         4 (1)         4 (1)          4 (2)
CREMA-D errors /536         33 (6.2%)     54 (10.1%)    38 (7.1%)      61 (11.4%)
  vs base better/worse      —             0/13          1/7            0/19
  ΔWER vs base, 95% CI      —             [+1.8,+6.4]   [-0.2,+2.1]    [+2.9,+7.9] pt
  CREMA-D exact /96         79            67            75             61
dev silent / voiced WER     .444/.377     .404/.215     .404/.277      .364/.231
val model ms p50/p95        270/359       260/329       268/335        269/326
```
Descriptive D vs B (silent1): val better/worse 8/3 (sign p = 0.23), ΔWER CI [−24.3, +1.8] pt. Not a reliable
difference on 20 reused clips. CREMA-D D vs B 3 better / 9 worse, CI [−0.4, +3.0] pt.

**Gate (Section 9) for D:** 1 val ≤ 78 errors: PASS (36). 2 better > worse: PASS (15/1). **3 CREMA-D ≤ 38: FAIL
(61, +5.2 pt).** 4 non-speech not higher: PASS (2/3 raw both; floor 1 vs 2). **5 rest not higher after floor: FAIL
(dev 1 vs 0; val 2 vs 0).** 6 latency p95: PASS (326 vs 359 ms). 7 integrity: PASS.
**D50 not built:** Section 6 allows it only if CREMA-D is the *sole* failure; D also fails item 5.
**Phase C not run:** heldout_v2 remains unrecorded and unscored.

**Conclusion:** NO-GO for adoption. Research answer: with this recipe, 2.5× more of the user's own data improved
personal validation further (development evidence: 84 → 36 errors, vs silent1's 48), but it did **not** remove the
generalisation failure. It worsened it (CREMA-D +5.2 pt vs silent1's +3.9 pt; 0 of 96 CREMA-D clips improved, 19
worsened) and added resting-face displays after the floor. Training ran ~3.7× more optimiser steps (251 × 6 vs 101 × 4),
which plausibly explains the extra drift. That is a hypothesis, not tested here. Set E (demo phrases) is in training, so
any demo-time accuracy on those phrases would be training-set performance.

**Not a release decision: proposals for a future, separately pre-registered experiment.** (a) Regularised fine-tuning
toward the base weights (L2-SP / EWC) or a pre-registered interpolation curve for D, with a FRESH validation set
(adaptVal is now heavily reused). (b) Replay with an independently licensed multi-speaker video corpus (never CREMA-D).
(c) A single-user trade-off policy that weights own-voice accuracy and non-speech/rest safety over CREMA-D, decided by
the user BEFORE seeing new results, still requiring the one-time held-out test.

## Addendum (2026-11-15 ~17:00–18:00 UTC): local experimental demo profile — NOT a change to the verdict

The general-release verdict above stays **NO-GO**. The user then explicitly authorised a *local, single-speaker,
manually selected* demo use of `silent2_251` under mandatory Review First (never real-time, never automatic speech),
using existing data only (no new recording, no training, `heldout_v2` untouched).

**Implementation.** `tacit_vsr/profiles.py` (default `base`; `personal-demo` = silent2_251 overlay after pinned
SHA-256 checks of base, overlay.pt, run.json; any failure → base + reported error). The server refuses real-time and
automatic speech for any result tagged `reviewRequired` (per health probe AND per result). Switch/verify/rollback:
`./scripts/tacit.sh profile personal-demo | base | status`.

**Existing-data comparison through the live service path** (POST /recognize, gates + evidence floor; reproduces the
bench exactly on adaptVal):

| Data | Role | Base word errors | personal-demo | better/worse |
|---|---|---|---|---|
| Session E, 50 demo phrases (52 clips) | **TRAINING** — memorisation only | 163/300, exact 8 | 33/300, exact 37 | 41/2 |
| adaptVal (20 sentences) | development (reused for selection → optimistic) | 84/114, exact 0 | 36/114, exact 4 | 15/1 |
| s1 sessions (33 clips, silent + voiced) | development, never trained on | 81/158, exact 9 | 54/158, exact 15 | 16/7 |
| bright-test (13) | development | 6/61 | 6/61 | 2/1 |
| diag1 (10, silent + voiced) | development | 23/60, exact 3 | 20/60, exact 1 | 3/3 |
| CREMA-D (96, other speakers) | guard (bench, above) | 33/536 | 61/536 | 0/19 |

Controls (display-only noise; nothing can be spoken without Speak): rest windows shown after the evidence floor —
dev 0→1/36, val 0→2/13, Session E + diag1 3→3/39 (bench `@demoE`); adaptVal non-speech (whole clip) 2→1/3; native
pipeline replay with endpointing: swallow and smile never form a window, "listen" shows one short word in both
("UM" base, "AH" personal). Native replay (`TacitCompanion --analyze-video --send`, the camera code path) of the 10
ranked phrases: personal 10/10 correct words (one "I AM" for "I'M"), base 9/10 ("…ENJOYED THE LIMBO").

**Fresh-take acceptance criteria (`data/eval/demo_profile/CRITERIA.md`): UNVERIFIED** — the user could not record the
`demoCheck` session. Every demo phrase was in training, so per-phrase accuracy above is training performance.

**Phrase ranking rule (existing evidence).** Tier 1 = personal exact AND base exact on its single Session E take (the
base never saw that clip, so this is the only untrained evidence that the phrase is readable on this face); tier 2 =
personal exact and the base has it in its top-5 or within one word. Phrases containing the user's name, "TACIT" or
"HackUMass" failed even as training clips and are excluded.
