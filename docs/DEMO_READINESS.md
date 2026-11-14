# TACIT — Demo readiness (2026-11-14, ~19:45 UTC)

**Your voice. Beyond speech.** TACIT is a virtual voice for people who can silently articulate words but cannot
produce usable audible speech: the camera reads the words they mouth, and a synthesized voice speaks into the
ordinary call they are already in (Google Meet verified). Automatic speaking of recognised words stays **disabled**
until a held-out reliability test passes; until then recognition is display-only and typed speech is the labelled
voice path.

## A. Status at a glance

| Item | Status | Evidence |
|---|---|---|
| Google Meet remote audibility | **VERIFIED (human-observed)**: BlackHole 16ch as Meet mic; the user's iPhone in the same Meet heard TACIT | user's physical test, 2026-11-14 |
| Typed synthesized speech into a real call | **VERIFIED** (system voice, user-authored text) | same test |
| FaceTime / Zoom remote audibility | NOT YET TESTED | — |
| Silent recognition, good light (in-sample) | 3/3 silent sentences exact, 0/14 words wrong; voiced control 6/47 = 12.8% WER | session C (D.2) — repeated development phrases, **not** independent |
| Silent recognition, dim light | 47.7% WER (3/13 exact); voiced 46.8% | session B (D.2) |
| Silent recognition, held-out live test | **NOT YET RUN** — tooling ready (`npm run live:test`, E) | — |
| Live pipeline (browser → server → Auto-AVSR on MPS → browser/companion) | Works; same accuracy as offline in aggregate (D.4); outputs shown display-only | `live:check`, `live:replay`, `ui:check` |
| No-speech false triggers (resting face) | 36/36 → **4/36** after the pre-decode gate (`c533656`); smiles/swallows not yet measured | `eval/rest_probe.py` |
| Phrase mode (30-phrase list, frozen rule) | Display-only. Dev: 37 of 45 in-list utterances accepted, 0 wrong; 0/3 own unlisted sentences, 1/96 CREMA-D unlisted accepted | D.3 |
| Automatic speaking of recognised words | **DISABLED** (Live refuses `automatic`; `UNVALIDATED_GATE`). Recommendation: **NO-GO** open-vocabulary; phrase mode **not yet** (F) | `speech.test.ts`, `live.test.ts` |
| Menu-bar companion, launcher, preflight | Work (`--selftest` 7/7; preflight no FAIL) | B, D.1 |
| AirPods | Listening device only. AirPods word recognition NO-GO (`docs/research/AIRPODS_SILENT_SPEECH.md`) | — |

## B. Launch, check, stop (verified on this Mac)
```
./scripts/tacit.sh build        # once: deps, tacit-route, TACIT.app, web build
./scripts/tacit.sh start        # server 127.0.0.1:8790 + Auto-AVSR sidecar (MPS, warmed) + virtual-mic helper (~7 s)
./scripts/tacit.sh preflight    # PASS / FAIL / USER ACTION per dependency
open macos/TacitCompanion/.build/TACIT.app      # menu-bar companion (⌃⇧⌘. = stop everything)
./scripts/tacit.sh open         # browser workspace (token never printed)
./scripts/tacit.sh stop
cd recognition && .venv/bin/python record_webcam.py --check     # lighting/framing check (2 s, keeps nothing)
cd server && npm run live:test    # guided held-out live test (E)
```

## C. Judge demo (90 s, verified functionality only)
**Opening (15 s).** "Millions of people — after a laryngectomy, on a ventilator, with ALS — can still shape words with
their lips but have no voice. Phones offer type-to-speak. TACIT lets them *mouth* their words and be heard in a normal
call."
1. **Demo A — silent recognition (35 s).** Face lit from the front. Workspace → **Start Live preview**. Point at the
   status: microphone off, camera only (the recogniser never receives audio — its input is JPEG frames). Mouth a short
   sentence silently. The raw recognised words appear, with "display only — not spoken" and the phrase-list result.
   Say it plainly: *open-vocabulary recognition is experimental; it is right on some sentences and wrong on others.*
