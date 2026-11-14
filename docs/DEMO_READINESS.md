# TACIT — Demo readiness (2026-11-14, ~19:00 UTC)

TACIT is a new kind of microphone: the user articulates silently, TACIT recognises the words from the camera and,
once validated, speaks them into the call the user is already in. Typed speech is the labelled fallback.

## A. Product status

| Area | Status | Evidence |
|---|---|---|
| Visual speech recognition (Auto-AVSR, local) | **Works on recorded video**: raw text shown in the web UI and the companion, display-only | `live:check`, `live:stress`, `ui:check`, Sol's `test:live` (recorded VOICED actor clip) |
| Silent-speech accuracy | **Not yet measured under valid conditions.** First `s1` session (partial, 12 clips, backlit): silent 13/20 = 65% WER, voiced 21/36 = 58% WER: capture-limited, not a silent-speech result (see D.1) | re-record front-lit (E.3) |
| Automatic speaking of recognised words | **Disabled** (Live refuses `automatic`; speech gate `UNVALIDATED_GATE`; `recognizedSpeechAllowed: false`) | `speech.test.ts` |
| Voice into calls (virtual mic) | **Works locally**: typed text → macOS system voice → BlackHole → sound captured at BlackHole's input | `route:check`, `speech:check`, `ui:check` |
| Remote audibility: **Google Meet** | **VERIFIED (human-observed)**: BlackHole 16ch as the Meet microphone on this Mac; the user's iPhone joined the same Meet as a separate participant; TACIT typed speech was heard on the iPhone | user's physical test, 2026-11-14 |
| Remote audibility: FaceTime / Zoom | **Not yet tested** | E.2 |
| Typed synthesized speech into a real call | **VERIFIED** through Google Meet (system voice, user-authored text) | as above |
| Menu-bar companion (`TACIT.app`) | Builds, launches, connects; status + Pause/Resume/Stop Live, voice output, typed Speak, Stop everything (⌃⇧⌘.) | `--selftest`: every button action PASS against :8790 (the SwiftUI menu itself was not clicked by automation) |
| Web workspace (Sol) | Setup, camera, Live, typed fallback, readiness list, presenter view | Sol: 79/79 unit, browser/axe, recovery, vision, live suites |
| One-command launch + preflight | `./scripts/tacit.sh` | verified (B) |
| AirPods assistance | Not started this session (FaceTime path first, as directed). AirPods-only word recognition remains NO-GO | `docs/research/AIRPODS_SILENT_SPEECH.md` |

## B. Launch, check, stop (all verified on this Mac)
```
./scripts/tacit.sh build        # once: deps, tacit-route, TACIT.app, web build
./scripts/tacit.sh start        # server on 127.0.0.1:8790 + Auto-AVSR sidecar (warmed) + virtual-mic helper (~7 s)
./scripts/tacit.sh preflight    # PASS / FAIL / USER ACTION per dependency
open macos/TacitCompanion/.build/TACIT.app      # menu-bar companion
./scripts/tacit.sh open         # detailed workspace in the browser (token never printed)
./scripts/tacit.sh stop         # server + sidecars (~1.6 s)
cd server && npm run route:check   # calibrate + loopback-verify the virtual mic (plays a tone INTO BlackHole; refuses during a call)
```
`start` refuses a foreign process on :8790, clears stale sidecars, binds 127.0.0.1 (`--lan` only for a phone caller).
Logs: `server/data/run/server.log` (no tokens). Recovery: a crashed recogniser restarts by itself (8–11 s measured);
`./scripts/tacit.sh restart` resets everything.

