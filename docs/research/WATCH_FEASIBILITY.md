# Apple Watch Series 11 as a TACIT sensor — value test (2026-11-14)

Question: does adding the Watch meaningfully improve camera-free silent-speech recognition over AirPods alone?
Status: **INCONCLUSIVE — one on-device measurement decides; no device data yet** (deployment needs user steps below).

## Published evidence (abstracts via Semantic Scholar; ACM full texts returned 403 — details beyond abstracts UNVERIFIED)
- **Lipwatch** (IMWUT 2024, doi 10.1145/3659614): *active* acoustic sensing — the watch speaker emits inaudible waves
  and the mic records lip echoes; IMU gesture + acoustic lip-movement check replaces a wake word. 80 common smartwatch
  commands, 15 users, WER 13.7% user-independent; 88.7% top-3 for commands with unseen words; real-time on "a commercial
  smartwatch" (model/OS not in abstract). No public code found (GitHub search). Closed command set, watch raised to mouth.
- **WatchHand** (CHI 2026, doi 10.1145/3772318.3790932, arXiv 2602.21610): hand-pose tracking, not speech. Dataset repo
  (no licence, no ML code) says Samsung Galaxy Watch 7, Xiaomi Watch 2 Pro, Pixel Watch 3 (WearOS), 18–21 kHz C-FMCW,
  48 kHz/16-bit capture. No Apple Watch.
- **EchoSpeech** (CHI 2023): eyewear speakers/mics, 31 commands + connected digits. Not a watch.
→ Every working watch acoustic system found is WearOS with 48 kHz capture; nothing establishes Apple Watch capability.

## watchOS 27 SDK (Xcode 27.1 headers on this Mac)
| Need | API | Status |
|---|---|---|
| Mic PCM buffers | AVAudioEngine / AVAudioInputNode (watchOS 4+) | available |
| Simultaneous play + record | AVAudioSession `.playAndRecord` (watchOS 2+) | available; full-duplex behaviour unverified |
| Choose 48 kHz input | `setPreferredSampleRate` | **API_UNAVAILABLE(watchos)** — rate is whatever the hardware gives; must be measured |
| Wrist motion | CMMotionManager (100 Hz); CMBatchedSensorManager high-rate (watchOS 10+, workout sessions) | available |
| Run with wrist lowered | WKExtendedRuntimeSession (physical-therapy, ≤1 h) / workout session | available; mic continuity unverified |
| Pause/stop control | SwiftUI `.handGestureShortcut(.primaryAction)` (double tap, watchOS 11+) | available — control only, never word input |

## Wearing positions
- **A. Normal wrist position (preferred):** no physical path from lip/jaw articulation to a wrist sensor at arm's
  length; wrist IMU sees hand motion, not speech; acoustic echoes need the mic near the mouth. Not measured — but no
  experiment is proposed because no mechanism exists. Expected: no word information → NO-GO for A.
- **B. Watch held near the mouth:** the only plausible route (Lipwatch-style active echo). Requires (1) ≥44.1 kHz
  input with usable 17–21 kHz response, (2) speaker output in that band, (3) a separately reviewed safe-emission
  protocol. Not hands-free; per the user's criteria it must beat AirPods-only by ≥15 points on held-out data to justify
  the friction. Even Lipwatch is a closed 80-command set, not user-authored sentences.

## Minimal probe (built, not yet on the device)
`watch/` (xcodegen project; builds for watchOS device + simulator SDKs, unsigned). Labelled trials record mic PCM
(WAV at hardware rate), 100 Hz motion, per-buffer host times, runtime/lifecycle events and the session's actual
configuration; the only emission is a manual, quiet, audible 1 kHz duplex check. `watch/analyze_trials.py` reports
actual sample rate, band energies to 24 kHz, gaps and motion rate.

## Decision rule for the one measurement
Trials: `keys-jingle (HF check)`, `still`, `wrist-down-30s (background)`, `duplex-1khz`.
- Input ≤ 24 kHz, or no energy above the noise floor in 17–21 kHz on keys-jingle → **NO-GO** (active echo impossible;
  passive mic offers no articulation path for silent speech). Stop Watch work.
- 48 kHz with HF content, full duplex works, audio continues wrist-down → **INCONCLUSIVE**: next is a reviewed
  active-echo test in position B only, then the matched AirPods vs Watch vs both held-out comparison.
