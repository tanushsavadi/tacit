# TACIT — Demo readiness (2026-11-14, 20:50 UTC)

**Your voice. Beyond speech.** TACIT is a virtual voice for people who can silently articulate words but cannot
produce usable audible speech: the camera reads the words they mouth, and a synthesized voice speaks into the
ordinary call they are already in (Google Meet verified). Automatic speaking of recognised words stays **disabled**
until a held-out reliability test passes. Recognised words reach the call only through **reviewed speech**: the user
picks the right candidate (or corrects it) and presses Speak.

## A. Status at a glance

| Item | Status | Evidence |
|---|---|---|
| Google Meet remote audibility | **VERIFIED (human-observed)**: BlackHole 16ch as Meet mic; the user's iPhone in the same Meet heard TACIT | user's physical test, 2026-11-14 |
| Typed synthesized speech into a real call | **VERIFIED** (system voice, user-authored text) | same test |
| FaceTime / Zoom remote audibility | NOT YET TESTED | — |
| Silent recognition, good light (in-sample) | 3/3 silent sentences exact, 0/14 words wrong; voiced control 6/47 = 12.8% WER | session C (D.2) — repeated development phrases, **not** independent |
| Silent recognition, dim light | 47.7% WER (3/13 exact); voiced 46.8% | session B (D.2) |
| Silent recognition, held-out live test (v1, real browser pipeline, front-lit 127–130) | **44% WER (11/25), 2/5 exact**, 0 missed windows; end→shown p50 1385 / p95 1483 ms | D.7 — FROZEN baseline, `recognition/data/live/2026-11-14T19-58-01-573Z-livetest.jsonl` |
| Live pipeline (browser → server → Auto-AVSR on MPS → browser/companion) | Works; same accuracy as offline in aggregate (D.4); outputs shown display-only | `live:check`, `live:replay`, `ui:check` |
| No-speech false triggers | Dev resting face 36/36 → 4/36 after the pre-decode gate. **Held-out live: still 0, swallow/glance 0, smile 1** (raw "SO", phrase mode wrongly ACCEPTED "I DON'T UNDERSTAND") | D.7, D.9 |
| Phrase mode (30-phrase list) | **`phrase-rule-v2` now default** (`3a76e6a`; v1 selectable). Dev re-run (same data the floor was chosen on — NOT validation): in-list 37/45 accepted, 0 wrong (v1 37); unlisted 0/99; resting face **0/36** (v1 4); tails 3/48 (v1 10, one real speech); heads 1/48 (v1 2). Smile/swallow/listening never recorded → **NOT VALIDATED** | D.9 |
| LM-assisted decoding (pretrained Auto-AVSR subword LM, shallow fusion) | **Rejected**: worse WER on every dev set, ~1.7–2× decode time, fluent hallucinations | D.8 |
| Oracle top-K (is the reference in the N-best?) | **Run (dev):** reference in top-1/3/5/10 — own silent clips 6/7/8/10 of 20, CREMA-D 80/85/92/93 of 96. Review now shows 5-best (`3cb0871`) | D.10 |
| Flip test-time augmentation | **Rejected** (pre-registered): CREMA-D 5.2→5.4%, own silent 44.4→51.5% | D.12 |
| Alternative models / personalisation | No openly usable model credibly beats the current one (best reported VALLR 18.7% vs 19.1%, LLM-generated words). Personal phrase templates: cross-session 45/45 on 10 phrases (generic 44/45 — ceiling) but do not reject own unlisted sentences | `docs/research/VSR_ALTERNATIVES.md` |
| Reviewed mouth-to-call (`speak_reviewed`) | **Backend implemented and locally verified** (`7853bd8`, `e0894f3`, `605880a`): real recorded silent clip → Auto-AVSR → candidates → explicit pick → system voice → BlackHole 16ch `rendered`; tamper/stale/duplicate refused; stop 21 ms. Web/notch UI: Sol (in progress); fallback `npm run review`. **Remote audibility of reviewed speech NOT yet human-confirmed** | D.13, HANDOFF contract |
| Release targets (≤ 5% WER and ≥ 90% exact on ≥ 50 new silent labelled utterances; 0 accepted non-speech) | **NOT VALIDATED — not met on any data so far** (best honest held-out: 44% WER, 2/5 exact). Targets, not results | D.7 |
| Automatic speaking of recognised words | **DISABLED, unchanged** (Live refuses `automatic`; `UNVALIDATED_GATE`; `recognizedSpeechAllowed: false`). **NO-GO** open-vocabulary; **NO-GO** phrase mode (F) | `speech.test.ts`, `live.test.ts` |
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
**Preferred flow once the review UI is up (web/notch from Sol, or `cd server && npm run review` in a terminal):**
mouth a sentence → the candidates appear (raw first, then alternatives) → *you* pick the right one or fix it → press
Speak → the iPhone in the Meet hears it. Say plainly that the pick is yours: the model's raw text is wrong often
(44% WER held-out), and the right sentence is among the 5 candidates more often than first (D.10) — nothing is spoken
without your press. The A/B script below remains the fallback.
1. **Demo A — silent recognition (35 s).** Face lit from the front. Workspace → **Start Live preview**. Point at the
   status: microphone off, camera only (the recogniser never receives audio — its input is JPEG frames). Mouth a short
   sentence silently. The raw recognised words appear, with "display only — not spoken" and the phrase-list result.
   Say it plainly: *open-vocabulary recognition is experimental; on fresh sentences it was exactly right 2 of 5 times
   (44% WER, D.7).* Keep a neutral face between sentences (a smile can produce a wrong phrase-list match, D.9); mouth one
   sentence, then wait for the text (~1.4 s) before the next. **Fallback if recognition misses:** show the abstention /
   rejection reason, then go straight to Demo B (typed speech) — never retype the recognised words into Speak.
