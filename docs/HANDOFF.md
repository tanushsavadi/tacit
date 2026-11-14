# HANDOFF — TACIT

**Last updated:** 2026-11-14 ~09:20 UTC
**Last working agent/model:** Claude Code, Opus 5.5 (backend, native, recognition, Git owner). Frontend: GPT-6 Sol → `docs/WORKSTREAM_SOL.md`.
**Product:** Mode 2 only — silent speech → the user's voice (AGENTS.md top). Live Silent Speech is enabled once per
session with pause/mute/stop; no per-utterance confirmation; **automatic transmission stays disabled until the
recognition reliability gate is measured on real silent recordings.**
**Current objective:** visual speech recognition (VSR) on genuinely silent webcam speech + a measured reliability gate,
then the backend recognition/Live contract for Sol's `web/src/silent/port.ts`.

## Repository
- `https://github.com/tanushsavadi/tacit` — PRIVATE, branch `main`. Git owner: **Claude** (AGENTS.md → Git).
- CI: `.github/workflows/ci.yml` — server typecheck+tests, web typecheck+tests+build (no secrets, no devices, no models).
- Not in Git by design: `.env`/secrets, `*/data/` (faces, motion, logs), weights/models, `third_party/`, `web/evidence/`,
  `web/artifacts/`, builds. Recognition has no CI job (needs the 1 GB Auto-AVSR checkpoint).

## Visual speech recognition (Mode 2) — evidence so far
- Model: Auto-AVSR visual-only conformer `LRS3_V_WER19.1` (mpc001 weights, research/non-commercial licence; code Apache-2.0)
  via `recognition/tacit_vsr` (MediaPipe FaceMesh mouth ROI → encoder → beam search, unigram5000). Audio is never read.
  Hushkey / SilentFlow not evaluated: this checkpoint was already local and working.
- **Offline, real video, open vocabulary:** 24 CREMA-D clips (12 sentences × 2 unseen speakers, frontal studio, VOICED
  speech): WER 3/134 = 2.2%, 22/24 sentences exact (errors: "TO MORROW", "SLICK"→"SELECTED"). Caveat: voiced actors,
  short common sentences — says nothing yet about silent articulation or webcam conditions.
- Latency (M3 Pro, ~2.3 s clips): CPU total median 839 ms (landmarks+crop 123, encoder 348, beam 330). MPS needs
  `PYTORCH_ENABLE_MPS_FALLBACK=1` (max_pool3d missing on MPS); encoder 191 ms vs 455 ms CPU, identical outputs.
- Gate features emitted per utterance (att/ctc log-prob per token, n-best margin, runner-up, frames/token): on the one
  error vs a correct clip, att −0.31 vs −0.11, margin 0.07 vs 0.37 — promising, not yet calibrated.
- **Next (needs the user):** `cd recognition && .venv/bin/python record_webcam.py --name s1` (10 prompts × silent/voiced
  + 3 own sentences, video only), then `.venv/bin/python -m tacit_vsr.eval_session <dir>`. Silent vs voiced WER on the
  same prompts separates "silent articulation" from "webcam domain".

## AirPods deliberate articulation w3 → w4: NO-GO (pre-registered; details in docs/research/AIRPODS_SILENT_SPEECH.md)
- w4 held-out primary 26% (13/50, p=0.19 vs 20%); strongest baseline rhythm-ROCKET 42%; frozen threshold accepted 1/50
  words, 2/20 control false accepts. Bud changed L (w3) → R (w4). Within-session w3 73% did not generalize.
- Earbud diagnosis: both buds share a head-aligned frame (no axis mirroring), but articulation motion is
  mirror-symmetric between buds (all L→R template correlations negative on ry/rz). Exploratory same-bud pairs: R→R 70%
  (vs rhythm 42%), L→L 52% — hypothesis only. Recorder now has `--require-bud` + `budcheck`; held-out refuses cross-bud.
- Exploratory re-analysis (`airpods/analysis/explore_existing.py`): mirror-normalised ROCKET pooled across sessions 48%
  vs rhythm 37% (McNemar p=0.002, ~20 cells examined); LIMU-BERT ≈ chance; unseen-word transfer ≈ chance.
- User asked NOT to record w5/w6 yet. If recording resumes, the specific test is a pre-registered mirror+pooling model
  (frozen on existing sessions) evaluated once on a new held-out session — see research doc.

