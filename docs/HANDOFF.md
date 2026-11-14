# HANDOFF — TACIT

**Last updated:** 2026-11-14 20:50 UTC (clock-checked; the previous session's "~20:45" stamps were estimates)
**Last working agent/model:** Claude Code, Opus 5.5 (backend, recognition, Git owner) — session "reviewed speech".
**Product:** Mode 2 only — silent speech → the user's voice inside an ordinary call (AGENTS.md top). Automatic speaking of
recognised words stays DISABLED.
**Start here:** this section, then `docs/DEMO_READINESS.md` (A = status, D.9–D.13 = this session, E.2 = Meet test).

## Hand-off (2026-11-14 20:50 UTC)
**Done this session (all pushed):** reviewed speech backend + contract (`7853bd8`, `614a261`); phrase-rule-v2 default
(`3a76e6a`); `npm run reviewed:check` (`e0894f3`); eval grouping fix (`665c8c4`); 5-best review candidates after the
first oracle top-K run (`3cb0871`); `npm run review` terminal review client (`605880a`); flip-TTA A/B, rejected
(`e4f668d`). :8790 was restarted twice (both times verified idle: Live off, output off, no app reading BlackHole) and
now runs all of it; Live and output were left OFF.
**Next, in order:** (1) Sol's review-and-Speak UI (web and/or notch) on the contract below — or use `npm run review`;
(2) the user's physical test DEMO_READINESS E.2 (reviewed speech → Meet listener) — the only way to claim remote
audibility of reviewed speech; (3) DEMO_READINESS E (live:test v2 + `--phrases`: first held-out numbers for v2 and
smile/swallow/listening controls); (4) only with ≥ 100 new labelled own silent clips: speaker adaptation experiment.
**Release targets (≤ 5% WER, ≥ 90% exact on ≥ 50 new silent utterances, 0 accepted non-speech): NOT VALIDATED.**
**Later (20:55–21:05 UTC):** `e583589` pre-synthesizes shown review candidates locally while output is on (tests 114/114;
needs a `./scripts/tacit.sh restart` to take effect — NOT restarted because Live was ACTIVE on :8790 at ~20:57 UTC,
someone was using it; at ~21:05 Live + output were PAUSED by that client, still not restarted). server.log at ~21:00
shows another client's `reviewed-recognition rendered` (request→audio 1810 ms) and `user-corrected rendered` (892 ms)
— most likely Sol's notch integration; Claude did not send those. Alternatives/personalisation desk review + `eval/enroll_knn.py` → `docs/research/VSR_ALTERNATIVES.md`.

## Interface contract — reviewed speech (`speak_reviewed`) — for Sol — 2026-11-14 ~20:30 UTC (`7853bd8`, additive)
All in `shared/protocol.ts`. Nothing existing changed meaning; `recognizedSpeechAllowed`/`autoTransmitAllowed` stay
literal `false` (they describe AUTOMATIC speech, which stays disabled). `speak_typed` is unchanged and must NOT be used
for recognised text.
- **`RecognitionHypothesis` (decision `'shown'` only) gains:** `generation` (Live generation it was recognised under),
  `alternatives: string[]` (other N-best decodes, raw), `reviewCandidates: ReviewCandidate[]`, `reviewExpiresAt`
  (server epoch ms; now +120 s). `ReviewCandidate = {kind: 'raw'|'alternative'|'phrase', index, text, textHash}`;
  index 0 = raw; a phrase appears ONLY if `phraseMatch.accepted` and is not already listed; `textHash` = lowercase hex
  SHA-256 of the UTF-8 text. Display these exact strings; do not re-case or edit them in the candidate list.
- **New `ClientMessage`:** `{type:'speak_reviewed', requestId, outputAuthorizationId, outputGeneration, liveAuthorizationId,
  liveGeneration, utteranceId, candidate, index, text, textHash}`.
  - Pick: `candidate` = the candidate's `kind`, `index`/`text`/`textHash` echoed exactly from `reviewCandidates`.
  - Correction: `candidate:'edited'`, `index` = the candidate the edit started from, `text` = the user's text (≤ 500
    chars), `textHash` = SHA-256 of exactly that `text`. Spoken verbatim, labelled `user-corrected` (user-authored —
    show it as "your correction", never as recognition).
  - `outputGeneration` = latest `output_status.generation`; `liveGeneration` = the hypothesis' `generation` (must equal
    current `live_status.generation`). Both REQUIRED.