2. **Demo B — a real call (30 s).** Google Meet on the Mac with **BlackHole 16ch** as the microphone; a judge's/your
   iPhone joined as an ordinary participant (no app). Type a sentence in TACIT → **Speak** → the iPhone speaks it.
   Press **⌃⇧⌘.** during a long sentence to show immediate stop.
3. **Close (10 s).** "Both halves run locally on this laptop today. Connecting them automatically is gated behind a
   reliability test, because a wrong word spoken in someone's voice is worse than silence."
Do **not** type the recognised words into Speak to imply automation. If recognition misses on stage, say so and show
the abstention ("no lip movement", "ambiguous") — the safety behaviour is part of the product.

**What is novel (defensible).** Not lip-reading (Auto-AVSR, Chaplin), not closed-phrase clinical lip-reading apps
(Liopa SRAVI: ~40 phrases, patient mouths to a phone, the phone speaks), not type-to-speak in calls (Apple Live Speech).
TACIT's contribution is the **systems integration**: local visual-only recognition of silent articulation → a voice
delivered as a *microphone* into any unmodified calling app, with a live-call safety model (abstention before decoding,
display-only until validated, exactly-once utterances, pause/stop that cuts queued and playing audio in ~18 ms, stale
results dropped). We searched briefly and do not claim "first".
**Tagline for judges:** *"Mouth it. They hear it."* One-liner: *"TACIT reads the words on your lips with the laptop
camera and speaks them into your call as a voice — no sound from you, no app for them."*

## D. Evidence

### D.1 Regression and integration checks (this session, final code `0229768`)
| Command | Result |
|---|---|
| `cd server && npm run typecheck && npm test` | clean, **97/97** |
| `cd web && npm run typecheck && npm test && npm run build` | clean, **79/79**, build OK (web unchanged; protocol addition is optional) |
| `cd recognition && .venv/bin/python -m unittest discover -s tests` | 7/7 (recorder mode parsing) |
| `npm run security:check` | ALL PASSED |
| `npm run live:check` | OK; phrase mode correctly rejects its unlisted sentence; stages incl. `endpoint_wait` 480, `upload` 2 ms |
| `npm run speech:check` | OK (local virtual mic) |
| `npm run preflight` | exit 0, no FAIL (41 GB free) |
| `npm run live:replay -- <session>` | sessions B and C through the running server: transmitted=false always, no speech delivery, voice output off |
| Earlier this session (unchanged code paths) | `route:check`, `live:stress`, `ui:check`, companion `--selftest` 7/7, `swift test` 4/4 |

### D.2 Recorded webcam sessions (video only, private, `recognition/data/webcam/`, git-ignored)
| Session | Light (mouth brightness) | Silent | Voiced control |
|---|---|---|---|
| A `20261114T184530Z-s1` (partial, 12) | backlit, 40–47 | 13/20 = 65.0% WER, 0/4 exact | 21/36 = 58.3%, 2/8 |
| B `20261114T185152Z-s1` (23) | dim, median 39 | 31/65 = **47.7%**, 3/13 exact (prompted 28/47 = 59.6%, 2/10; own sentences 3/18 = 16.7%, 1/3) | 22/47 = **46.8%**, 4/10 |
| C `20261114T191005Z-bright-test` (13) | **front-lit, ~107** | 0/14 = **0%**, 3/3 exact | 6/47 = **12.8%**, 7/10 (recorded with `--modes ""`, prompted "speak normally") |
Strict WER counts "I'M" vs "I AM" as 2 errors; contraction-normalised numbers are ~4–5 points lower.