## AirPods: hardware audit + fusion plan (w3/w4 untouched: recorder, probe binary, features and heldout script unchanged)
- Inventory table: `docs/research/AIRPODS_SILENT_SPEECH.md`. Usable = one fused ~50 Hz motion stream (accel, rotation,
  attitude, gravity, which-bud tag). Not exposed on macOS: voice accelerometer, inward mic, simultaneous L+R motion,
  iOS-26 high-quality AirPods recording.
- Most promising next experiment: **camera + AirPods fusion**, first for articulation onset/offset (Live endpointing),
  then held-out word recognition ablation camera-only vs AirPods-only vs fused on identical test trials.
- `recognition/record_sync.py --name f1` records continuous webcam (video only, ffmpeg `-copyts`) + AirPods motion
  (same unchanged TacitAirPods.app) + cue labels, all on mach host time (`time.monotonic`, CMDeviceMotion.timestamp,
  AVFoundation pts). Per-session verification: motion arrival offset/drift, first-pts delta, and 3 sync nods
  cross-correlated by `python -m tacit_vsr.sync_check <dir>` (validated: planted +80 ms recovered, r=0.97).
- Needs NEW data (f1 train / f2 held-out after re-seating); w1–w4 are never reused for new methods.
- Live product sync (later, with Sol): browser frames carry `performance.timeOrigin + performance.now()`; the server
  estimates browser↔server offset by WS ping/pong (min-RTT) and maps AirPods host time via the probe's arrival offset.

## Apple Watch value test (time-boxed; not a product direction) — INCONCLUSIVE, awaiting one device measurement
- Findings + decision rule: `docs/research/WATCH_FEASIBILITY.md`. Normal-wrist position: no articulation mechanism.
  Near-mouth: only Lipwatch-style active echo, which needs ≥44.1 kHz input — watchOS does not let apps request a rate.
- Probe `watch/` builds (device + simulator SDKs, unsigned). Deploy blocked on user: Xcode Apple ID/team, iPhone
  connected + Developer Mode on iPhone and Watch. No ultrasonic emission without a separate reviewed plan.

## Interface contract — Live Silent Speech `tacit-live-v1` (PUBLISHED in shared/protocol.ts, commit 96d0e32)
For Sol's `web/src/silent/port.ts` adapter (user WS `/ws?token=`, same auth as today). Restart the server to get it.
- Capability: `snapshot.services.recognition.live` (present when the VSR service is reachable): protocol, supportedInputs
  ['camera'], `automaticSpeechValidated:false`, `validationEvidence:null`, limits maxFrames 300 / maxBytes 12 MB / 10 s.
- Client → server: `live_control {action:'activate'|'pause'|'resume'|'interrupt'|'end', mode?, inputSource?:'camera'}`.
  `activate` with `mode:'automatic'` is refused (reason in `live_status`); `display-only` returns a fresh
  `authorizationId`. Every control bumps `generation`; in-flight results from older generations come back abstained.
- Per utterance: `visual_utterance {utteranceId, authorizationId, startMs, endMs, endpointMs, frameTimesMs[]}` then exactly
  `frameTimesMs.length` binary WS messages, each one JPEG frame in order (times = performance.now ms, strictly increasing).
- Server → client: `live_status {status: LiveStatus}` on connect and after each control;
  `recognition_hypothesis {hypothesis}` exactly once per `visual_utterance` (also for rejects): `rawText` (raw model
  output, never LLM-edited), `decision 'shown'|'abstained'`, `reason`, `uncertainty` (n-best margin/token,
  `calibrated:false`), `recognitionMs`, `stages`, `gate`, **`transmitted:false` always**. No path to TTS/call exists.
- Backend: `server/src/live.ts` (+5 tests) → `recognition/tacit_vsr/service.py` on 127.0.0.1:8765, auto-started and
  supervised by the server (`RECOGNITION_AUTOSTART=off` to disable). `npm run live:check` = end-to-end check.
- Verified (2nd instance :8791): automatic refused; display-only; 61 real CREMA-D JPEG frames → "IT'S ELEVEN O'CLOCK",
  transmitted=false; warm round trip 683 ms for a 2.5 s utterance (cold 1.29 s). Voiced studio clips, not silent speech.