- **Server refuses** (one `speech_delivery` with `state:'refused'` + reason) when: output not `ready` / paused / stale
  authorization / generation changed; Live not `active` / authorization or generation changed (any Live
  pause/resume/interrupt makes earlier utterances unspeakable — mouth again); utterance is not the LATEST shown one;
  expired; candidate kind/index/text/hash not exactly as shown; utterance already spoken (ONE speech per utterance,
  pick or correction); duplicate `requestId`; virtual mic not ready / queue full (these two do NOT consume the
  utterance — the user may press Speak again).
- **Delivery:** `SpeechDelivery.source` = `'reviewed-recognition'` or `'user-corrected'` (new `SpeechSource` values —
  the companion currently filters `source == "typed"`; extend it), plus `review: {utteranceId, liveAuthorizationId,
  candidate, index}`. States as for typed (queued → synthesizing → routing → rendered | refused | interrupted | failed);
  `rendered` is local only, never "heard". Output pause/stop and Live pause/interrupt/end cut it like any delivery.
- **UI rules (AGENTS.md policy):** no pre-selection, no auto-confirm, no timeout send, never LLM-edited; the Speak
  button needs an explicit press per utterance; hide/disable Speak once a newer shown hypothesis arrives, after expiry,
  or while output/Live is not active. ALL-CAPS model text is put in sentence case for synthesis only (server).
- Verified: server typecheck clean, `npm test` 109/109 at `7853bd8` (now 112/112; 11 new tests: candidates, latest-shown target, every refusal,
  once-per-utterance, route refusal retry, correction path, pause cut, sentence case); web typecheck clean against the
  new types; throwaway server on :8799 (fake recogniser, `TACIT_ROUTE=off`) over a real WebSocket: shown hypothesis
  carried `reviewCandidates`, a tampered text was refused, the genuine pick passed every check and was refused only at
  the (disabled) virtual-mic stage. Later, on the restarted :8790 with REAL recorded silent clips and the real route:
  `npm run reviewed:check` and `npm run review` rendered picks into BlackHole 16ch, all refusals held, stop → interrupted
  in 21 ms (DEMO_READINESS D.13). NOT yet verified: a human listener on the far end (DEMO_READINESS E.2).
- Since `3cb0871` the sidecar decodes 5-best: up to 4 `alternatives`. Since `3a76e6a` `phraseMatch.rule` is
  `'phrase-rule-v2'` and has optional `freeAttPerToken` (v2 rejects < −1.5 with reason "too little evidence of a sentence").
- Terminal fallback UI (backend-owned): `cd server && npm run review` — numbers speak candidates, `e N` edits, o/p/r/s.
  Pure message builder for clients to mirror: `server/src/reviewed.ts` `buildReviewedRequest`.

**Phrase-rule-v2: IMPLEMENTED** (`3a76e6a`, D.9: dev re-run reproduces the analysis exactly; NOT validated). Next for
false triggers: a pre-decode speech-likeness check once smile/nod/listening recordings exist (live:test v2 has them).
**Not to do:** LM fusion (D.8); flip TTA (D.12); tuning on the v1 held-out sentences or on dev data then calling it
held-out; enabling automatic speech; any LLM rewriting of recognised words.