2. **Demo B — a real call (30 s).** Google Meet on the Mac with **BlackHole 16ch** as the microphone; a judge's/your
   iPhone joined as an ordinary participant (no app). Type a sentence in TACIT → **Speak** → the iPhone speaks it.
   Press **⌃⇧⌘.** during a long sentence to show immediate stop.
3. **Close (10 s).** "Both halves run locally on this laptop today. Connecting them automatically is gated behind a
   reliability test, because a wrong word spoken in someone's voice is worse than silence."
Do **not** type the recognised words into typed Speak to imply automation; use reviewed Speak, which is labelled. If recognition misses on stage, say so and show
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

### D.1 Regression and integration checks
Latest (2026-11-14 ~20:40 UTC, code `fd3c8d3`): `cd server && npm run typecheck && npm test` clean, **98/98**;
`recognition` unittests 7/7; new eval scripts compile. `live:test` v2 typechecked, not yet run with a human. Web unchanged.
Earlier, code `0229768`:
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

### D.7 FIRST HELD-OUT LIVE TEST (v1) — frozen baseline, 2026-11-14 19:58 UTC
`npm run live:test` (set v1), real silent articulation, real browser webcam pipeline, good front light. Recorded before
any change to thresholds, phrase rule or model settings. **These five sentences have since been studied: never use them
again as unseen evaluation** (they remain only behind `--set v1`).
| REF | HYP (raw, display-only) | words wrong |
|---|---|---|
| YES I UNDERSTAND | YES I UNDERSTAND ✓ | 0/3 |
| CAN WE TALK LATER | CAN WE TALK LIKE A GIRL | 2/4 |
| MY BATTERY IS ALMOST EMPTY | MY MANUAL E IS ALMOST PLEASE | 3/5 |
| PLEASE SEND ME THE ADDRESS | PLEASE SEND ME THE ADDRESS ✓ | 0/5 |
| I THINK THE MEETING WENT REALLY WELL TODAY | I THINK THE BLEAK WILL AGREE WILL AGREE | 6/8 |
- **WER 11/25 = 44%; exact 2/5; missed sentence windows 0.** Mouth brightness 126.9–130.
- End of articulation → shown: **p50 1385 ms, p95 1483 ms** (endpoint wait 482–525 + upload 12–31 + recognition 708–982).
- Non-articulation: still face 0; **smile 1** (raw "SO", phrase rule v1 ACCEPTED "I DON'T UNDERSTAND", margin 0.361,
  garbage gap −0.643); swallow + glance 0.
- Repeat ×3 "CAN WE TALK LATER": **1 window** (exact). Pause trial: 0 results after pause.
- Phrase mode on the 5 unlisted sentences: all correctly rejected ("video fits an unlisted sentence better").

