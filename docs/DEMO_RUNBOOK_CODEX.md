# TACIT demo runbook — independent Codex audit

Runtime evidence: **2026-11-14 23:23–23:33 UTC**, working tree at `c349a23` plus Sol's yielded, uncommitted notch. This is a readiness audit, not an accuracy evaluation. **Reviewed recognition is locally demonstrated in prior evidence; the complete fresh webcam → reviewed speech → Meet listener path still needs a human rehearsal. Automatic speech remains disabled.**

Only this report and the three `docs/demo-*-codex.*` helpers/tests are Codex's change. No Git writes, worktree creation, production edits, model loading/training, private recording reads, webcam activation, playback, routing changes, service restarts or app launches were performed. A separate worktree would omit the uncommitted completed notch and ignored runtime assets; inspection stayed in the current tree, with all additions isolated under `docs/`. Claude retains integration/Git ownership. HANDOFF, DEMO_READINESS and Sol's notes were read, not edited.

## Run this now: passive preflight

From the repository root:

```sh
node docs/demo-preflight-codex.mjs
```

It composes `server/scripts/preflight.ts` rather than replacing its camera/device/disk/calibration checks. Supplemental checks cover exact required model assets, recent authenticated Live capability, disabled automatic gate, **BlackHole 16ch** route identity, source/process and build timestamps, existing app signature, one companion instance, and reviewed protocol declaration/handler presence. Existing credentials stay in memory; no tokens or private URLs are printed. The existing credential loader can write its store, so this wrapper checks for matching stored credentials and executes that loader with Node filesystem writes restricted to tsx's temporary IPC directory. No dependency installation occurs.

Exit **1** = a failed check; **2** = unresolved actions; **0** = no reported failures/actions. Permission and human-hearing checks remain actions, so **2 is expected even on a healthy local runtime**. This is not a judge-ready certificate. No WebSocket is opened; Live/output authorizations are deliberately not probed. The recognizer freshness check uses canonical :8765; alternate ports need owner inspection. Timestamp checks detect possible drift, not exact loaded revisions.

Observed at 23:33 UTC: base preflight exit 0, supplement exit **2**, **0 supplemental failures / 6 action groups**. :8790 authenticated health succeeds; Auto-AVSR reachable on MPS; BlackHole 16ch ready, **44,100 Hz**, calibrated **+16 dB**, no warnings and **readers `[]`**. About **35 GB** free. Workspace HTML is served, and the packaged FaceLandmarker/WASM assets are nonempty. Existing companion signature valid, exactly one instance, no newer inspected native source than its executable. Camera hardware enumerated; browser permission/capture intentionally untested.

**Owner action after recording:** :8765 process started **20:57:03 UTC**, before current `recognition/tacit_vsr/{config,transcribe}.py`. The latest abstention floor cannot be assumed loaded. :8790 started **20:57:01 UTC**; its only newer inspected TS file was a test, not production code. `shared/protocol.ts` is newer than `web/dist/index.html`; reconcile/rebuild the served web artifact when idle. These direct observations take precedence over contradictory historical restart notes. Health exposes no loaded revision or reviewed-handler capability.

## End-to-end evidence checklist

**PASS** below means the stated scope only. **PENDING** is not a pass. Previous-session results are attributed, not fresh validations by this sprint.