## Verified status (2026-11-14 20:50 UTC)
| Item | Status |
|---|---|
| Google Meet remote audibility | **VERIFIED (human-observed):** BlackHole 16ch as Meet mic; the user's iPhone heard TACIT |
| FaceTime remote audibility | NOT YET TESTED |
| Typed synthesized speech | VERIFIED through a real call (Google Meet) |
| Silent recognition, held-out live v1 (frozen baseline) | **44% WER (11/25), 2/5 exact**, front-lit 127–130, end→shown p50 1385 ms; smile → wrong phrase accept; repeat ×3 → 1 window; pause 0 (D.7) |
| LM-assisted decoding | Rejected on dev data (worse everywhere, hallucinations, ~2× decode) (D.8) |
| Oracle top-K | Run on dev: reference in top-1/3/5/10 — own silent 6/7/8/10 of 20; CREMA-D 80/85/92/93 of 96 (D.10) |
| Phrase rule | v2 default (`3a76e6a`); dev: rest 4→0, tails 10→3, heads 2→1, in-list 37 kept; NOT validated (D.9) |
| Flip TTA | Rejected (D.12) |
| Reviewed mouth-to-call | Backend done; local route verified with real recorded silent clips (D.13); UI (Sol) + human Meet listener pending |
| Automatic recognised-speech transmission | STILL DISABLED. NO-GO open vocabulary and phrase mode |

## Restartable checkpoint (state at hand-off, 20:50 UTC)
- `main` pushed through the docs commit after `e4f668d`. Checks: server typecheck clean, `npm test` **112/112**;
  recognition unittests **15/15**; web typecheck clean (read-only check, Sol's files untouched). Running :8790 = current
  code; Live off, output off. No background jobs. Sol's uncommitted files (`docs/WORKSTREAM_SOL.md`,
  `macos/TacitCompanion/**` incl. new `ReviewedTextView.swift` etc.) are untouched and unstaged — Sol is mid-edit.
- New git-ignored artefacts this session: `recognition/data/eval/{phrase_rule_probe_v2,oracle_topk,tta_ab}.jsonl`,
  `recognition/data/eval_{phrase_v2,oracle_topk,tta_ab}.log` (private transcripts); `server/data/run/{driver,stop}.mts`
  (scratch test drivers, ignored).
- Licensing: the user stated (2026-11-14 ~20:40 UTC) they hold written permission from all authors to reuse code; no
  external code was copied this session anyway. Keep attributions/notices regardless.
- Previous session's commits: `4dda303` feat(server) per-window `win_*` diagnostics in hypothesis `stages`
  (+test); `24c2baf` feat(server) `live:test` v2 (fresh set, `--set v1` kept, 22 s repeat, 12–20 s non-speech incl.
  listening, arrival times, `--phrases`); `fd3c8d3` feat(recognition) `eval/lm_ab.py`, `eval/phrase_rule_probe.py`,
  `eval/oracle_topk.py`; then the docs commit (AGENTS.md policy, this file, DEMO_READINESS).
- Checks at hand-off: server typecheck clean, `npm test` **98/98**; recognition unittests 7/7; eval scripts compile.
  `live:test` v2 typechecked only (not run — it would pause an active Live session). Web untouched.
- Running server (`./scripts/tacit.sh start`, :8790 + sidecar :8765) was NOT restarted: it still runs the pre-`4dda303`
  code, so `win_*` keys appear only after `./scripts/tacit.sh restart`. No background jobs left running.
- New git-ignored artefacts: `third_party/visual/weights/lm_en_subword/` (215 MB LM, pinned rev f4e39b6d…, research-only
  terms); results with private transcripts in `recognition/data/eval/{lm_ab,phrase_rule_probe}.jsonl` and
  `recognition/data/eval_*.log`. The v1 live log: `recognition/data/live/2026-11-14T19-58-01-573Z-livetest.jsonl`.
- External code: SilentFlow fast beam already vendored (MIT notice in `tacit_vsr/fast_beam.py`). Lipflow / SilentFlow
  LM loading pattern followed (no code copied). Hushkey, Personalized-Lip-Reading, VALLR, VSP-LLM, phoneme-to-words-lm:
  not inspected this session. No LLM correction anywhere.
- Decoder still fast beam 10, CTC 0.1, no LM (top-1 unchanged); N-best 3 → 5 (`3cb0871`); gate thresholds and phrase list
  unchanged; phrase rule v1 → v2 default (`3a76e6a`, v1 selectable).