## C. Five-minute demo
1. `./scripts/tacit.sh start && ./scripts/tacit.sh preflight`; open `TACIT.app`.
2. **Google Meet (verified path):** in Meet's settings → Audio → Microphone **BlackHole 16ch**; speaker = AirPods or
   the Mac. The listener joins from another device (verified: the user's iPhone).
   FaceTime (untested): menu **Video → Microphone → BlackHole 16ch**; Control Centre → Mic Mode **Standard** (Voice
   Isolation may suppress synthetic voice — untested); FaceTime **Audio** keeps the camera free.
3. Companion shows "Virtual mic … in use by <the calling app>". **Turn voice output on** → type "Hi, it's me — I'm
   using TACIT" → **Speak**. Ask the listener what they heard.
4. Pause: type a long sentence, Speak, press **⌃⇧⌘.** mid-sentence → audio stops (measured 18 ms locally).
5. Recognition: `./scripts/tacit.sh open` → **Start Live preview** → allow camera → mouth a short phrase → raw words
   appear (labelled display-only, not spoken). Pause / Stop from the page or the companion.
6. Recovery: `./scripts/tacit.sh restart` → companion reconnects; Live must be started again (never auto-resumes).

## D. Test evidence (executed this session)
| Command | Result |
|---|---|
| **Human: Google Meet call (Mac → iPhone participant)** | PASS: typed TACIT speech heard on the iPhone through Meet. Not measured in that call: delay, pause mid-sentence |
| `cd recognition && .venv/bin/python -m tacit_vsr.eval_session data/webcam/20261114T184530Z-s1` | 12/20 clips recorded (session stopped early, no free sentences). Silent 13/20 = 0.650 WER, 0/4 exact; voiced 21/36 = 0.583, 2/8 exact; no-face 0; 555 ms median per 5.5 s clip (MPS). See D.1 |
| `.venv/bin/python record_webcam.py --check` (new) | WARN mouth brightness 47 (need ≥ 90), PASS face size 88 px: the room is still backlit |
| `./scripts/tacit.sh restart && npm run live:check` (after the recognition change) | LIVE CHECK OK, "IT'S ELEVEN O'CLOCK", 545 ms round trip |
| `npm run preflight` | exit 0, **no FAIL** (disk 41.2 GB free); user actions: camera permission, choose BlackHole in the call |
| `cd server && npm run typecheck && npm test` | clean; **96/96** |
| `cd web && npm run typecheck && npm test && npm run build` | clean; **79/79**; build OK |
| `cd macos/TacitRoute && DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test` | 4/4 XCTest |
| `npm run security:check` (live :8790) | **13/13** PASS |
| `npm run live:check` | automatic refused; display-only; "IT'S ELEVEN O'CLOCK"; owner disconnect ends Live |
| `npm run live:stress -- --n 20 --kill-recognizer` | 20/20 shown (final run p50 368 / p95 676 ms); burst 2 shown + 3 "busy"; pause mid-decode dropped; duplicate / out-of-order / stale refused; recogniser killed → abstained, recovered 8 s (earlier run) |
| `npm run route:check` | BlackHole present; no echo risk; route loss −16 dB → +16 dB applied; user-authored TTS captured at input; stop leaves 0–11 ms |
| `npm run speech:check` | 3/3 rendered + sound captured; pause → interrupted; refused while paused |
| `npm run ui:check` (production build on :8790) | Live text on page 2/2 (442–700 ms); typed speech via UI → sound at BlackHole input 1364–1458 ms after the click |
| `cd web && npm run test:live` (Sol's, via Vite → :8790) | passed |
| `macos/TacitCompanion/.build/TACIT.app/Contents/MacOS/TacitCompanion --selftest` | 7/7 PASS: voice on, Speak → rendered, Speak blocked while paused, pause/resume voice, Live pause/resume (companion activation refused), Stop everything → Live off + voice off |
| Camera coexistence (2 AVFoundation clients on the FaceTime HD Camera, frames discarded) | staggered: both 30 fps at once (180 / 90 frames); opened at the same instant: one failed with I/O error (open race). Proxy only — FaceTime video + TACIT untested |
| CI (GitHub Actions) | green on every pushed commit through `fc81189` (server + web jobs); final status in G |
| Fable (Claude specialist) reviews | 3 done: Core Audio design, companion lifecycle, integration races — every P0/P1 finding fixed with tests (see G) |

**D.1 — Why the first `s1` session failed (diagnosis, not a gate change)**
- The voiced control is almost as bad as silent (58% vs 65%), while the same model gets 5.2% on CREMA-D, so the
  dominant error is the **webcam capture**, not silent articulation. On matched prompts silent ≈ voiced ("HOW ARE YOU
  GOING" both; "CAN YOU CALL MY MOTHER" voiced exact, silent "YA YOU ARE MY MOTHER").
- Measured difference: mouth-crop grey level **40–47 / 255 on webcam vs 134–164 on CREMA-D**: the user sat with a
  bright window behind them, so auto-exposure darkened the face and lips. Face size is not the cause (88–89 px between
  the eyes vs 39–64 px on CREMA-D). Face tracked in 100% of frames.
- Post-hoc fixes did not recover it (12 clips; differences are noise): trim to the lip-motion window voiced 0.53,
  ROI contrast normalisation 0.61, gamma on frames 0.53, CLAHE 0.69, Chaplin/BlazeFace detector 0.61, downscale 0.56.
  So the information is lost at capture (dark + compressed shadows); the fix is lighting, not the model or the gate.
- Change made (`5374284`): `record_webcam.py` measures the crop the model sees in a 2 s check before recording
  (brightness ≥ 90, face ≥ 35 px, face tracked), encodes at higher quality (crf 16), and `eval_session` prints per-clip
  capture stats. The reliability gate and automatic-speech block are unchanged.
- Hypothesis still to confirm: a front-lit session should approach the CREMA-D voiced accuracy for voiced clips; only
  then does silent-vs-voiced WER measure silent articulation itself.

**Measured latency (M3 Pro, this Mac)**
- Recogniser decode: ESPnet 396 ms → fast decoder 100 ms median (96 clips; WER unchanged 5.2%, voiced).
- Live round trip, 2.4 s utterance as 61 JPEGs: warm 339–363 ms; first after start 543 ms; 20 sequential p50 410 / p95 940 ms;
  in the browser UI 398–790 ms; final `live:stress` p50 368 / p95 676 ms. (Time spent mouthing and the browser's ~480 ms end-of-utterance wait come on top.)
- Typed speech, request → sound at the virtual mic: 884–1424 ms (p50 967); UI click → sound 1458 ms. Bottleneck: macOS
  `say` 864–1378 ms (and ~4 s once the disk was nearly full). Route schedule → captured onset 3.5–9.8 ms.
- Pause request → audio stops at the virtual mic: 18 ms. Server start → model ready 6.8 s.

**Genuine vs simulated**
- Genuine: Auto-AVSR on real recorded pixels; real Core Audio playback into BlackHole and real capture from its input;
  real WebSocket/auth; real Chrome + MediaPipe in `ui:check`/`test:live`.
- Not silent speech: all recognition evidence uses VOICED CREMA-D actor clips with audio discarded.
- Labelled test fixtures only: the "validated gate" in `speech.test.ts`; fake route/TTS in unit tests.
- Verified by a person: a remote participant (the user's iPhone in Google Meet) heard TACIT's typed synthesized speech.
- Never verified: FaceTime/Zoom remote audibility; pause cutting speech inside a real call (18 ms measured locally
  only); silent-speech WER under valid capture conditions; FaceTime *video* sharing the camera with TACIT (two generic
  capture processes do share it); the companion's SwiftUI menu clicked by a person.

## E. Human-only checklist (smallest set)
1. ~~Free disk space~~ — done (41.2 GB free; preflight no FAIL).
2. ~~Remote audibility~~ — **Google Meet verified by the user.** Optional: FaceTime (steps C.2–C.4) and, in any call,
   press ⌃⇧⌘. mid-sentence and confirm the listener hears it stop.
3. **Silent recording, front-lit (≈8 min)**: face a window or lamp (light in front, nothing bright behind you), sit
   ~50–70 cm from the camera. `cd recognition && .venv/bin/python record_webcam.py --check` until brightness PASSes,
   then `.venv/bin/python record_webcam.py --name s2 --modes silent,voiced` and finish all 20 prompts + 3 own
   sentences; then `.venv/bin/python -m tacit_vsr.eval_session data/webcam/<newest dir>`. Video only, git-ignored.
   Also mouth a few non-speech movements (smile, swallow) during Live and note any words shown.
4. First run only: allow camera for the browser; allow microphone if macOS asks for `tacit-route` during `route:check`.

## F. Limitations
- Silent-speech accuracy unknown; model trained on voiced LRS3 video; research/non-commercial weights.
- Browser endpointing can clip the first word ("ELEVEN O'CLOCK" in one `ui:check` run).
- Uncertainty values are uncalibrated n-best margins.
- Voice is the macOS system voice (no ElevenLabs key configured); labelled as not personal.
- The user does not hear their own TACIT voice (no sidetone).
- BlackHole 16ch on this Mac loses 16 dB; compensated from the `route:check` measurement.
- FaceTime may resample BlackHole; the helper rebuilds on real format changes (not yet seen in a call).
- One server per Mac, one user. No login item, no installer.
- Recognition is very sensitive to lighting: a backlit face (mouth brightness < 90) decoded at ~60% WER even voiced.
  The recorder now checks this; the Live web path does not yet warn about it.
- Sol's web UI does not yet send the optional `outputGeneration` with typed speech (the companion does).
- AirPods-assisted endpointing (requested) not started: it is scheduled after a physically verified FaceTime call.

## G. Git
Branch `main`, pushed; Claude is the only Git writer. Sol's frontend checkpoint committed as `80a36ac` after
independent checks. Key commits this session: `47cfda8` (Sol checkpoint 1), `d25c21e` (Live exactly-once),
`de9aa1b`/`0fb30ed` (tacit-route), `b0ba703` (voice output + shared Live), `98f6cfb` (launcher/preflight),
`24c5f15`/`a7dbff9` (fast decoder + warm-up), `08d250b`/`95a6979` (companion), `a7ac22d` (Live owner + heartbeat),
`d17a509`, `8f11b10` (stress, UI checks), `ede14df` (disk check), `80a36ac` (Sol's frontend), `3ba11cf` `d974748`
`16d765e` `51172fa` `9511ee1` `10fd8fb` (Fable checkpoint-3 fixes: enforced stop, EPIPE, abort TTS on stop,
`outputGeneration`, frame retention, watchdog, silent-render detection), `5374284` (capture-quality measurement +
recorder lighting check, after the first `s1` diagnosis).

## H. Exact next action
Re-record the silent session **front-lit** (E.3: `record_webcam.py --check` first, then `--name s2`, all prompts) and
run `eval_session`. If voiced WER drops toward CREMA-D levels, silent-vs-voiced then measures silent articulation and
the gate can be calibrated on it; if voiced stays poor in good light, the next suspect is the speaker domain
(glasses, facial hair, speaking rate), not lighting.