| Stage | Evidence and status | Exact remaining check |
|---|---|---|
| Webcam → JPEG capture | **Prior local PASS:** real camera acquisition and recorded-input MediaPipe tests in WORKSTREAM_SOL. **Fresh:** device enumeration only | After recording, allow camera on the actual localhost origin; Start Live preview, one face tracked, current timestamps/windows changing |
| Articulation → endpoint | **Fresh unit PASS:** repeated motion, short/long pauses, gaps/face loss and duration bounds. **Human reliability PENDING:** DEMO_READINESS D.7 repeat ×3 yielded one window; D.11 explains an inconclusive trial timeout | Three separate natural sentences, each followed by a settled mouth and result; verify three distinct current windows/results |
| Frames → recognition candidates | **Fresh:** assets nonempty, recent Live capability, gate false; 115 backend tests pass. **Prior real silent result:** frozen live v1 44% WER, 2/5 exact (D.7); not tomorrow's adapted-model accuracy | New live utterance yields exact raw text/alternatives or explicit abstention; zero speech before approval |
| Candidates → notch → pick/Edit | **Prior local PASS:** Sol's actual native UI and recorded silent-input integration; 16 Swift tests, seven selftests (WORKSTREAM_SOL top checkpoint). **Fresh:** source audit, signed artifact and one instance | Fresh browser result reaches notch; no preselection; deliberately choose raw/alternative or Edit; new result clears old selection |
| Approval → `speak_reviewed` | **Fresh unit PASS:** hashes, candidate identity, generations, expiry, duplicate Speak, pause/stop and labels. **FAIL:** stale-review edge cases reproduced below | Rehearse one current pick and one correction; ordinary repeat/expired/paused review must not play |
| Synthesis → BlackHole 16ch | **Prior local PASS:** reviewed/corrected native render in Sol's checkpoint; D.13 backend reviewed route test, Stop interrupted in 21 ms. **Fresh:** ready/calibrated status only | Explicit Speak writes selected/corrected words once; confirm actual voice label. `rendered` is local, never “heard” |
| BlackHole → Meet microphone | **Prior human typed-speech PASS:** user's iPhone test in DEMO_READINESS A. **Fresh:** no app currently reading BlackHole | Select exact same device in Meet, unmute Mac Meet mic; inspect real local readers after refresh; no inference from a moving meter alone |
| Meet → remote listener | **Typed previously human-confirmed; reviewed/corrected path PENDING** | Second person/device reports actual words heard for raw/alternative pick and correction, and silence after Pause/Stop |

## Prepare before judges — only AFTER recording finishes

Commands below exist in the inspected source and were previously exercised according to HANDOFF/WORKSTREAM_SOL; mutating/device commands were **not rerun in this sprint**. Claude performs runtime integration. Keep the current app if it is already running; launching the Node executable twice creates competing instances.

```sh
# Owner: rebuild if artifact/source reconciliation requires it. Do not run during recording.
./scripts/tacit.sh build
# Owner: after recording, Live/output off and call idle, reload stale recognizer code.
./scripts/tacit.sh restart
node docs/demo-preflight-codex.mjs
# Only if the companion is not already running:
node macos/TacitCompanion/tools/open-companion.mjs
# Open the authenticated camera workspace without printing its private URL:
./scripts/tacit.sh open
```

For a stopped runtime use `./scripts/tacit.sh start` instead of restart. Prebuild/restart before the rehearsal, not in front of judges. Prefer the Node companion launcher over plain `open ...TACIT.app`: Sol observed GUI credential-file access blocking. Do not use `--selftest` for normal launch; it sends speech and changes shared Live/output state.

Arrange **two separate visible browser windows**, workspace beside Meet. Do not put Meet in another tab of the workspace window, minimize the workspace, or switch it to a hidden desktop: `visibilitychange` pauses capture and releases the camera. The notch has no camera of its own. Keep Meet's camera off to reduce camera contention. Start with front lighting and ordinary articulation; no tuning or held-out prompt rehearsal is part of this runbook.