## AirPods silent speech — CONCLUDED: NO-GO for word recognition (details: docs/research/AIRPODS_SILENT_SPEECH.md)
- Gate 1 (deliberate jaw opening) detectable; Gate 2 five words, strict w1-tuned → w2 held-out: with the w1-chosen
  abstention threshold 0/50 accepted (0 incorrect accepts); forced choice 34% vs 20% chance (p=0.014) but equal to the
  rhythm-only baseline (34%) → timing cue, not articulation-specific. Only exaggerated trials carry signal.
- Preserved, not integrated: `airpods/` (TacitAirPods.app probe), `server/src/airpods/motion.ts` (+tests),
  `server/scripts/airpods-{record,analyze,gate2}.ts`, data + frozen config + report in `airpods/data/`.
- Mode 2 sensing continues with webcam visual speech recognition (see Next actions).
- **Reopened by the user (2026-11-14 ~08:15 UTC): one controlled follow-up, deliberate articulation, sessions w3 → w4.**
  Pre-registered pipeline `npm run airpods:heldout -- prereg <w3> --compare <w1>` then `evaluate <w3> <w4>`:
  candidates DTW 1-NN (Subvox templates) and ROCKET + ridge (Dempster 2020, `server/src/airpods/rocket.ts`) ×
  {cue, trim} × {rot, att, acc+rot, all}, selected by w3 exact LOO; abstention threshold by w3 utility; baselines
  rhythm-DTW, rhythm-ROCKET, duration, energy, timing bundle (duration + mean/peak energy + syllable-like peak count).
  Criteria are written into the frozen config; `evaluate` refuses configs not hashed to w3 or created after w4.
  Validated on synthetic data: noise → NO-GO, rhythm-only words → INCONCLUSIVE, axis-specific words → GO. (Fixed a LOO
  leak found by the null test: intercept used the held-out label → now exact refit LOO.) w2 is not used for selection.
  Status: waiting for the user's w3/w4 recordings. Webcam VSR must not wait on this.

