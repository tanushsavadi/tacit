# AirPods silent-speech feasibility (2026-11-14) — result: NO-GO for word recognition

Hardware: user's AirPods Pro (USB-C, product 0x2024) on macOS 27.0.1, public `CMHeadphoneMotionManager` only.
One participant. Raw data: `airpods/data/` (git-ignored). Held-out report: `airpods/data/gate2-heldout-report.txt`.
Method: port of Subvox (MIT, Joe Blau) — per-frame accel/rotation/attitude features, DTW 1-NN, permutation tests.

## Access (what the public API gives)
- Processed head motion only: user acceleration, rotation rate, attitude, gravity; one bud (`R`) reported.
  Nominal 50 Hz (dt 20 ms); Bluetooth gaps >100 ms cost 3–5% of recording time (39/70 word trials had ≥1 gap).
  Correction (2026-11-14): w1/w2 streamed from the LEFT bud (an earlier note said "always R"; only g1 was R).
- Not available: speech-detecting accelerometer, inward/ANC mic, raw IMU. macOS mic = outward HFP stream (no
  ultrasonic band) → ReHEarSSE/EarCommand-style active acoustic sensing is not possible on this hardware. Not attempted.
- Permission: a CLI child of a terminal is never prompted (TCC attributes to the terminal); fixed by bundling
  `TacitAirPods.app` launched via LaunchServices (`airpods/tools/build-app.sh`, `check.sh`).

## Gate 1 — deliberate jaw opening (session jaw-g1): detectable
- Jaw-epoch SNR vs still: rotation x 16×, z 11×; energy ×7.5, AUC 1.00 (10 epochs). Jaw vs nod separable by axis
  (rotation energy share z 67% vs x 92%); LOO 100%, n=16. Caveat: 4.3° pitch during jaw opening — one IMU cannot
  separate head motion from bud rotation in the ear canal.

## Gate 2 — five silently mouthed words (yes, no, hello, water, help), w1 → w2 after re-seating
Protocol: all selection on w1 only (15 strategy×feature configs by LOO; abstention margin by utility
correct − 2·incorrect), frozen config hashed to w1, evaluated once on w2. 10 reps/word + 10 neutral + 10 controls.
- w1 LOO (best of 15, optimistic): 36% (cue window, rotation). Abstention threshold chosen on w1: 0.16 — on w1 no
  threshold produced any net-positive accepts, so the selected operating point abstains.
- **w2 held-out, with abstention:** 0/50 words accepted correctly; 45 abstained, 5 rejected as none; 0 incorrect
  accepts; 0/10 neutral and 0/10 controls accepted as words. Safe but useless.
- **w2 forced choice (no abstention):** 34% (17/50; chance 20%, binomial p=0.014). Per word: yes 2, no 0, hello 7,
  water 2, help 6 /10; 25/50 predictions were "hello" (bias).
- Baselines on w2 (trained on w1): duration 24%, motion energy 14%, duration+energy 20%, **rhythm (energy envelope)
  34%**, head excursion 16%. The selected model does not beat the rhythm-only baseline → no evidence of
  articulation-specific patterns beyond timing. (Untuned post-hoc diagnostics reached 40–46%; not unbiased, not claimed.)
- Movement detection (word vs neutral, threshold from w1): 49/50 words detected, but 4/10 neutral false alarms.
- Mouthed words move the sensor far less than deliberate jaw opening (rotation RMS 0.03–0.05 vs neutral 0.013 rad/s).
  Proxy for natural articulation: forced-choice accuracy by w2 motion-energy tercile low 1/16, mid 5/17, high 11/17
  — what signal exists comes from the most exaggerated trials; natural articulation was not recorded (expect ~chance).
- Compute: DTW vs 70 templates 2.4 ms median per trial; the 2.5 s capture window dominates latency.
- Dropouts: accuracy with gap 9/28 vs without 8/22 — no measurable effect at this n.

## Conclusion
NO-GO for AirPods word recognition as a Mode 2 input (and a fortiori for open-vocabulary transcription). Possible
narrow reuse (unbuilt, unvalidated): a coarse "user is articulating" activity cue alongside the webcam. Not integrated
into TACIT; no frontend/protocol change. Reproduce: `npm run airpods:gate2 -- select <w1>` then `evaluate <w1> <w2>`.

## Follow-up: deliberate articulation, w3 → w4 (pre-registered) — RESULT: NO-GO
Frozen config `docs/research/preregistration/airpods-w3-w4-config.json`, pushed in commit 43b1913 at 09:01:19Z;
w4 recording started 09:08:09Z (after the freeze). Full output: `docs/research/preregistration/airpods-w4-heldout-report.txt`.
- Data: w3 84 trials (12/class), 47.9 Hz, gaps 4.9% of time, **left** bud. w4 70 trials (10/class), 48.3 Hz, gaps 4.1%,
  **right** bud. Median word rotation RMS: w1 0.034, w3 0.087, w4 0.058 rad/s (neutral 0.013 / 0.022 / 0.009).