## Sol coordination / ownership (updated 2026-11-14 ~20:25 UTC)
- **Companion ownership TRANSFERRED to Sol by the user's explicit authorization (2026-11-14 ~20:25 UTC).** Steps per
  AGENTS.md → Git: Claude's Git operations were finished (`541611d` pushed); working tree inspected: clean except Sol's
  uncommitted `docs/WORKSTREAM_SOL.md` notes (+44 lines, preserved, not staged); `git status macos/` empty — no native
  companion edits in progress by anyone; Sol had edited no native sources.
- **Sol owns:** `macos/TacitCompanion/**`, `web/**`, `docs/WORKSTREAM_SOL.md`. **Sol may begin editing
  `macos/TacitCompanion/**` now.**
- **Claude owns:** `macos/TacitRoute/**`, `server/**`, `recognition/**`, `shared/**`, `scripts/**`, the rest of the
  AGENTS.md table, and ALL Git-write authority. Claude does not edit companion files while Sol implements the notch.
- **Sol does not commit or push.** Claude commits Sol's files only at a checkpoint Sol records as stable.
- Backend/shared interface changes are Claude's; Claude announces them in "Interface contract" below before Sol
  depends on them. Next announcement: the `speak_reviewed` contract (NOT started; the user deferred it to a new
  session — see Hand-off priority 1).
- Root `THIRD_PARTY_NOTICES.md` stays Claude-owned: Sol keeps companion-local notices for any MIT adaptation and asks
  Claude to add root entries.
- Sol's open companion notes (to fix after transfer): paused results accepted, nil-authorization equality, stale
  delivery generations, URL in error text; request for an additive per-utterance generation / session boundary on
  hypotheses — considered in the `speak_reviewed` contract.
- Frontend requests still open: show `phraseMatch` (display-only; v1 can be wrong on non-speech) and the brightness hint
  (`gate.mouth_brightness` < 90); the reviewed-speech review UI once the contract is published.

## Requests for Sol (frontend)
1. Send `outputGeneration: output_status.generation` with every `speak_typed` (additive, `d974748`): the server then
   refuses a message written before a pause/interrupt instead of speaking it later. The companion already does.
2. Live is now ended by the server when the socket that sent `activate` closes; other clients (companion) can only
   pause/resume/end. UI clients that miss a 10 s WebSocket ping are terminated (browsers answer pings automatically).
3. `speech_delivery` may now end `failed` with reason "audio rendered as silence".
4. NEW optional `RecognitionHypothesis.phraseMatch` (`800a9ea`): show "Phrase list match: … (display only)" or its
   rejection reason; never feed it to speech. `gate.mouth_brightness` < 90 → "too dark, light from the front" hint.
   End→shown latency = `stages.endpoint_wait + stages.upload + recognitionMs`. Consider `preRollMs` 160 → 400.
6. **Reviewed speech UI** on "Interface contract — reviewed speech" (top of this file). Do not reuse `speak_typed`;
   label `user-corrected` deliveries as the user's correction. Extend the companion's `source == "typed"` delivery filter.
5. NEW additive keys in `RecognitionHypothesis.stages` (`4dda303`, no type change): `win_start`, `win_end` (browser
   clock ms, from your header), `win_ms`, `win_frames`, `win_max_gap` — segmentation diagnostics; do not sum them into latency.

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
- **First webcam session `s1` (2026-11-14, partial 12 clips, backlit):** silent 13/20 = 65% WER (0/4 exact), voiced
  21/36 = 58% (2/8 exact), no-face 0, 555 ms per 5.5 s clip on MPS. Voiced ≈ silent ⇒ capture domain dominates.
  Mouth-ROI brightness 40–47 (CREMA-D 134–164); inter-ocular 88–89 px (CREMA-D 39–64). Variants (trim, contrast,
  gamma, CLAHE, BlazeFace, downscale) gave no consistent gain. Diagnostic scripts were throwaway (not committed).
- **Next (needs the user):** front-lit re-record (`record_webcam.py --check`, then `--name s2`), then `eval_session`.

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

## Interface contract — Live + voice output (for Sol; all in shared/protocol.ts, all additive) — 2026-11-14 ~10:45 UTC
Server :8790 restarted with this code (`./scripts/tacit.sh restart`). Auth unchanged: user WS `/ws?token=`.