## Ready for physical integration
- **Browser caller ↔ TACIT user** (Sol's pages): auth, caller mic PCM → server Whisper, Gemini replies, confirm,
  system-voice audio to the caller device, playback ack. Backend side verified by scripts + 61 unit tests; Sol verified
  a fake-mic Chrome run. **Pending: a human speaking and a human confirming audibility.**
- **Twilio PSTN:** code paths, auth and failure handling verified with a protocol simulator and unit tests. **Pending:**
  `TWILIO_AUTH_TOKEN`, a Twilio number, and the user's explicit go-ahead for a public tunnel (`npm run twilio:preflight`).
- **ElevenLabs personal voice:** implemented and tested against a local mock only. **Pending:** real key + voice ID + consent flag.

## Voice authorization (this pass)
- **Audit:** the cloned voice was NOT pre-generated by default (off for personal voices), but an operator env var
  (`TTS_PRESYNTH=on`) could enable it without user consent, and ElevenLabs failures auto-substituted the system voice.
- **Now (`VoiceRouter`, server/src/tts.ts):** user session policy via `set_voice_policy` → `services.voicePolicy`.
  Defaults: `personalPresynth=false` (personal-voice audio only synthesized after confirmation; env cannot opt the user
  in), `allowSystemFallback=false` (personal voice failing/unavailable → reply refused, "Nothing was sent"). Approved
  substitution is labelled `… — SUBSTITUTED for your personal voice (approved fallback; …)` in caller metadata and
  `speech.voice`. A failed startup voice check marks the personal voice unavailable instead of silently swapping.
  Local system-voice pre-synthesis stays on (never leaves the machine; nothing sent before confirmation); `TTS_PRESYNTH=off` disables.
- **Live proof** (`npm run voice:policy-check` on a 2nd instance with an unreachable personal voice): confirmed reply →
  ERROR + notice, **0 audio frames** to the caller; after user approval → sent, labelled SUBSTITUTED.
- Remote playback still requires the controller's explicit confirmation in every path (unchanged).

## Verified this session (fresh runs)
- After the voice-policy change (05:00): 64/64 tests; security 13/13; `smoke` text OK; `smoke --audio --choose-ms 2000`
  → transcription 803–824, generation 1080–2145, postConfirm 0 → systemMs 1904–2948; fast confirm (no choosing
  delay) postConfirm 589; `twilio:sim` OK (whisper exact, ack=twilio-mark simulated); `twilio:preflight` 2 TODO
  (auth token, tunnel); turn log unchanged (4 lines, logging off); Vite now returns 403 for `server/data/secrets.json`,
  `server/.env`, server source (status-only check), 200 for `shared/protocol.ts`.
- `npm run typecheck` clean; `npm test` → **61/61** (controller 26, Twilio transport 8, browser transport 5, TTS/ElevenLabs
  mock 6, auth/log/metrics/fallback 11, segmenter/signature 5).
- `npm run security:check` → 13/13 PASS on the live server (auth unchanged and intact; logging still opt-in, default off).
- Live end-to-end with real Gemini: `smoke` (text), `smoke -- --audio` (PCM → whisper-server), `twilio:sim` — all OK.
- **Failure recovery (live):** forced Gemini timeout (`GEMINI_TIMEOUT_MS=1`) → options labelled
  `local-rules (no LLM) — Gemini unavailable: timeout`, turn completed. Killed whisper-server mid-session → next turn
  transcribed via whisper-cli fallback (1781 ms), supervisor relaunched whisper-server in ~1 s, next turn 827 ms.
- **Failure recovery (unit):** STT error → caller state back to LISTENING; transcriptions serialized in order; duplicate
  utterance ids ignored (scoped to the current call); disconnect mid-reply ends once, later speech refused; caller
  device playback failure reported as `sent`, never `played`; cancel during Twilio playback sends `clear`; unauthorized
  Twilio stream audio ignored; abandoned proposals expire (existing); stale/early confirmations rejected (existing);
  TTS failure → error state, nothing sent (existing) or labelled system-voice fallback when personal voice fails.

## Latency work (only changes backed by measurements)
Baseline last session (`smoke --audio`, scripted): transcription 1817, generation 1610, synthesis 871 → ~4.3 s.
| Change | Evidence | Result |
|---|---|---|
| Persistent `whisper-server` (supervised, falls back to whisper-cli) | `npm run bench:stt`, 96 real CREMA-D clips | p50 **80–90 ms** vs 388 ms per whisper-cli call; WER 1.7% (16 kHz) / 4.8% (8 kHz μ-law phone path) |
| Pre-synthesize the 3 displayed options (nothing sent before confirm) | A/B, `smoke --audio --choose-ms 2000` | confirmation→first audio **0–1 ms** (on) vs 938–1060 ms (off) when the user takes ≥2 s to choose |
| Noise floor 350→150 RMS + rolling 10th-percentile noise tracking | bench endpointing sweep | missed utterances **1/96** (was 14/96); 0 triggers on 3 s white noise up to RMS 400 |
| Segment durations from audio time, not wall clock | unit test reproduced drops on bursty delivery | bursty Twilio/WS delivery no longer drops speech |

Measured after: transcription ~815–850 ms (700 ms endpoint hangover + ~100 ms STT), generation 1.1–1.8 s (Gemini),
postConfirm 0–1 ms → **systemMs 2.0–2.5 s** with ≥2 s choosing time (scripted selection, not a human).
Not changed (insufficient evidence): 700 ms hangover — 500 ms showed 0 false splits, but CREMA-D clips are single short
sentences without mid-sentence pauses. Configurable via `STT_HANGOVER_MS`. Remaining largest stage: Gemini generation.
Pre-synthesis caveat: if the user confirms within ~1.5 s, three parallel `say` jobs are still running (observed
postConfirm 742–1175 ms in that case). Default on for the system voice, off for ElevenLabs (cost) unless `TTS_PRESYNTH=on`.

## Interface contract (backend ⇄ frontend) — `shared/protocol.ts`, `shared/metrics.ts`
Unchanged from last session (auth `?token=`/`?invite=`, `session_info`, logging consent, `audio_start` PCM, playback acks).
**New, all additive:**
- `ClientMessage mouth_gesture_select {candidateSetId, index, method, window?, framesUsed?}` → controller
  `gestureSelect` → proposal `source:'mouth'` with `Proposal.method` (e.g. `neutral-calibrated-mouth-gestures-v1`);
  same confirm guard/expiry/stale checks; rejected while speaking; confirmation still separate. Turn record gets
  `selectionMethod`. This is a gesture mapping, not lip-reading — UI should show `method`.
- `SpeechStatus.voice?` — the voice that actually spoke (set when the reply completes; names any fallback, e.g.
  `macos-say … — FALLBACK, personal voice failed: …`). Caller `audio` messages already carry the same value.
- `turnStages()`: new `postConfirmMs` (confirmation → first audio sent). **`systemMs` now = transcription + generation +
  postConfirm** (previously added synthesis + send; with pre-synthesis, synthesis overlaps the user's choosing time).
- `ClientMessage set_voice_policy {allowSystemFallback?, personalPresynth?}` and `ServiceStatus.voicePolicy:
  VoicePolicyStatus` (personalConfigured/Available, personalVoice, personalError, systemVoice, both choices,
  presynthActive). **Frontend request:** show the active voice and these two explicit toggles; show `personalError`.
- Note: `selectionMs` can be negative when a proposal arrives before the UI reported `candidates_displayed`.

### Backend responses to `docs/WORKSTREAM_SOL.md` requests
- `mouth_gesture_select`: **implemented as proposed** (+ tests). Sol may now drop the intermediate review tap.
- Actual voice label on `Snapshot.speech`: **implemented** as `speech.voice`.
- Caller PCM path: Sol's AudioWorklet 16 kHz mono PCM16 matches the backend contract (Sol's `test:microphone` run).

## Known blockers / open issues
- **Rotate access tokens once** (see `docs/DEMO_CHECKLIST.md` §0): Sol found the old Vite `fs.allow: ['..']` served
  `server/data/secrets.json` to the network-reachable dev server (status 200 observed; content not read). Fixed in
  `web/vite.config.ts`; rotation not done by Claude to avoid breaking the live human-test pages — user decides.
- No Twilio credentials/number; no ElevenLabs key. Tunnel not opened (needs user authorization).
- 1 unexplained text-smoke timeout seen last session (not reproduced in 12+ runs since; steps are labelled).
- `server/data/turns.jsonl`: 4 pre-consent test turns (left untouched; 7-day retention or `delete_turn_logs`).
- Gemini `3.8-flash` was overloaded/timing out when tested; default chain avoids it.

## Commands
```
cd server && npm run typecheck && npm test
cd server && npm start                    # :8790, spawns + supervises whisper-server on 127.0.0.1:8766
cd server && npm run links                # private user + caller URLs
cd server && npm run security:check       # live auth checks
cd server && npm run smoke [-- --audio "sentence"] [--choose-ms 2000]
cd server && npm run twilio:sim           # Twilio protocol simulator (NOT a real call; mark echo is simulated)
cd server && npm run twilio:preflight     # real-call readiness (read-only, no tunnel)
cd server && npm run bench:stt [-- --limit 96 --cli --endpoint-only]
cd server && npm run gemini:probe         # GEMINI_MODELS=a,b to compare
cd server && npm run voice:check          # real ElevenLabs check (needs key + voice ID)
cd server && npm run voice:policy-check   # live: no unapproved voice substitution (point TACIT_URL at an instance)
```

## Demo
`docs/DEMO_CHECKLIST.md` — separate pass criteria for A browser audio, B webcam selection, C personal voice, D phone.

## Exact missing steps
- **ElevenLabs:** in `server/.env` set `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` (the user's own cloned voice),
  `ELEVENLABS_VOICE_CONSENT=self`; run `npm run voice:check` (must report category `cloned`/`professional`); restart.
  Server refuses to present a premade/library voice or a failed check as personal (falls back to the labelled system voice).
- **Twilio:** set `TWILIO_AUTH_TOKEN`; user authorizes → `npm run tunnel` → `PUBLIC_URL=<https url>` → restart →
  `npm run twilio:preflight` all OK → number's Voice webhook POST `<PUBLIC_URL>/twilio/voice` → call it; success only
  when the human caller hears the reply.

## Next actions (backend)
0. **Mode 2 webcam VSR (parallel, needs user's ownership decision for `recognition/`):** proposed split — Sol: webcam
   capture + mouth-ROI/frames in `web/`; Claude: verify `recognition/` Auto-AVSR offline on real clips, then a backend
   recognition endpoint + additive `RecognitionResult` contract (announced here first). Recognized text still goes
   through explicit confirmation before playback. No AirPods work unless the user reopens it.
1. Support the human browser test with Sol (watch server log; collect `turnStages` per turn with logging opt-in if the user agrees).
2. Real Twilio call once authorized. 3. If keys arrive: `voice:check`, then repeat smoke/twilio:sim with the personal voice.

## Git
AGENTS.md → Git. Claude is the sole writer; Sol's `web/` is committed at Sol's recorded checkpoints.