Meet: **More options → Settings → Audio → Microphone: BlackHole 16ch**. Speaker/output: headphones or physical speakers, never BlackHole. Join the second device as an ordinary participant; mute its own microphone and have its listener use headphones or move away from the laptop. Unmute the Mac Meet microphone. Keep system audio defaults unchanged. Device menus and alternative microphone-arrow controls are documented in [Google Meet's audio setup](https://support.google.com/meet/answer/10409699?hl=en), checked during this audit. Do not use Meet Companion mode for the listening participant.

If local render succeeds but sound is clipped/suppressed, inspect Meet's Audio noise cancellation/Studio sound and rehearse with it disabled if available. This is a troubleshooting experiment, not a proven TACIT-specific cause; [Google documents noise filtering and account-dependent availability](https://support.google.com/meet/answer/9919960?hl=en). Freeze the setting that the listener actually verifies.

## Five-minute judge demo

| Time | Operator action | Expected behavior / honest narration |
|---|---|---|
| 0:00–0:35 | Show ordinary Meet participant and compact notch. State the currently displayed voice | “TACIT reads silent articulation. Recognition is experimental; I review what will be spoken. Today this is a labelled macOS system voice.” Do not call it a personal clone |
| 0:35–1:20 | In the visible camera workspace press **Start Live preview**; allow camera if needed. Mouth **“Thank you for coming.”** once, settle lips and wait | Genuine raw words/alternatives or abstention appear in workspace/notch. Nothing is spoken. This is a rehearsed example, not an unseen accuracy test |
| 1:20–2:05 | Notch **Review → Enable voice** if needed, wait for ready, then **Choose raw words** or an exact intended **Alternatives** entry → **Speak** | Enabling voice clears selection: choose again after it is ready. Exactly one approved candidate uses `speak_reviewed`. Listener repeats what they heard. If none is right, use the correction step instead |
| 2:05–2:55 | Mouth another sentence, e.g. **“See you tomorrow morning.”** Wait for its result. **Review → Edit**, enter intended words, then **Speak / Cmd-Return** | “This correction is written by me.” It remains bound to the current recognition through `speak_reviewed`, source `user-corrected`. Keep still while editing; if replaced/expired, mouth again. Listener repeats heard words |
| 2:55–3:45 | In native typed AAC, openly type a longer harmless sentence; Speak, then native **Stop** or **⌃⇧⌘.** during playback | “This is typed AAC to demonstrate immediate control.” Example: “This is a typed demonstration of the stop control. I can stop my voice at any moment during this ordinary call.” Listener confirms the cut and no later queued speech. Do this on stage only after physical rehearsal |
| 3:45–4:25 | Show paused/off state and refusal/cleared selection. Resume capture in the **original workspace**, enable/resume voice deliberately, mouth a fresh short sentence if time | Old review is unavailable; resuming server Live alone does not reacquire browser camera. Never promise automatic resume |
| 4:25–5:00 | Stop TACIT before leaving Meet; close with the measured limitation and next work | “Reviewed speech and this ordinary call are today's demonstration. Automatic transmission remains blocked until held-out reliability supports it.” Claim fresh remote audibility only for attempts the listener confirmed |

Budget at most two recognition attempts for one message; then take the transparent fallback. These phrases are low-stakes examples, not guaranteed recognition successes. Do not use medical instructions, emergency requests, payment details or a critical yes/no as demo content.

## Transparent fallback and recovery

**Recognition inaccurate, but a current hypothesis exists:** show the wrong raw result openly. In native Review use **Edit**, type the intended correction, Speak; label it **user-corrected reviewed speech**, not correct recognition. This still demonstrates approval, provenance, synthesis, routing and the ordinary call. Native selection/utterance checks were inspected; physical remote test remains required.

**No hypothesis / recognition unavailable:** say so. Open the native keyboard/typed AAC editor, explicitly type **“This message is typed while recognition is unavailable.”**, enable voice and Speak into the same Meet. This demonstrates typed AAC and call routing only. Do not paste decoder output into typed AAC or imply mouth-to-voice success. No prerecorded outputs or hidden voice substitutions.

**Native UI unavailable:** existing terminal fallback is `cd server && npm run review`. Browser still captures. `o` enables voice, an explicit candidate number + Enter speaks, `s` + Enter stops **voice output only**, `p/r` pause/resume **voice only**, `q` quits the client (not a whole-system Stop). Use only current displayed picks while waiting for Claude's terminal correction fix below; avoid `e N` editing. Keep the global native Stop/browser Stop accessible. After any pause or expiry, mouth again; never resend a saved request. Terminal output contains the displayed text, so do not save/share its transcript.

| Failure | Recovery |
|---|---|
| No new capture/result after using Meet | Return to original workspace; confirm it is visible and camera tracked, press Resume/Start Live preview. Then mouth afresh. Do not rely on notch “Resume server Live” |
| No endpoint / merged sentences / overload | Finish one short natural sentence, settle lips, wait for its result and review before the next. If still stuck, Pause then Start/Resume in workspace. Inspect window/drop counters; do not spam speech or retune thresholds |
| Speak disabled/refused/expired | Enable voice first, wait for ready, then explicitly select the current candidate. Review expires after **120 s**; Live pause/resume changes generation. Mouth again if stale. One successful/enqueued review consumes that utterance; synthesis failure may also require a new utterance |
| Local render but listener hears nothing | Stop output. Check Meet unmuted, exact BlackHole 16ch selection, actual local route identity/readers, second device volume/output. A browser bundle reading BlackHole does not identify which tab or prove remote hearing. Retry one explicit harmless typed probe, then reviewed utterance |
| Route disappears / helper crash | Stop; do not change system defaults. Owner inspects route/preflight. Helper is supervised; server retries route setup on a 15 s cycle. Wait for real ready status, then authorize and speak fresh text; no automatic replay |
| Recognizer/service/server crash | Stop/mute the Meet microphone if control delivery is unconfirmed. Owner reruns passive preflight and restores only the missing runtime when recording is over; `./scripts/tacit.sh start` if stopped, coordinated restart if needed. Reconnect, explicit Live and voice activation, new utterance, listener recheck |
| Ordinary Meet ends or reconnects | **Stop TACIT separately before leaving/rejoining.** TACIT's local Live/output session is not bound to a Meet call ID; Meet hang-up is not a TACIT cancellation acknowledgment |

## Reproduced failures for Claude — no production patch applied

Run safely, even during recording:

```sh
server/node_modules/.bin/tsx docs/demo-review-races-codex.mts
```

Expected **exit 1 while any issue reproduces**, with three `REPRODUCED` lines. This is a diagnostic failure, not a passing regression suite. It uses fake inference, fake synthesis/route, and the actual terminal source inside a VM with fake readline/socket IO; no real network, tokens, recordings or audio.

1. **High priority — terminal correction rebinds to a replacement utterance.** `server/scripts/review.ts:58` captures only index `i`; the answer callback calls `speak(i, txt)`, which reads mutable `latest` at submission. Repro: show A → begin `e 1` → show B → finish A's correction; request carries **B's utterance ID**. Hash and authorization checks do not protect the user's original choice because the client rebuilds a valid request for B. Claude: bind the edit to A's identity/generations/deadline and cancel on replacement/pause/reconnect. Test actual callback behavior. Workaround: native correction; terminal picks only.
2. **High priority — an older candidate remains speakable during a newer utterance.** `server/src/live.ts:118` accepts B without invalidating A's `reviewTarget`; `server/src/speech.ts:167` validates only the latest **shown** target. Repro: A shown → B submitted and inference pending → approve A; fake TTS is called. This conflicts with AGENTS' “a newer utterance exists” rule, while HANDOFF describes “latest shown.” Claude must reconcile that policy/implementation boundary; invalidate/block old review when a valid newer utterance is accepted, with an explicit decision for abstention recovery. Workaround: one message → wait → review/Speak → next message; do not mouth new words while reviewing old ones.
3. **Concurrency regression needed — older completion replaces newer review target.** `server/src/live.ts:188` assigns `latestShown` by completion order, with no utterance ordering check. Repro: submit A then B, resolve B first, then A; A replaces B and is published as shown. Two in-flight requests are permitted. This is a **module-level stress reproduction**, not a demonstrated live-camera incident: current browser serializes submissions and Python serializes inference, though threaded request preprocessing precedes its lock. Claude: define/enforce utterance ordering and test delayed older completion. No new sequence schema should be assumed by clients until Claude publishes it.

Other failure modes already covered by the freshly passing suites: duplicate IDs and Speak, incomplete JPEG batches, queue bounds, timeout/stale generations, candidate/hash tampering, paused/expired authorization, interruption during synthesis/playback, route loss/helper crash, unacknowledged Stop kill enforcement and EPIPE. Unit mocks prove guards, not physical cancellation latency or crash recovery in Meet.

**Documentation corrections for Claude:** root AGENTS still says reviewed implementation “not started”; DEMO_READINESS A/G/H still describes Sol's review UI as pending. Sol's top stable checkpoint and current source supersede those notes. Existing preflight's final parenthesis mentions only display-only + typed speech; its no-failure exit also leaves camera permission and call selection unresolved. The wrapper makes these actions explicit without changing Claude-owned files.

## Fresh safe validation and final physical gate

| Command/check run in this sprint | Result |
|---|---|
| `cd server && npm run typecheck && npm test -- --maxWorkers=1` | **PASS**, 115/115 tests, 12 files; no production services invoked |
| `cd web && npm run typecheck && npm test` | **PASS**, 79/79 tests; no browser/camera |
| `node --test docs/demo-preflight-codex.test.mjs` | **PASS**, 3/3: missing credentials not created; env mismatch cannot rewrite/print stored credentials; child filesystem write denied after passing token guard |
| `node --check docs/demo-preflight-codex.mjs` | **PASS** |
| `server/node_modules/.bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --strict --skipLibCheck --typeRoots server/node_modules/@types docs/demo-review-races-codex.mts` | **PASS** |
| Passive runtime preflight | **ACTION**, exit 2, local checks above; camera/remote test not passed |
| In-memory race diagnostic | **FAIL**, exit 1, all three issues reproduced; referred to Claude |

Not run: Swift rebuild/selftest, web build, browser/media suites, `live:check`, `live:stress`, `live:test`, `reviewed:check`, `speech:check`, `route:check`, recognition/eval/training. These may take shared session control, load MPS, read private clips or play audio. In particular **route:check writes calibration and plays a tone**; never run it with listeners or during recording, and never use `--force` as a demo shortcut.

After recording and owner integration, a human must complete these on the exact demo setup:

- [ ] One live physical camera sentence reaches the notch without any automatic speech; three consecutive sentences create three separately reviewable current results.
- [ ] Choose an actual current raw/alternative candidate and Speak; listener reports exact words heard **once**. Repeat separately with native Edit; record it as user-corrected.
- [ ] Leave a selection unused for >120 s, replace it with a new result, and Pause/Resume Live; each invalid old choice stays unspeakable. Duplicate Speak does not replay.
- [ ] Test Pause and Stop during pending recognition, then queued/synthesizing speech, then active playback; listener confirms no later stale speech. Physically test **⌃⇧⌘.** from Meet as well as native button. Treat a failed stop as a demo blocker; mute Meet immediately.
- [ ] Hide workspace and return: capture pauses and needs explicit workspace resume. Reconnect once in an idle rehearsal; old review is cleared and neither camera capture nor speech auto-resumes.
- [ ] Recheck Meet mic = BlackHole 16ch, physical output, listener volume, network and actual words after recovery. Local readers/meter/render are supporting evidence only.

Keep only a private minimal rehearsal note: UTC time, input live/typed, candidate kind or correction, heard yes/no/once, words matched yes/no, Pause/Stop result. No faces, audio, access links or private transcripts in Git. **The reviewed Meet demo is ready to claim only after those relevant listener checks pass; if they do not, demonstrate the transparent fallback and name the failed stage.**

Codex additions are stable and yielded for Claude's review. They remain untracked/unmerged; no ownership transfer or production integration is implied.
