# AirPods silent-speech feasibility (2026-11-14) — result: NO-GO for word recognition

Hardware: user's AirPods Pro (USB-C, product 0x2024) on macOS 27.0.1, public `CMHeadphoneMotionManager` only.
One participant. Raw data: `airpods/data/` (git-ignored). Held-out report: `airpods/data/gate2-heldout-report.txt`.
Method: port of Subvox (MIT, Joe Blau) — per-frame accel/rotation/attitude features, DTW 1-NN, permutation tests.

## Access (what the public API gives)
- Processed head motion only: user acceleration, rotation rate, attitude, gravity; one bud (`R`) reported.
  Nominal 50 Hz (dt 20 ms); Bluetooth gaps >100 ms cost 3–5% of recording time (39/70 word trials had ≥1 gap).
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