- w3 LOO (selection only, optimistic): primary ROCKET/cue/attitude 73%; baselines rhythm 43–55%, duration 27%.
- **w4 held-out, primary forced choice: 13/50 = 26%** (chance 20%, binomial p=0.19). Per word: yes 4, no 1, hello 0,
  water 8, help 0 /10; 31/50 predictions were "water" or "yes".
- Baselines on w4: **rhythm-ROCKET 42%** (strongest), rhythm-DTW 26%, duration 22%, timing bundle 20%, energy 16%.
  Primary vs rhythm-ROCKET: McNemar p=0.096 in the baseline's favour (5 vs 13 discordant). Secondary DTW/cue/rot 20%.
- Frozen threshold: 1/50 words accepted (correct), 24 abstained, 25 rejected as none; control false accepts 2/20
  (small nod 1/3, smile 1/2; swallow 0/3, still 0/10, look-away 0/2).
- Pre-registered decision: statistical FAIL, practical FAIL → **NO-GO**.
- Demonstrated: deliberate articulation produces ~2.5× (w3) / ~1.7× (w4) more motion than w1, and high within-session
  separability (w3 LOO 70–73%). It did **not** generalize across sessions with the frozen models.
- Hypotheses (NOT tested; would require new data, not w4 reuse): (1) the left→right bud switch mirrors/rotates the
  sensor frame, breaking axis-dependent features while the axis-free rhythm baseline survived (42%); (2) articulation
  was weaker in w4; (3) the 73% within-session figure is inflated by session-specific posture. A follow-up would need a
  fixed bud (or explicit frame normalisation) declared before collecting two NEW sessions.

## Earbud-source diagnosis after the w4 NO-GO (diagnostic; the pre-registered NO-GO stands unchanged)
- **Frame conventions (all 7 sessions, both buds):** still-trial gravity ≈ (0.0–0.2, −0.1–−0.3, −0.96–−1.0) → z vertical;
  nod rotation axis ≈ +x (ear-to-ear) with 90–99% of nod rotation energy; a nod's first move is −rx and look-left is +rz
  in every session; corr(rx, d pitch/dt) +0.53…+0.96. → macOS reports both buds in a **common head-aligned frame**; no
  axis mirroring, so naive axis negation would be wrong for head motion. Residual: R-bud nod axis tilted ~11° (y ≈ +0.2).
- **Articulation motion is mirror-symmetric between buds.** Correlation of per-word class-mean rotation-rate waveforms
  (rx, ry, rz): same-bud pairs positive (R→R 0.63/0.38/0.77; L→L 0.37/0.18/0.28 and 0.10/0.21/0.37); every L→R pair has
  **negative ry/rz** (w3→w4 0.58/−0.32/−0.42; w1→w4 0.09/−0.02/−0.39; w3→oldR 0.53/−0.37/−0.53), turning positive under
  the sagittal reflection (ωx, ωy, ωz) → (ωx, −ωy, −ωz). Physically plausible: jaw/ear-canal deformation moves each bud
  mirror-wise while whole-head motion is common-mode. → the L→R switch is a real domain shift for articulation features.
- **Exploratory same-bud cross-session checks (NOT pre-registered; pair chosen after seeing w4; re-seating between the
  07:54 and 08:01 sessions unknown):** same pipeline as the w3→w4 preregistration.
  R→R (07:54 → 08:01, default style): primary 35/50 = 70%, strongest baseline rhythm-ROCKET 42%, McNemar p=0.004;
  frozen-rule threshold accepted 13/50 (9 correct, 69% precision), 0/20 control false accepts.
  L→L (w1 → w2, subtle style): 26/50 = 52%; rhythm-ROCKET 44%; not ≥15 points above baselines.
  These motivate, but do not establish, the hypothesis that a fixed earbud restores cross-session word information.
- **Engineering response (committed):** recorder `--require-bud L|R` (preflight abort if another bud streams; mid-session
  abort + invalid flag on any wrong-bud sample) and `--protocol budcheck` (15 s source log); held-out script stores the
  training bud in new preregistrations and refuses cross-bud evaluation; `--exploratory` runs are labelled and use a
  separate `--config`. The frozen w3→w4 evaluation reproduces identically with the updated script.
- Alternative (not adopted): canonicalise R-bud data by the sagittal reflection. Rejected for the final experiment
  because it flips genuine head yaw/roll; controlling the source is cleaner.

## Proposed final AirPods-only experiment (w5 → w6, LEFT bud only) — awaiting the budcheck result
0. Source check (≈1 min): only the LEFT AirPod in the ear, right one in the case:
   `npm run airpods:record -- --protocol budcheck --name b1 --require-bud L` → must report L only. If macOS will not
   stream reliably from L, stop: the experiment cannot be controlled.
1. w5 (training/selection, 12 reps, deliberate): `--protocol words --name w5 --reps 12 --style deliberate --require-bud L`
2. `npm run airpods:heldout -- prereg <w5> --config ../airpods/data/heldout-w5-config.json` (stores bud=L) → commit/push.
3. Remove and re-seat the left AirPod; w6 (held-out, 10 reps): same flags with `--name w6`.
4. `evaluate <w5> <w6> --config …w5-config.json` once. Same candidates, threshold rule and GO criteria as w3→w4.
Even a GO is a five-word, single-user, closed-set result; larger vocabulary and continuous articulation are separate tests.

