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

## Follow-up (reopened 2026-11-14): deliberate articulation, w3 → w4 — pending data
Pre-registered in `server/scripts/airpods-heldout.ts` (criteria stored in `airpods/data/heldout-w3-config.json` at
freeze time): GO = primary forced-choice p<0.05 vs 20%, ≥15 points above every baseline, McNemar p<0.05 vs strongest
baseline, AND accepted precision ≥80% at ≥30% coverage with ≤2/20 control false accepts. Results will be appended here.

## Hardware / API inventory (2026-11-14, macOS 27.0 SDK headers on this Mac + recorded data)
| Signal | In AirPods Pro 2 | Public macOS API | In our recorder | Useful for silent articulation |
|---|---|---|---|---|
| Fused head motion: user accel, rotation rate, attitude (quaternion/Euler), gravity | yes (IMU) | `CMHeadphoneMotionManager` (macOS 14+) | yes, all fields, ~50 Hz, 3–5% BT gaps | jaw opening: yes (SNR 11–16×); word identity: not beyond rhythm (w1→w2) |
| Which bud supplies motion | yes | `CMDeviceMotion.sensorLocation` (Default/Left/Right) | yes (`loc`; always R so far) | one stream at a time; no API for simultaneous L+R |
| Magnetometer / heading on headphones | unknown | `magneticField` exists on CMDeviceMotion, accuracy uncalibrated for headphones | recorded? no | not tested |
| Headphone activity (walking/running…) | yes | `CMHeadphoneActivityManager` (macOS 15+) | no | no (coarse activity classes) |
| Speech-detecting (voice) accelerometer | yes (Apple marketing) | **none** — no symbol in CoreMotion/AVFAudio/AVFoundation/CoreAudio/AudioToolbox headers | no | not accessible |
| Inward-facing (ANC/feedback) mic | yes | **none** | no | not accessible → ReHEarSSE/EarCommand/EarSSR-style in-ear acoustic sensing impossible |
| Outward beamformed mic | yes | CoreAudio input device (Bluetooth HFP, processed) | `--protocol mic` (Gate 3) | not yet measured (needs session m1) |
| "AirPods high-quality recording" | yes | `AVAudioSessionCategoryOptionBluetoothHighQualityRecording` / `AVCaptureSession.configures…HighQualityRecording`: **iOS 26 only, API_UNAVAILABLE(macos)** | n/a | n/a on Mac |
Code availability (GitHub search by name, 2026-11-14): no public repos for EarCommand, EarSSR or ReHEarSSE;
OpenEarable firmware is MIT but targets different hardware. Subvox (MIT) and ROCKET (paper; reimplemented, sktime BSD
reference) are the reusable pieces already in use.