Session B silent, every prediction (REF → HYP): I DON'T UNDERSTAND → I DON'T UNDERSTAND ✓ · THANK YOU FOR COMING → THANK
YOU FOR HELPING · I WOULD LIKE SOME WATER PLEASE → THE WORD LIGHT IS THE NUMBER ONE PLACE · I AM FEELING MUCH BETTER
TODAY → I'M FEELING MUCH BETTER TODAY · I NEED HELP WITH THIS → NEED HELP WITH THIS · HOW ARE YOU DOING → HOW ARE YOU
GOING · PLEASE TURN ON THE LIGHTS → BUT THEY ARE ALL LIES · WHAT TIME IS THE APPOINTMENT → WHAT COULD THAT MEAN TO THE
BODY MAN · SEE YOU TOMORROW MORNING → THE NEW MORAL PARTY · CAN YOU CALL MY MOTHER → CAN YOU CALL MY MOTHER ✓ · own:
CAN YOU BRING MY COAT → CAN YOU BRING MY COKE · I'LL CALL YOU BACK IN FIVE MINUTES → (exact) ✓ · I'M DOING GREAT HOW
ABOUT YOU → I'VE BEEN DOING GREAT HOW ABOUT YOU.
Session B voiced: THANK YOU FOR COMING → THAT HE WAS GROWING UP IN · CAN YOU CALL MY MOTHER → NOW YOU ARE MY MOTHER NOW
YOU ARE MY MOTHER · SEE YOU TOMORROW MORNING ✓ · HOW ARE YOU DOING ✓ · I DON'T UNDERSTAND → I NO LONGER UNDERSTAND IT ·
I WOULD LIKE SOME WATER PLEASE → I WOULD LIKE SOME MARIJUANA PLEASE · I AM FEELING… → I'M FEELING… · WHAT TIME IS THE
APPOINTMENT → WOULD I MISS THE APPOINTMENT · I NEED HELP WITH THIS ✓ · PLEASE TURN ON THE LIGHTS ✓.
Session C: silent 3/3 exact (I DON'T UNDERSTAND; I WOULD LIKE SOME WATER PLEASE; PLEASE TURN ON THE LIGHTS). Voiced:
7 exact; I WOULD LIKE SOME WATER PLEASE → …SOME WORK PLEASE; SEE YOU TOMORROW MORNING → YOU TO MORROW MORNING; I AM
FEELING… → I'M FEELING….

### D.3 Bottleneck diagnosis (development evidence, sessions A–C + 96 CREMA-D clips)
| Suspect | Test | Finding |
|---|---|---|
| Lighting | sessions A/B (dim) vs C (front-lit) | **Main factor.** Voiced 47–58% → 12.8% WER; silent 48–65% → 0/14 (in-sample). Post-hoc brightening (gamma, CLAHE, contrast) did not recover dim clips |
| Silent vs voiced articulation | paired prompts | Not the bottleneck: silent ≈ voiced in every session; silent lip aperture range is *larger* (median 0.26 vs 0.18) |
| Decoder | `eval/sweep_decode.py` | Not it: beam 40 = beam 10 (2× slower); CTC 0.3 mixed; no-repeat fixes one looping clip only. Kept current |
| Segmentation / padding | `eval/live_sim.py` | Small: 160 ms pre-roll costs a few words vs 400–800 ms (0.43 vs 0.39 WER, weak). Sol: consider pre-roll 400 ms |
| Live vs offline preprocessing | `eval/preproc_ab.py`, 48 clips | Equivalent in aggregate (offline 0.369, live 640 px JPEG q80 0.356). Individual sentences flip on tiny input changes → **per-utterance instability** is the real limit |
| Face size, tracking | capture stats | Fine (inter-ocular 88–106 px; face tracked 100%) |
| Model capability | published | This checkpoint is LRS3 **19.1% WER** (in-the-wild video). Open-vocabulary errors are expected even in good light |
| No-speech hallucination | `eval/rest_probe.py` | **Defect found and fixed:** a still face decoded as "WE'RE GOING TO BE TALKING ABOUT THE" in 36/36 resting segments. Pre-decode gate with untuned pre-existing thresholds → 4/36; 0/48 real utterances lost |
| Constrained vocabulary | `eval/closed_set.py` (frozen rule, list written before running) | Session B: silent 10/10 top-1, 8 accepted, 0 wrong; voiced same. A: 8 accepted, 0 wrong. C (via `live:replay`): 13/13 accepted, 0 wrong. Unlisted: own 0/3, CREMA-D 1/96 accepted ("MAYBE TOMORROW IT WILL BE COLD" → GOOD MORNING) |

### D.4 Live path
- Browser: getUserMedia 640×480 → MediaPipe (blendshapes) motion endpointer (onset 160 ms, pre-roll 160 ms, end after
  480 ms still) → JPEG q0.8, ≤ 640 px, real timestamps → WebSocket. Server: auth, exactly-once, ≤ 2 in flight →
  sidecar resamples to 25 fps by timestamp, FaceMesh mouth crop (same code as offline), Auto-AVSR encoder on **MPS**,
  fast beam (CPU), phrase scoring → hypothesis to all clients (browser + companion), always `transmitted:false`.
- Same crop/normalisation code offline and live (`video.py`); colour → grayscale, 96→88 crop, mean 0.421/std 0.165.
- Observability: per-utterance `stages` (decode, landmarks_crop, encode, beam_decode, phrase, endpoint_wait, upload),
  `gate.mouth_brightness`, abstention reason, phraseMatch.

### D.5 Conversation latency (M3 Pro). Components measured separately; the full chain is never run because automatic speech is disabled
| Stage | Measured |
|---|---|
| Articulation onset → window opens | needs 160 ms of motion (pre-roll restores the start; adds nothing at the end) |
| End of articulation → endpoint decision | **480 ms** (browser quiet interval; reported per utterance as `endpoint_wait`) |
| Upload to server | 2 ms (local) |
| Recognition (server, incl. phrase mode) | 2.4 s utterance: 686–819 ms; 5.5 s clips via live path: p50 734–781 ms, max 1145 ms |
| Synthesis (macOS `say`, whole file before playback) | 864–1378 ms |
| Virtual-mic schedule → audio at BlackHole | 3.5–9.8 ms |
| Meet network → iPhone | not measured |
**B (end of articulation → first audible at the virtual mic), estimated from the medians: ≈ 480 + 2 + 750 + 1000 + 10
≈ 2.2 s** (+ Meet transit). **A (start of articulation → first audio) ≈ utterance length (1.5–3 s) + B ≈ 4–5 s.** Not a
measured end-to-end number.

### D.6 Incremental / streaming output — feasibility
- The model is a **full-context** conformer (bidirectional self-attention over the whole utterance) with a joint
  CTC/attention decoder trained on complete utterances. True word-by-word streaming needs a chunked/causal model —
  retraining, not feasible before the deadline.
- Feasible prototypes (not implemented): re-decode a growing window every ~0.5 s (encode 150–400 ms per pass) and
  commit only a prefix that is identical across consecutive passes (local-agreement). Risk: truncated input invites the
  same hallucinations seen on still faces; every partial must stay display-only.
- Largest real wins, in order: (1) **native streaming TTS** (AVSpeechSynthesizer buffers in tacit-route) — first audio
  in ~0.1–0.2 s instead of ~1 s, ≈ −0.8 s off B; (2) phrase-level commitment at natural pauses (already the design);
  (3) shorter quiet interval (480 → ~300 ms) only after the live test shows it does not split sentences.

## E. Human steps for the held-out live test (≈ 5 min)
1. Light from the front (face a window or lamp, nothing bright behind you). `cd recognition && .venv/bin/python
   record_webcam.py --check` until **PASS mouth brightness** (≥ 90; aim for ~105).
2. `./scripts/tacit.sh restart && ./scripts/tacit.sh open` → **Start Live preview**, allow the camera. Leave voice output off.
3. In a terminal: `cd server && npm run live:test`. Follow the 10 prompts: 5 fresh sentences (never used in
   development), 3 no-articulation windows (still / smile / swallow + glance away), one 3× repeat, one pause trial
   (the script pauses Live itself). Silent only — no voice, no whisper.
4. Paste the final report (or the log path it prints, `recognition/data/live/…`, text + timings only) back to Claude.
   That result is the first **held-out** live number; it must be reported before any tuning on it.
Optional: in a Meet call, type a long sentence → Speak → press ⌃⇧⌘. mid-sentence; ask the listener whether it stopped.

## F. Automatic silent-to-voice: recommendation
- **Open-vocabulary automatic speech: NO-GO.** Even in good light the model is a ~19%-WER recogniser (dev voiced
  12.8%); outputs flip between near-identical inputs; confidence features do not separate errors (session B: n-best margin ≥ 0.15
  accepted 9/23 with 2 wrong, incl. "…SOME MARIJUANA PLEASE").
- **Phrase-mode automatic speech: NOT YET (conditional).** In-list accuracy looks strong on development data (0 wrong
  accepts; 37/45 accepted), but **4/36 resting-face segments are still accepted** (as "I DON'T UNDERSTAND") and smiles,
  swallows, listening/laughing have not been measured. Proposed, not implemented: an explicitly opt-in, per-session
  "phrase autospeak (experimental)" mode that may speak only accepted list phrases, only while Live and voice output are
  on, with ⌃⇧⌘. stop. Pre-registered conditions before building/enabling it, on new held-out live data: ≥ 20 silent
  in-list attempts with **0 wrong accepts** and ≥ 60% accepted; ≥ 3 minutes of non-articulation (still, smile,
  swallow, nodding while the other person talks) with **0 accepts**; plus your explicit authorization.
- What the system can already distinguish: missing face / too few frames / still lips (abstains before decoding);
  dark capture (reported as `mouth_brightness`, not yet a gate); end of utterance (motion endpointer, experimental).
  What it cannot yet: unintended mouth movements (smile, swallow) vs speech; correct vs incorrect open-vocabulary text.

## G. Limitations
- Weights are research/non-commercial; trained on voiced LRS3 video. Silent accuracy measured only on one speaker,
  repeated prompts, in development.
- Recognition depends strongly on front lighting; the Live web UI does not yet warn when `mouth_brightness` < 90.
- Resting-face false triggers 4/36 remain (display-only, so nothing is spoken).
- Voice is the macOS system voice (labelled, not personal); `say` adds ~1 s.
- No sidetone; one server per Mac; FaceTime untested; no installer.
- Companion shows raw text but not yet the phrase result.

## H. Requests for Sol (frontend, all optional/additive)
1. Show `hypothesis.phraseMatch` when present: "Phrase list match: … (display only)" or its rejection reason.
2. Warn when `hypothesis.gate.mouth_brightness` < 90: "Your face is too dark for reliable reading — light from the front."
3. Show end→shown latency = `stages.endpoint_wait + stages.upload + recognitionMs`.
4. Consider `ARTICULATION_CONFIG.preRollMs` 160 → 400 (weak evidence, D.3); send `outputGeneration` with `speak_typed`.

## I. Git
`main`, pushed; Claude is the only Git writer. This round: `5374284` capture stats + lighting check; `7a8f482` eval
tools; `c533656` pre-decode abstention gate; `0773988` phrase mode; `800a9ea` phraseMatch to clients; `af14b92`
latency stages + `live:replay` + `live:test`; `0229768` recorder `--modes` fix + nv12. Earlier: see HANDOFF.
Sources (prior art): [SRAVI App Store](https://apps.apple.com/us/app/sravi/id1518790556),
[Euronews on SRAVI trials](https://www.euronews.com/2023/03/07/nhs-hospitals-are-trialling-an-ai-lip-reading-app-to-help-patients-who-struggle-to-speak),
[Chaplin](https://awesome.ecosyste.ms/projects/github.com%2Famanvirparhar%2Fchaplin),
[Auto-AVSR](https://github.com/mpc001/auto_avsr), [Apple Live Speech](https://support.apple.com/105018).