### D.8 LM-assisted decoding A/B (development data only) — REJECTED
`eval/lm_ab.py`: same encoder output per clip; production fast beam (beam 10, CTC 0.1, no LM) vs shallow fusion with
`lm_en_subword` (Amanvir/lm_en_subword @ f4e39b6d…, the checkpoint Chaplin/SilentFlow/Lipflow use; same research-only
terms as the VSR weights; git-ignored in `third_party/visual/weights/lm_en_subword/`). Wiring verified: TACIT's FastLM
equals ESPnet's reference `lm.score` to 0.01 nats, and natural > scrambled sentences (−19.5 vs −43.4).
| Set | base (prod) | LM 0.1 | LM 0.2 | LM 0.3 | LM 0.5 | LM 0.3 beam 20 | decode p50 base → LM |
|---|---|---|---|---|---|---|---|
| A backlit (12) | 60.7% | 58.9% | 62.5% | 62.5% | 66.1% | 67.9% | 91 → 157–205 ms |
| B dim (23) | 47.3%, 7 exact | 50.9% | 59.8% | 58.9% | 59.8% | 54.5% | 102 → 168–228 ms |
| C front-lit (13) | **9.8%, 10 exact** | 21.3% | 19.7% | 19.7% | 19.7% | 19.7% | 130 → 203–296 ms |
| CREMA-D voiced (96) | **5.2%, 80 exact** | 6.0% | 5.8% | 6.0% | 7.1% | 5.6% | 142 → 240–284 ms |
Introduced errors are fluent hallucinations, e.g. PLEASE TURN ON THE LIGHTS → "I'M GOING TO PLAY THE GIRL ON THE LIGHT";
SEE YOU TOMORROW MORNING (correct without LM) → "IT'S A NEW SMALL MARKET". One fix (…SOME WORK PLEASE → …SOME WATER
PLEASE) does not offset them. Lipflow's author reports the same (LM weight 0.2–0.6: no gain). Peak process RSS 2238 MB
was unchanged by loading the LM (the peak is set earlier; the LM file is 215 MB). **Production decoding unchanged.**
Personalised LM / LLM candidate scoring were not built: fusion with a general LM already hurts, and there is no
disjoint personal data to tune a personal prior on.

### D.9 Phrase false acceptance — root cause and proposed rule v2 (development evidence)
**Root cause.** Rule v1 (`tacit_vsr/phrases.py`) accepts the best phrase when (1) margin to the runner-up ≥ 0.15 and
(2) the free open-vocabulary hypothesis is NOT better than the phrase by > 1.5 nats/token. There is **no absolute
evidence floor**: when the window contains no sentence, the free decoding is itself junk (one word, very low score), so
check (2) passes trivially, and one phrase — almost always "I DON'T UNDERSTAND" — is relatively best. The held-out smile:
free "SO" att −2.894/token, gap −0.643 → accepted. Upstream contributors: the browser endpointer weights jaw/mouth
aspect velocity (a smile opens the lips, `web/src/silent/articulation.ts`), and the pre-decode gate threshold
(aperture range ≥ 0.04 IOD) is far below the smile's 0.117 (live sentences: 0.31–0.40).
**Evidence** (`eval/phrase_rule_probe.py`, sessions A–C + CREMA-D, 276 items; sub-segments are the closest existing
proxies for non-sentence mouth motion — NOT smiles):
| Kind | n | gated before decode | v1 accepts | free att/token (min / median of decoded) |
|---|---|---|---|---|
| in-list utterances | 45 | 0 | 37 (all correct) | −1.18 / −0.39 |
| unlisted utterances (own + CREMA-D) | 99 | 2 | 0 | −0.51 / −0.11 |
| resting face after speech | 36 | 32 | **4** (all "I DON'T UNDERSTAND") | −1.88 / −1.66 |
| tail: last 0.9 s of motion + settling | 48 | 2 | **10** | median −1.30 |
| head: 0.9 s around onset | 48 | 2 | **2** | median −0.65 |
Two session-C tails are the smile pattern exactly: free "SO" (−2.73) → "I DON'T UNDERSTAND". Other junk accepts: "UM",
"UGLY", "MIND", "SEE", "YES", "RIGHT", "WEEK", "EXACTLY", "YEAH", "I".
Candidate added conditions (v1 kept), same data:
| Added condition | in-list accepted (correct) | rest | tail | head |
|---|---|---|---|---|
| none (v1) | 37 (37) | 4 | 10 | 2 |
| **free att/token ≥ −1.5** | **37 (37)** | **0** | 3 | 1 |
| ≥ −1.5 and phrase/free word overlap ≥ ⅓ | 33 (33) | 0 | 1 | 0 |
| ≥ −1.0 | 34 (34) | 0 | 1 | 0 |
Unlisted sentences: 0 accepts under every rule. The one tail every rule accepts is the real end of "…CALL MY MOTHER"
(speech, not a non-speech trigger). **Proposal (NOT implemented): `phrase-rule-v2` = v1 + free att/token ≥ −1.5**,
plus a server-side speech-likeness check before decoding once smile/nod recordings exist. The held-out smile (−2.894,
no overlap) would be rejected by all three — a post-hoc check, not a validation. Validation needs the v2 live test
non-speech trials and `--phrases` (E).
**Implemented (`3a76e6a`, default; `TACIT_PHRASE_RULE=phrase-rule-v1` restores v1).** Re-run of
`eval.phrase_rule_probe` through the real model with v2 (same 276 items, decodes identical 276/276): accepts 41 =
predicted 41 from the v1 dump — in-list 37 (all correct), unlisted 0, rest 0, tail 3 ("UGLY", "RIGHT" → I DON'T
UNDERSTAND; real speech "AND YOU CALL MY MOTHER"), head 1 ("I"). Still DEVELOPMENT evidence; non-speech behaviour
on smiles/swallows/listening is unmeasured. `eval.closed_set` was not re-run: its in/out-of-list acceptance is the
same computation as the probe's utt_in/utt_out rows (identical above), and top-1 does not depend on the rule.