## Exploratory re-analysis of existing sessions (2026-11-14) — NOT pre-registered; w3→w4 NO-GO unchanged
Script: `airpods/analysis/explore_existing.py` (fixed design declared in its docstring; every cell reported; raw output
`airpods/data/explore_existing_results.json`). LIMU-BERT (MIT) fetched to `third_party/limu_bert` (git-ignored):
`gh api repos/dapowan/LIMU-BERT-Public/tarball | tar xz --strip-components=1 -C third_party/limu_bert`.
Six sessions (w1L, w2L subtle; oR1, oR2 R default; w3L, w4R deliberate; 310 word trials), 5 normalisations × 4 models
+ 3 baselines, protocols P1 (all 30 single-session train→test pairs), P2 (leave-one-session-out), P3 (unseen word).
- **Mirror normalisation (R→L sagittal reflection) fixes the cross-bud collapse:** ROCKET P1 cross-bud 23% → 38% while
  same-bud stays 41–42%. Posture alignment and session z-scoring alone do not.
- **Pooling sessions helps; mirrored ROCKET beats rhythm:** P2 LOSO over 310 trials: ROCKET+mirror 48.4% vs strongest
  rhythm baseline 37.1% (exact McNemar 78 vs 43 discordant, p=0.0019) and vs raw ROCKET 39.0% (p=0.0055). Per session
  30–60%; subtle sessions w1L/w2L 30%/40%, default/deliberate 48–60%. Caveats: ~20 model×norm cells were examined
  (Bonferroni 0.0025 is only just met); the mirror form came from a diagnostic that included w4 data (no tuned
  parameters, but not independent of it).
- **Pretrained LIMU-BERT (phone/watch HAR) does not transfer:** 18–29% everywhere (≈ chance).
- **Low-capacity binned means + ridge:** 28–40% LOSO, below ROCKET.
- **No evidence of a reusable sub-word articulation representation:** P3 1-shot enrolment of a word never seen in
  training: ROCKET 27–31%, binned 23–29%, LIMU 20–21%, rhythm 20–26% (chance 20%); the learned 4-word projection did not
  beat no projection. Recognition so far rests on whole-word signatures.
- MuteIt / Unvoiced: abstracts could not be retrieved (Semantic Scholar rate limit; not on arXiv) — not characterised here.
Interpretation: stock-AirPods motion carries some word-specific information beyond rhythm once the bud mirror and
session pooling are handled (≈48% on 5 words, single user), far below a usable or open-vocabulary level, and with no sign
yet of transfer to unseen words.

## Technical feasibility decision (2026-11-14, after the exploratory re-analysis)
- **Channels with demonstrated word-dependent information:** only the fused head-motion stream (rotation rate +
  user acceleration). Exploratory, pooled, bud-mirrored: 48% on 5 words vs 37% rhythm (single user). Attitude-only
  models did not survive the bud switch. Outward mic: untested for silent articulation (no m1 session); no inward mic,
  voice accelerometer or simultaneous L+R stream is exposed on macOS.
- **Phoneme/viseme-level learning: not feasible with current data.** ~360 labelled word trials over 5 words give no
  phonetic coverage; unseen-word transfer was at chance (P3). A ~50 Hz processed head-motion stream sees jaw opening and
  rhythm, not tongue/lip place of articulation, so many visemes are physically indistinguishable in this channel.
- **MuteIt / Unvoiced (ear-worn jaw-motion work):** papers not retrievable here (rate limit), so not characterised.
  General sensing assumptions such systems typically rely on and that fail on stock AirPods: raw, higher-rate IMU access;
  a sensor placed near the jaw/temporomandibular joint; dual-sided simultaneous sensing; access to on-device voice
  accelerometer or in-ear mics. All four are unavailable via public macOS APIs.
- **Cross-modal teacher/student (VSR teacher → AirPods student): technically possible, not yet credible as a next step.**
  The pieces exist (record_sync.py + sync_check.py; Auto-AVSR gives per-frame encoder features and text). But the student
  input is ~48 Hz fused motion; distilling viseme-level targets needs hours of synchronized speech, and the channel likely
  lacks the information (P3). Worth it only after a cheap capacity test shows the motion stream predicts teacher features
  above a rhythm-only control on held-out data.
- **Reusable published code:** Subvox (MIT, in use), ROCKET (reimplemented), LIMU-BERT (MIT; pretrained HAR encoder did not
  transfer, ≈ chance), Auto-AVSR/Chaplin (research licence weights; working as teacher/benchmark).
- **What would need new paired data:** any distillation or viseme study (synchronized webcam + AirPods, many sentences);
  any confirmation of the mirrored-pooling result (one fresh held-out session).
- **Most valuable no-recording task:** the Live Silent Speech backend (done: tacit-live-v1 + local Auto-AVSR service), so
  the frontend, segmentation and reliability-gate work can proceed; AirPods remains a research track.