**1. Live Silent Speech `tacit-live-v1` (unchanged wire format; ONE server-wide session since b0ba703)**
- Capability: `snapshot.services.recognition.live` when the VSR sidecar is healthy (reported as soon as it listens).
- C→S `live_control {action:'activate'|'pause'|'resume'|'interrupt'|'end', mode?, inputSource?:'camera'}`. `mode:'automatic'`
  is refused (live_status.reason). No caller/session needed for display-only.
- S→C `live_status {status}` on connect and after EVERY control from ANY client (the companion can pause your session).
  Detect your control's effect by a generation/state transition, never by "the next live_status".
- Per utterance: `visual_utterance {utteranceId, authorizationId, startMs, endMs, endpointMs, frameTimesMs[]}` then exactly
  frameTimesMs.length binary JPEG messages on the SAME socket (frames are matched per socket).
- S→C `recognition_hypothesis` exactly once per header, incl. rejects: `decision 'shown'|'abstained'`, `reason`, `rawText`
  (raw model output), `uncertainty {calibrated:false}`, `recognitionMs`, `stages`, `transmitted:false`, `stable:false`.
  Abstain reasons now include: duplicate utteranceId (per authorization), incomplete (new header / control / sender
  disconnect before all frames), "Recogniser busy" (>2 in flight per server — dropped, NOT queued), stale authorization,
  Live paused/off, frame-order/count/size/duration limits (300 frames, 12 MB, 10 s), no face tracked.
- Pausing/interrupting/ending Live also interrupts any speech output in progress. Last user client disconnect ends Live
  and stops voice output.

**2. Voice output into the virtual microphone (NEW)**
- `snapshot.services.voiceRoute: VoiceRouteStatus` and in every `output_status.status.route`: `state` 'unconfigured' |
  'starting' | 'ready' | 'unavailable' | 'error', deviceName/Uid, sampleRate, gainDb, calibrated, `readers` (bundle ids of
  apps currently reading the virtual mic — e.g. 'com.apple.FaceTime'; null = unknown; refreshed every 15 s), warnings
  (echo risk, muted), reason. `readers` non-empty is the only local evidence that a call app selected the mic.
- C→S `output_control {action:'enable'|'pause'|'resume'|'stop'}` → S→C `output_status {status: SpeechOutputStatus}`
  (`authorizationId` fresh on enable, `generation`, `state 'off'|'ready'|'paused'`, `voice` label, `queued`,
  `recognizedSpeechAllowed:false`). output_status is also unsolicited on queue/route changes.
- C→S `speak_typed {requestId, outputAuthorizationId, text}` — ONLY for text the user typed (AAC fallback), sent by an
  explicit action. ≤500 chars, unique requestId, needs state 'ready' + matching authorization + route ready; max 4 pending.
- S→C `speech_delivery {delivery}` for each state change: queued → synthesizing → routing (again with
  `timings.firstAudioAt` when audio starts) → exactly one terminal state: rendered | refused | interrupted | failed.
  Carries `outputAuthorizationId` + `generation` (added for Sol's correlation request), `source:'typed'|'recognized'`,
  `voice`, `reason`, `timings {requestedAt, synthStartAt, synthEndAt, firstAudioAt, renderedAt, endedAt}` (server ms).
  **`rendered` = written into the virtual mic on this Mac. `remoteAudibility` is always 'unknown'.** UI must not say
  "sent"/"heard" — say "spoken into <device>".
- Recognised words are never spoken (Live refuses automatic; ReliabilityGate = UNVALIDATED). UI must not copy model text
  into speak_typed (Sol already committed to this).

**3. What Sol may show:** Listening (Live active) · Recognising (utterance sent, awaiting hypothesis) · raw text "shown"
(display only, uncalibrated) · Speaking (delivery has firstAudioAt) · Paused · route state/device/readers/warnings ·
measured timings from the messages. Not: remote delivery, confidence %, "recognised speech sent".

**4. Integration tests that should pass:** server `npm test` (91), `npm run live:check`, `npm run speech:check`
(both against :8790); Sol: web typecheck/test/build + its live-recognition browser test against :8790.

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