### D.10 Oracle top-K (development data, first run 2026-11-14 ~20:35 UTC)
`eval/oracle_topk.py`: candidates only from the visual decoder (no LM); the reference is used only to score them.
Exact sentence within the top-K (beam 10; beam 20 identical or worse):
| Set | n | top-1 | top-3 | top-5 | top-10 |
|---|---|---|---|---|---|
| own silent, A backlit | 4 | 0 | 0 | 0 | 0 |
| own silent, B dim (prompted + own) | 13 | 3 | 4 | 5 | 7 |
| own silent, C front-lit | 3 | 3 | 3 | 3 | 3 |
| **own silent, all** | **20** | **6** | **7** | **8** | **10** |
| own voiced, all | 28 | 13 | 16 | 16 | 16 |
| CREMA-D voiced (unseen speakers) | 96 | 80 | 85 | 92 | 93 |
Oracle WER (best of top-5): own silent B 59.6→44.7% (prompted), CREMA-D 5.2→1.7%. Top-1 at nbest 10 equals the
production numbers on every set, so raising the production N-best from 3 to 5 (`3cb0871`) leaves the raw text
unchanged and gives review 4 alternatives. Consequence: a reranker could at best move 6→8 of 20 silent sentences;
the user's own pick in review captures that upper bound without any model guessing. Half of the silent sentences are
not in the top-10 at all — only a better visual model / adaptation helps those.

### D.11 Repeated articulation — diagnosis (one window out of three)
Every v1 live window lasted **3.5–5.2 s** (frames ÷ 25 fps from the log: "YES I UNDERSTAND" 3.52 s; the repeat's window
4.04 s), although these sentences take ~1.5–2 s to say. With a ~4 s window per repetition plus ~2 s still, the second
result arrives ≈ 10–11 s after Enter, but v1 `live:test` listened for only **9 s**: the trial design most likely
truncated it. Not proven — v1 did not log arrival times or window bounds. Fixed in tooling: `4dda303` adds per-window
`win_start/win_end/win_ms/win_frames/win_max_gap` to `stages`; `24c2baf` gives the repeat trial 22 s and logs arrival
times. Open question for the next run: why windows are ~2 s longer than the articulation (slow deliberate mouthing, or
endpointer staying active on pre/post movements). Sol's replay test already shows the segmenter re-arms between
repeats (two windows on recorded actor input), so a rearm bug is not indicated.

### D.12 Flip test-time augmentation — REJECTED (pre-registered rule)
`eval/tta_ab.py`: mean of the encoder outputs for the mouth crop and its mirror (Auto-AVSR trains with flips), same
decoder. Rule written before the run: adopt only if CREMA-D improves and own silent does not worsen. Result: CREMA-D
5.2% → 5.4% (80 → 79 exact), own silent 44.4% → 51.5% (6 → 5 of 20), own voiced 37.7% → 43.8%. Not adopted.

Pre-synthesis (`e583589`): while voice output is on, shown candidates are synthesized locally in advance (voice policy
applies; nothing sent before Speak). Measured ~21:10 UTC on an isolated
instance (:8799, real `say` voice, real BlackHole 16ch route with no reader, fixed fake recogniser text, Speak 3 s
after the candidates appeared): press → first audio **5 ms with pre-synthesis vs 798 ms without** (`TTS_PRESYNTH=off`),
one trial each. **Live on :8790 since the ~21:12 UTC restart:** a pick pressed ~5 s after the candidates appeared →
`tts=0ms request→audio=5ms`; a press within milliseconds of display (reviewed:check) still waits for the in-flight
pre-synthesis of all 5 candidates (1391 ms). Personal (ElevenLabs) voice pre-synthesis still needs the user's `personalPresynth` opt-in.

### D.13 Reviewed speech — local verification (2026-11-14 ~20:30–20:45 UTC, server :8790 restarted on the new code)
`npm run reviewed:check -- ../recognition/data/webcam/20261114T191005Z-bright-test` (recorded SILENT clips of the
user, sent as browser JPEG frames through Live; nobody was reading BlackHole): "I DON'T UNDERSTAND" shown in 1252 ms
with 3 candidates; tampered text, wrong hash, stale Live generation, unknown utterance, stale output authorization,
wrong kind → all refused; the pick rendered into BlackHole 16ch (system voice; press → first audio 1292 ms, rendered
2672 ms); a second Speak for the same utterance refused; emergency stop during a second reviewed utterance →
interrupted 21 ms after stop. `npm run review` (terminal client) with clip free03: raw "PLEASE HEAR ALL THE LIGHTS",
alternative 2 "PLEASE TURN ON THE LIGHTS" picked → rendered → STOP → off. Not tested: a human listener on the far end.

## E. Next human evaluation (≈ 12 min, independent of everything studied so far)
1. Light from the front: `cd recognition && .venv/bin/python record_webcam.py --check` until PASS (≥ 90; aim ~105–130).
2. `./scripts/tacit.sh restart && ./scripts/tacit.sh open` → **Start Live preview**. Leave voice output off. Keep the
   workspace window visible (hidden tabs pause capture).
3. `cd server && npm run live:test` (set v2: 5 fresh sentences, still 15 s, smile ×3, swallow/nod, 20 s listening,
   repeat ×3 in 22 s, pause). Then `npm run live:test -- --phrases` (20 in-list attempts, random order).
4. Paste both reports / log paths (`recognition/data/live/…`). Do not rehearse the v2 sentences before the run.
The v1 result (D.7) stays the frozen baseline; v2 is the first evaluation of anything changed after it (phrase-rule-v2,
5-best). Toward the release targets, ≥ 50 genuinely silent NEW labelled sentences are needed (a fresh sentence list larger
than `live:test` v2's 5, never rehearsed) — not available yet, so every target stays NOT VALIDATED.

### E.2 Physical test — reviewed speech into Google Meet (≈ 6 min, needs a second device as listener)
1. `./scripts/tacit.sh status` (server up) → `./scripts/tacit.sh open` → workspace: **Start Live preview** (camera).
2. Google Meet on the Mac: microphone = **BlackHole 16ch**; join from the iPhone as an ordinary participant; mute the
   iPhone's own mic, unmute its speaker.
3. Terminal: `cd server && npm run review` (or Sol's UI if it shows the candidates + Speak). Type `o` → "[voice] ready".
4. Mouth "please turn on the lights" silently → candidates appear → type the number of the correct one → Enter.
   Record: did the iPhone play it? (yes/no, words heard). Then mouth a NEW sentence of your own, pick or `e N` to
   correct, Enter; record the same.
5. Safety on the call: mouth something, type its number, then immediately `s` → the iPhone must hear nothing or a cut
   phrase; press the same number again → "refused" (already spoken / output off). Pause Live in the browser → older
   candidates must be refused.
6. Report: per attempt — raw text, which candidate (or correction) you picked, heard yes/no. Only a "yes" from the
   listener counts as remote audibility.

## F. Automatic silent-to-voice: recommendation
- **Open-vocabulary automatic speech: NO-GO.** Even in good light the model is a ~19%-WER recogniser (dev voiced
  12.8%); outputs flip between near-identical inputs; confidence features do not separate errors (session B: n-best margin ≥ 0.15
  accepted 9/23 with 2 wrong, incl. "…SOME MARIJUANA PLEASE").
- **Phrase-mode automatic speech: NO-GO for now** — the held-out live test produced a wrong accept on a smile (D.7, D.9).
  Earlier text, kept for reference: **NOT YET (conditional).** In-list accuracy looks strong on development data (0 wrong
  accepts; 37/45 accepted), but **4/36 resting-face segments are still accepted** (as "I DON'T UNDERSTAND") and smiles,
  swallows, listening/laughing have not been measured. Proposed, not implemented: an explicitly opt-in, per-session
  "phrase autospeak (experimental)" mode that may speak only accepted list phrases, only while Live and voice output are
  on, with ⌃⇧⌘. stop. Pre-registered conditions before building/enabling it, on new held-out live data: ≥ 20 silent
  in-list attempts with **0 wrong accepts** and ≥ 60% accepted; ≥ 3 minutes of non-articulation (still, smile,
  swallow, nodding while the other person talks) with **0 accepts**; plus your explicit authorization.
- What the system can already distinguish: missing face / too few frames / still lips (abstains before decoding);
  dark capture (reported as `mouth_brightness`, not yet a gate); end of utterance (motion endpointer, experimental).
  What it cannot yet: unintended mouth movements (smile, swallow) vs speech; correct vs incorrect open-vocabulary text.

- **Reviewed mouth-to-call (implemented, D.13):** the user picks one displayed candidate of the current utterance (or
  corrects it — spoken as `user-corrected`) and presses Speak → `speak_reviewed`. Not automatic speech; the gate above
  is unaffected.

## G. Limitations
- Weights are research/non-commercial; trained on voiced LRS3 video. Silent accuracy measured only on one speaker,
  repeated prompts, in development.
- Recognition depends strongly on front lighting; the Live web UI does not yet warn when `mouth_brightness` < 90.
- Phrase rule v2 still accepted 3 of 96 non-sentence dev windows (D.9); smiles/swallows/listening never measured.
- Open-vocabulary silent recognition: half of the dev silent sentences are not in the 10-best (D.10); review cannot
  fix those — the user must correct or retype. Speaker adaptation (fine-tuning on the user's own labelled silent
  sentences) is the most promising lever but needs ≥ ~100 new labelled own clips and was not attempted.
- Live windows run ~2 s longer than the articulation (D.11); cause not yet measured.
- Voice is the macOS system voice (labelled, not personal); `say` adds ~1 s.
- No sidetone; one server per Mac; FaceTime untested; no installer.
- Companion shows raw text but not yet the phrase result.

## H. Requests for Sol (frontend, all optional/additive)
0. **Review-and-Speak UI** for `speak_reviewed` (contract: HANDOFF → "Interface contract — reviewed speech").
1. Show `hypothesis.phraseMatch` when present: "Phrase list match: … (display only)" or its rejection reason.
2. Warn when `hypothesis.gate.mouth_brightness` < 90: "Your face is too dark for reliable reading — light from the front."
3. Show end→shown latency = `stages.endpoint_wait + stages.upload + recognitionMs`.
4. Consider `ARTICULATION_CONFIG.preRollMs` 160 → 400 (weak evidence, D.3); send `outputGeneration` with `speak_typed`.

## I. Git
`main`, pushed; Claude is the only Git writer. This session: `7853bd8` speak_reviewed; `614a261` contract;
`3a76e6a` phrase-rule-v2; `e0894f3` reviewed:check; `665c8c4` eval grouping fix; `3cb0871` 5-best; `605880a`
`npm run review`; `e4f668d` flip-TTA harness (rejected). Previous session: After the held-out test: `4dda303` per-window diagnostics in
`stages`; `24c2baf` `live:test` v2; `fd3c8d3` eval harnesses (LM A/B, phrase-rule probe, oracle top-K); then docs. This round: `5374284` capture stats + lighting check; `7a8f482` eval
tools; `c533656` pre-decode abstention gate; `0773988` phrase mode; `800a9ea` phraseMatch to clients; `af14b92`
latency stages + `live:replay` + `live:test`; `0229768` recorder `--modes` fix + nv12. Earlier: see HANDOFF.
Sources (prior art): [SRAVI App Store](https://apps.apple.com/us/app/sravi/id1518790556),
[Euronews on SRAVI trials](https://www.euronews.com/2023/03/07/nhs-hospitals-are-trialling-an-ai-lip-reading-app-to-help-patients-who-struggle-to-speak),
[Chaplin](https://awesome.ecosyste.ms/projects/github.com%2Famanvirparhar%2Fchaplin),
[Auto-AVSR](https://github.com/mpc001/auto_avsr), [Apple Live Speech](https://support.apple.com/105018).
