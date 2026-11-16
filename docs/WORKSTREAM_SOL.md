# STABLE — Living Notch, subtle revision · yielded to Claude

Final checkpoint: 2026-11-15 05:26:41 UTC (clock checked). Codex has stopped editing the files below.
Claude remains sole Git writer and final integration owner. No Git writes, branch/worktree changes, backend edits,
release replacement, server restart or camera activation by this workstream. Please copy this checkpoint into
Claude-owned HANDOFF. The existing untracked `docs/demo-review-races-codex.mts` was preserved.

## Final interaction and appearance

User feedback superseded the initial large visible-pill target: the 310×64-point prototype was too prominent.
The final default is **264×38 points**, about half that area, with one quiet line (`tacit · Ready`, Camera live,
Interpreting, Words ready, Speaking, Paused or a real problem), restrained activity color and small affordances.
No icon tiles, second status line, idle animation, waveform or decorative particle system. Discreet is 224×28.
The attached neck uses the measured cutout; the entire interactive window sits below the macOS menu bar.
Actual notebook geometry: screen 1512×982 pt; cutout 185×32; visible menu-bar clearance 33 pt; display advertises 120 Hz.
Non-notch positioning also measures the visible menu bar; offset/negative-origin and small-display geometry is tested.

Hover dwell **160 ms** opens a **360×190 Peek**; it does not open the full workspace. Leaving returns after 380 ms.
Click / existing open shortcut opens the existing **460×350 workspace**. A genuine current review stays in Peek until
acted on, invalidated or expired. Speak sends the exact displayed candidate/correction through the existing dedicated
reviewed path, guarded by the rendered utterance and words; Edit opens and pins the existing correction editor.
Explicit collapse preserves the draft. Speaking stays in Peek with exact delivery text and direct Stop. Real-time
uses readable amber labels and actual deliveries, with no approval action for words already sent. Errors have a short
compact label and one recovery action in Peek. Notch appearance is available by right-clicking its status surface.

Astra's spring/model and motion source files remain unchanged. Fixed a controller retarget bug exposed by rapid
expand→collapse: a current-frame equality check could leave an older expansion running to the wrong dimensions.
All targets now reach the existing animator. Narrowed content animation to the status text to avoid overlapping
outgoing workspaces during rapid state changes. Native window shadow, quieter outline, press feedback, Reduced Motion
and contrast support remain. Explicit Edit now pins its workspace so focus loss cannot immediately hide the editor.
No changes to Client, capture, recognition, authorization, voice selection, duplicates, corrected-draft recovery,
Help Me Respond, Presence, camera pipeline, output route or emergency cancellation implementations.

## Evidence and exact checks

- Baseline Swift **80/80**; final Swift **89/89**, 0 failures. Command:
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test --package-path macos/TacitCompanion --scratch-path macos/TacitCompanion/.build/living-notch-build`.
- Isolated release build and `codesign --verify --strict` PASS. Final isolated binary `--offline-selftest`: **10/10** PASS.
  `tools/build-living-notch.sh` uses its own scratch directory and `.build/TACIT Living Notch.app`, a distinct bundle ID.
  It copies only the installed release's non-secret bundle configuration. Canonical `.build/TACIT.app` is untouched.
- Actual normal panel dimensions **19/19**; final Reduced Motion preview dimensions **19/19**. Fixture captures are
  explicitly marked TEST/OFFLINE. They are not real camera activity, recognition or speech.
- Genuine existing silent clip → live recognizer → current native Peek: two final results took **1528 ms / 1028 ms**,
  each with 5 real candidates, `transmitted:false`. Explicit native Peek Speak then produced actual
  `reviewed-recognition` queued→synthesizing→routing/first audio→rendered at BlackHole. Remote audibility remained unknown.
  Earlier actual Edit / Cmd-Return also produced `user-corrected` output; final Edit pin/focus and expiry preservation
  were exercised in the UI. No recognition accuracy or fresh live-camera/human-call claim.
- Every shared-runtime QA activation first required Live/output off and known zero readers. QA ended its own session.
  Final isolated connected preview PID 27862 is running, collapsed, with Live/output off and zero readers.
  Original release process 87493 was never stopped. Its executable SHA-256 remained
  `605c1730bcc1f483726fa7adf7a43dd49dfd5411236b894a86bb9ac882ecdcd4`.
- `git diff --check -- macos/TacitCompanion docs/WORKSTREAM_SOL.md` PASS. Native source compiles with pre-existing
  AVFoundation Sendable warnings. No new dependency or backend/shared/web test changes.

Evidence is ignored under `macos/TacitCompanion/.build/living-notch-evidence/subtle/` (README describes provenance).
Actual final CUA screenshots: `real-compact.jpg`, `real-review.jpg`, `real-speaking.jpg`, `real-return-compact.jpg`.
`real-review-expired.jpg` is expiry/recovery, not an editor screenshot. Final camera/error/Real-time/Discreet/Edit and
Reduced Motion appearance are offline fixtures in `reduced-motion/`. Physical pointer hover, full VoiceOver user
navigation, multi-display hotplug, 1920×1080 full-desktop/standing-distance legibility, new live-camera use and remote
listener confirmation remain unverified. Global shortcuts are retained by the running release during side-by-side QA;
this preview cannot claim to replace their registration before Claude integrates the single normal app.

## Motion measurement limits and profiling incident

The actual window notification harness measured resize callbacks at **8.34 ms median / 15.96 ms p95**, with rapid
reversals and canceled hover dwell. This is scheduling cadence, not presented FPS. Instruments' bitmap-capture/scene
switching workload reported 33 hitches (8.33–283.33 ms), including launch/snapshot overhead. A separate interaction-only
trace failed export with `Document Missing Template Error`. No steady 120-FPS or hitch-free claim is made.
Attempts at a short native-window recording returned stale frames; provisional videos/frame sequences were removed.
Screenshots are retained as evidence; no invalid motion clip is delivered.

An initial Instruments metadata export included inherited AWS credential environment values in tool output.
Raw profiler traces/exports were removed; only aggregate measurements remain. The affected AWS credentials should be
rotated. Subsequent isolated profiling launches used an empty, explicitly allowlisted environment. No credentials were
written into source, instructions, bundles, workstream notes or retained aggregate artifacts.

## Files yielded — one cohesive native UX change

- Sources: `IslandGeometry.swift`, `IslandController.swift`, `IslandView.swift`, new `LivingNotchPresentation.swift`,
  `ExperienceLab.swift` (fixture states, geometry evidence and offline interaction playback).
- Tests: updated `CompanionTests.swift`; new `LivingNotchTests.swift` (9 tests).
- Tool: new executable `macos/TacitCompanion/tools/build-living-notch.sh`.
- This `docs/WORKSTREAM_SOL.md` checkpoint. No other owned workstream files changed.

Design references (viewed only; no source/assets shipped):
[boring.notch](https://github.com/TheBoredTeam/boring.notch) and [Atoll](https://github.com/Atoll-Labs/Atoll).
Existing MIT notices remain unchanged. Claude may review/stage these stable files now. Integrate/rebuild/relaunch only
when the runtime is idle and no calling app is using the route. Rollback remains the untouched canonical app/binary.

---

# STABLE — YIELDED FOR CLAUDE · isolated native experience

Final checkpoint: 2026-11-15 01:47:49 UTC. Sol yields all companion files listed in
[NATIVE_EXPERIENCE_HANDOFF_SOL.md](NATIVE_EXPERIENCE_HANDOFF_SOL.md); research/concept selection is in
[NATIVE_EXPERIENCE_RESEARCH_SOL.md](NATIVE_EXPERIENCE_RESEARCH_SOL.md).

Worktree: `/Users/tanushsavadi/.codex/worktrees/564f/HackUMass 26'`. Detached HEAD at
`e710dfe27e7438a1426ffc92a7d9345f4542c27f`; no branch/Git writes by Sol. Main worktree untouched.
36/36 Swift tests, 10/10 release offline selftests, release/signing, and 9/9 actual panel dimensions passed.
Astra motion files yielded; no active editors. Hold, saved phrases, inline correction/composition and local
response starters are implemented. AI generation/live meeting capture remain unavailable. Physical calls/AAC-user
accessibility validation remain. Durable artifacts/source inventory in companion `.build/experience-evidence/` (ignored).
Claude: read the new handoff, inspect explicit source files, preserve latest main safety changes, and run safe offline
verification before integration. Do not run the original live selftest during active calls. No commit/merge/push by Sol.

---

# STABLE — yielded for Claude

**Native notch + reviewed-speech checkpoint · 2026-11-14 21:09 UTC. Sol has stopped editing all files listed below and explicitly yields them to Claude for review, atomic staging/commit and push. Claude remains the sole Git writer.** No Git writes by Sol. All earlier frontend checkpoints below are historical; this section is authoritative for the companion.

## Delivered native experience

- Primary island **420 × 258 points**, no scrolling. Small identity/status, at most three lines of exact raw text, one context-dependent action, typed fallback, secondary menu and immediate Stop. No settings dashboard, route jargon, large empty card or permanent text editor in the notch.
- Collapsed island measures the physical notch from NSScreen safe-area/auxiliary areas; tiny genuine activity dot and Pause when Live/voice is enabled. No idle waveform or animation loop. Non-notch fallback, selectable display and screen/wake repositioning implemented. Normal launch is menu-bar only; no automatic keyboard focus. Hover dwell 180 ms, leave delay 550 ms, measured-result reveal five seconds; actual NSPanel frame shrinks on collapse.
- Deep black shell, restrained mint activity, soft notch shoulders. Motion respects Reduced Motion; high-contrast mode strengthens the silhouette outline. Real native accessibility tree inspected. Editors take keyboard focus only after an explicit action; Escape dismisses them/collapses keyboard-opened island.
- Typed AAC opens separately in a **440 × 285 pt** editor. Correction editor uses the same compact size. Text is user-authored, retained in RAM only, limited to 500 UTF-16 code units. Cmd-Return Speak and Command-A editing verified in the real native editor. Diagnostics/route controls open in a separate intentional utility window. Menu-bar fallback has the same compact controls.
- Raw text remains exact. Real mouth brightness <90 produces a concise lighting warning; exact phrase result/rejection, model, actual voice, route/readers/warnings and detailed timing are in the transcript/diagnostics surfaces. Compact latency appears only when all published timing fields exist. Local render never means remote audibility.
- Pause, End Live, voice Enable/Pause/Resume/Off, Stop and global shortcut registration preserved. Open/Stop hotkeys now dispatch only their own Carbon event IDs (a real bug found when adding the second shortcut). Stop is always available in the compact surface and editors.

## Reviewed speech — integrated with Claude's published contract

Consumed HANDOFF's dedicated `speak_reviewed` contract (`7853bd8`); no shared/backend edits. Review is offered ONLY for actual, current `reviewCandidates` with valid exact hashes, matching Live authorization/generation and unexpired server deadline. No preselection. User chooses exact raw/decoder/phrase candidate, or deliberately opens Edit. No AI suggestion invented; alternatives are labelled decoder alternatives or phrase-list candidates.

Speak sends only `speak_reviewed`: exact candidate kind/index/text/hash, utterance ID, Live authorization/generation and current output authorization/generation. Edits get their own SHA-256 and `candidate: edited`; the server labels them `user-corrected`. Never routed through `speak_typed`. New hypotheses, pause, generation changes, replacement, reconnect and expiry clear review selection; submission is locally locked until a refusal or new utterance. No automatic transmission or timeout send.

Native receiver rejects nil/wrong authorization, paused or stale-generation results, duplicate utterances and old output deliveries. Reconnect clears all server-derived state. Send errors no longer expose potentially credential-bearing localized URLs. Credential reading happens off the UI thread, so macOS Documents access cannot freeze the shell at startup.

## Exact files yielded

All paths below are the complete cohesive native change; tests/notices/tools belong with it:

- `macos/TacitCompanion/Package.swift`
- `macos/TacitCompanion/build-app.sh`
- `macos/TacitCompanion/THIRD_PARTY_NOTICES.md`
- `macos/TacitCompanion/Sources/TacitCompanion/App.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/Client.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/HotKey.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/SelfTest.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/IslandController.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/IslandGeometry.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/IslandView.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/CompanionContent.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/Presentation.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/ReviewedTextView.swift`
- `macos/TacitCompanion/Tests/TacitCompanionTests/CompanionTests.swift`
- `macos/TacitCompanion/tools/open-companion.mjs`
- `macos/TacitCompanion/tools/recognition-check.mjs`
- `docs/WORKSTREAM_SOL.md`

No web source changes in this sprint. Local screenshots under `web/evidence/native/` are ignored and must NOT be committed. No edits by Sol to server/shared/recognition/TacitRoute, root notices, AGENTS or HANDOFF; concurrent Claude work preserved. Suggested coherent commit subject: `feat(macos): add compact notch and explicit reviewed speech`.

## Actual verification

| Check | Result |
|---|---|
| `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test --package-path macos/TacitCompanion` | **16/16 PASS**, 0 failures, final run 2026-11-14 21:03 UTC |
| `macos/TacitCompanion/build-app.sh` | **PASS**, release `swift build -c release`, app assembled, ad-hoc signing + `codesign --verify --strict` passed; final package 21:05 UTC |
| `node macos/TacitCompanion/tools/open-companion.mjs --selftest` | **7/7 PASS**, exit 0, final run 21:05 UTC: typed local render, paused-send block, voice pause/resume, Live pause/resume, Stop to off/off |
| Native reviewed selection → Speak | Actual UI Choose raw words → Speak; real existing silent video → real Auto-AVSR → 5 actual candidates → `reviewed-recognition` queued/synthesizing/routing/**rendered** at BlackHole, remoteAudibility unknown |
| Native correction → Speak | Actual Edit, Command-A, entered test correction, Cmd-Return; dedicated endpoint produced `user-corrected` → **rendered**, no raw-to-typed shortcut |
| Native Pause and stale review | Actual Pause cleared review/words, Live paused, voice paused; no prior candidate selected on next utterance |
| Native emergency interruption | Actual 287-character typed test reached routing/first audio; native Stop button produced **interrupted**, Live off and voice off |
| Actual visual inspection | Collapsed, compact Ready, Live/raw result, compact Review with no preselection, Paused, separate typed/correction editor, longer two-line incorrect raw output and genuine low-light warning inspected using CUA |
| Safety/geometry tests | Active authorization, duplicate rejection, generation/expiry, hash mismatch, output-scoped delivery, reconnect clearing, exact correction/hash, paused typed block, stale notice, notch/negative/offset/non-notch geometry and 420×258 bounds passed |
| Tools | Both `.mjs` files `node --check` PASS |
| Whitespace | `git diff --check -- macos/TacitCompanion docs/WORKSTREAM_SOL.md` PASS |

Integration inputs were EXISTING private silent recordings (development sessions B/C), replayed as timestamped JPEGs into the real backend by the companion-owned QA harness. They are **recorded input**, not a fresh live-camera/human evaluation, independent accuracy test or demo of browser capture. No accuracy claim, no reference-based correction, no private transcript written here. Wrong longer raw output was preserved and visually inspected, alongside genuine measured lighting feedback. Timings on these protocol replays are not physical human end-to-text measurements. Automatic transmitted remained false.

All shared-runtime test runs checked Live/output off and known zero route readers before activation. QA ended its own sessions; final selftest left Live and output off. Existing backend was not restarted by Sol. App is left running in **normal menu-bar mode**, final release, connected and collapsed, no camera activated by the companion. No QA harness left running.

## Real screenshots and provenance

Actual final release screenshots saved via CUA, not renders/mockups:

- `web/evidence/native/final-collapsed.png` — normal menu-bar release, real Ready state, measured physical-notch shell (522×80 raster at 2×).
- `web/evidence/native/final-expanded.png` — normal release, compact Ready state (840×516 raster = **420×258 pt**), all basic controls visible.

Live, Review, Paused, correction and longer/low-light states were also captured and inspected in this session's CUA tool output. Those additional images are not claimed as saved local artifacts. Some screenshot calls during resizing returned stale partial compositor images; re-binding the current native app and capturing the settled state showed the complete correct panel. Final saved images are the settled normal-release states above.

## Exact launch / check commands

From the repository root, with the local runtime already running:

```sh
macos/TacitCompanion/build-app.sh
node macos/TacitCompanion/tools/open-companion.mjs
node macos/TacitCompanion/tools/open-companion.mjs --selftest
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test --package-path macos/TacitCompanion
```

The launcher supplies the existing user token via the child's environment, never argv/logs/bundle or new storage. This avoids requiring an ad-hoc GUI build to read the entire Documents folder. Plain `open macos/TacitCompanion/.build/TACIT.app` also works when that app has file access, but this machine exhibited a blocking macOS credential-file open under GUI launch; **use the Node launcher for the demo**. `--inspect-ui` is an optional development flag (temporary normal app/Dock presence, keyboard-opened/pinned island); normal launch does not use it.

Optional QA, only while the shared runtime is idle/no route readers:

```sh
node macos/TacitCompanion/tools/recognition-check.mjs /absolute/path/to/existing-clip.mp4
```

Harness commands: `send`, `pause`, `resume`, `voice`, `end`. No audio automatically follows a recognition. Voice commands authorize output for explicit native Speak only. Harness closes after four minutes, owns its authorization, stops only output it enabled, prints metadata without transcripts/tokens, and deletes its temporary JPEG files. It refuses an already-active session.

## Browser handoff and physical Meet procedure

The browser STILL owns camera capture. Open workspace is an explicit private localhost URL handoff (no camera activation). Keep the **original camera workspace visible in its own browser window** beside Meet. Hiding the tab pauses capture; the native primary action then says **Resume in workspace**. A secondary menu retains server Resume, but that alone does not reacquire browser camera capture. No promise of background recognition, automatic capture restart or native webcam ownership.

1. Launch with the Node command above. Open workspace, light face from front, Start Live preview once. Verify genuine current text appears in the notch; it must not speak automatically.
2. In Google Meet select **BlackHole 16ch** as microphone. Open TACIT diagnostics to check real route/readers; enable voice once before the mouth-to-call test. Join a second device/person. A nonempty local reader list is not remote-audibility proof.
3. Mouth a NEW silent sentence, wait for raw result. Review → deliberately choose an actual candidate, or Edit exact intended words → Speak. Ask the remote person what they actually heard; record success/failure separately. This new physical reviewed path has **not** been human-verified in this Sol sprint.
4. During speech press native Stop; also physically check ⌃⇧⌘. before presenting. Pause must clear review/cut output. Resume capture in the original workspace, then mouth again; old results must remain unspeakable. Stop must not automatically reopen the camera.
5. Typed AAC is one keyboard icon away. Compose your own fallback sentence; do not paste raw recognition into typed AAC to imply recognition-to-voice automation.

## Limits / next priorities for Claude and human test

- Physical Google Meet audibility of the NEW reviewed/corrected flow, whole-system stop latency, physical keyboard shortcut dispatch, full VoiceOver user navigation, Reduced Motion toggling, fullscreen/multi-monitor rearrangement/hotplug and prolonged conversation are **unverified** here. Native AX labels, standard editing/Cmd-Return, code-level reduced-motion behavior and geometry regression tests are verified as described above.
- Recognition accuracy remains the frozen human baseline **44% WER, 2/5 exact**; the ≤5% / ≥90% release target is **NOT VALIDATED**. The notch does not improve recognition accuracy or false-trigger handling. Automatic transmission remains disabled.
- No native articulation/capture-freshness/recognition-processing signal is published. UI says Live preview for the real server session, and Preparing voice/Speaking only for actual speech-delivery state/firstAudioAt. Minimal additive browser-capture status could improve the Resume handoff later.
- No LLM suggestion schema used. Actual decoder alternatives/phrase candidates only. No speculative WRITE/ACT work.
- Small MIT adaptations: NotchDrop `Ext+NSScreen.swift` at e70b3d715a99e47de6eb823540282eafc7401a3a (notch measurement), Cyclop `NotchPanel.swift` at 8d1b9b2045979dc7bbe742994d1cd89d51090d65 (nonactivating panel/edit dispatch). Full notices retained in companion-local THIRD_PARTY_NOTICES and bundled Resources. Coucou/CodeIsland were references; no GPL code copied. Claude may add root notice entries; root file was not edited by Sol.
- Failures fixed in this sprint: initial oversized dashboard redesigned; Carbon hotkey cross-dispatch fixed (first fix briefly failed Swift C-callback compilation because of dynamic Self, corrected to concrete HotKey); GUI token read moved off UI thread + safe terminal launcher; stale notices/results/deliveries and malformed hash candidates rejected. All final checks above are after these fixes.

**Explicit yield: Sol is finished editing the 17 listed files. Claude may commit them now.** Build output, private recordings and ignored screenshots must remain out of Git. No required source work remains for this native checkpoint.

---

## Demo readiness · 2026-11-14 ~11:55 UTC

The page a person opens is one screen: last recognized words, Start / Pause / Stop, and a readiness list. Setup and Presenter stay behind those two controls. No new pages.

### Readiness, from published fields only
Ready, Needs setup, Experimental, Unavailable, or Unknown.

Observed on the live backend: connection Ready, display-only recognition Ready, silent-speech reliability Experimental, automatic transmission Unavailable, BlackHole 16ch with `readers: []` is Needs setup, remote audibility Unknown. A ready device with zero readers is not described as a FaceTime connection. FaceTime is named only if `readers` contains `com.apple.FaceTime`. That still does not mean someone heard the audio.

### Recovery fixed
Chrome did not emit `ended` when a capture track was stopped (`readyState` became `ended`, event count 0). The camera stayed on “Preparing input”. The vision hook now also watches `readyState`. `npm run test:recovery` then passed: permission denial, camera end, background pause, stop, reconnect, no `speak_typed`, no `mode: 'automatic'`.

### Verification this pass
- typecheck passed. `npm test` **79/79** passed. production build passed.
- `npm run test:recovery` passed. `npm run test:browser` passed, including the four axe states. `npm run test:vision` passed (123 frames, one window, 542 ms endpoint, preview only).
- `test:live`, `test:microphone`, and `test:replay` were not repeated. The prior live run still stands for voiced-clip recognition. This pass did not change that transport.

### Contract gaps for Claude
- Calling-app selection is only `VoiceRouteStatus.readers` (`null` unknown, `[]` none, otherwise bundle ids). There is no separate “selected in FaceTime’s menu” field.
- `SpeechDelivery.remoteAudibility` is the literal `unknown`. There is no message for a person’s confirmation.
- Nothing in the protocol aggregates a demo-ready bit. The checklist is derived in the browser.

### Human test and freeze
Follow `web/HUMAN_TEST.md`: silent mouthing, typed speech with a second listener, then pause / stop / reopen. Do not record faces. Frontend feature work stops here.

# TACIT frontend workstream · Codex

Updated 2026-11-14. Ownership: `web/` and this file only. No Git commands or backend/shared edits. The web surface is frozen as setup, calibration, accessibility fallback, and demonstration.

## Connected backend · 2026-11-14 ~11:40 UTC

Sol's uncommitted Live workspace was preserved and finished against the running backend. The backend process on 127.0.0.1:8790 was not restarted. Claude remains the only Git writer.

### What changed
- Vite's default proxy target is `http://127.0.0.1:8790` via the existing `TACIT_SERVER` override. The previous dev server had `TACIT_SERVER=http://localhost:8791` and nothing was listening there, so `/api/health` returned 502. That process was stopped and Vite was restarted with the canonical target. Authenticated `/api/health` through :5173 then returned 200, recognition reachable, `tacit-live-v1`, `automaticSpeechValidated: false`.
- `LiveSocketPort` acknowledges `live_control` only when a later generation has the state and authorization that action produces. An unsolicited, stale, or competing `live_status` does not complete a different control. A replaced authorization drops local recognition instead of keeping the old id.
- `SpeechOutputPort` accepts a `speech_delivery` only when `requestId`, `source: 'typed'`, `outputAuthorizationId`, and `generation` match the authorization this browser enabled. Recognized hypotheses are not copied into `speak_typed`.
- Everyday status shows the virtual-microphone device, route state, and readers. Typed delivery uses `speech_delivery`, including `firstAudioAt` as "Speaking into \<device\>". Copy states that remote audibility is not verified. Browser-caller playback stays a separate "Caller playback" / "Browser caller" status.
- A server Live status that no longer matches this browser pauses local capture without sending a second `end` over a session the server has already replaced.

### Verification
- `npm run typecheck`: passed.
- `npm test`: **74/74 passed**.
- `npm run build`: passed (Vite production build, repeated once after disk space was recovered).
- `npm run test:browser`: passed. Authenticated workspace, four viewports, zero axe violations on the checked states, zero legacy confirm/select messages, zero uploads before Live.
- `npm run test:microphone`: passed. Synthetic mic → AudioWorklet → server Whisper. Transcript was “Okay, it is Sam, are we still on for dinner tonight?” for the fixture “Hey, it is Sam. Are we still on for dinner tonight?” Zero unsolicited audio frames. No application exceptions.
- `npm run test:live`: passed with no TACIT caller. Recorded **voiced** CREMA-D `1040_IEO_NEU_XX` through the browser camera path, real MediaPipe, timestamped JPEGs, and Auto-AVSR. This is not a silent-speech measurement. Raw results included `IT'S ELEVEN O'CLOCK` (`shown`, `transmitted: false`, `stable: false`, uncalibrated uncertainty). One in-flight pause came back `abstained` with the words cleared. Resume produced another `shown` result. Reconnect did not resume upload. Measured recognition times in that run: 992 ms, 559 ms, 383 ms, 238 ms (abstain), 389 ms.
- `npm run test:vision`: passed. Recorded face, 122 frames, one motion window, 522 ms endpoint. Preview only.
- `npm run test:replay`: passed. All five recorded scenarios.

### Output route observed
Authenticated health reported `voiceRoute.state: ready`, device **BlackHole 16ch**, `readers: []`, calibrated. The workspace shows that device as a local route and says remote audibility is not verified. No calling app was reading the device during these tests. Typed AAC was not spoken into the device in the browser runs; the delivery rules were checked with protocol fixtures, not a live TTS playback.

### Still required
- Human silent articulation on held-out prompts before any automatic transmission. `recognizedSpeechAllowed` and `autoTransmitAllowed` remain false.
- A person at the far end confirming what they heard. Browser playback and virtual-mic render do not establish that.
- A calling app actually selecting BlackHole, so `readers` is non-empty, before treating the route as in use.
- The disk was at capacity during the last browser re-run (`ENOSPC`). Regenerable Vite cache, `web/dist`, and one orphaned Playwright profile were removed, then the build and the browser/microphone tests were run again successfully. `web/dist` is gitignored.

### Yield
Owned files are stable for Claude's atomic commit. Do not stage unrelated backend, shared, or native edits. Suggested subject: `feat(web): connect display-only Live recognition and virtual-mic status`.

## Implemented

- Quiet Precision communication UI: three dominant reply cards, current caller transcript, separate gesture highlight / reviewed proposal / confirmed speech, transport/model disclosure, conversation history, optional diagnostics, isolated preview and simulated-call tools.
- shadcn Button/Card patterns adapted to local tokens (Radix Slot + CVA); Phosphor icons. Manrope + DM Sans self-hosted with SIL OFL licenses. `web/DESIGN.md` records direction and refinement passes.
- Genuine opt-in getUserMedia → ImageBitmap → MediaPipe CPU worker → landmarks/blendshapes. Assets are local. No frame upload. Camera shutdown and model errors clean up streams/workers.
- Replaceable `VisualRecognizer` interface. Experimental neutral-calibrated open-mouth/smile/pucker strengths, dominant-gesture threshold + margin, 900ms continuous hold, neutral rearm, candidate-context and tracking-loss resets. Not phrase recognition or calibrated probabilities.
- A mouth gesture currently creates a LOCAL highlight. User taps Review selection → existing tap_select → separate backend confirmation. Source remains truthfully tap. No invented protocol message and no auto-confirm.
- Default route uses authoritative `/ws` snapshots; `?preview=1` uses a separate no-audio fixture adapter. `/#caller` uses the real caller channel with role-scoped invite handling, explicit microphone enablement, actual audio-element playback events, and cleanup on cancel/end.

## Files

Modified: `web/src/UserPage.tsx`, `web/src/useTacit.ts`, `web/src/CallerPage.tsx`, `web/index.html`, `web/package.json`, `web/package-lock.json`.
Added: `web/src/styles.css`, `web/src/candidateState.ts`, `web/src/access.ts`, `web/src/components/ui/{button,card}.tsx`, `web/src/vision/{features,recognizer,useVision,useMouthControl,landmarker.worker}.ts`, `web/src/dev/previewAdapter.ts`, `web/tests/{vision,candidateState,access}.test.ts`, `web/tests/browser-smoke.mjs`, `web/public/{models,mediapipe,fonts}`, `web/public/{ASSETS.md,favicon.svg}`, `web/DESIGN.md`, `web/README.md`, screenshots under `web/evidence/`.

## Verification so far

- Baseline typecheck failed because starter imported missing HeadControl. Replaced that integration with the mouth prototype.
- Frontend typecheck/build passed after implementation; 17/17 frontend tests passed (feature extraction, temporal hold, ambiguity, tracking gaps, candidate changes, neutral calibration/rearm, proposal validity, confirmation guards, stale fixture IDs, cancellation).
- Playwright drove preview select → early confirmation disabled → cancel → keyboard select → explicit confirm; no audio generated.
- Real FaceTime HD camera stream opened at 640×480, 30fps. MediaPipe worker initializes and processes it. No face in view, so physical gesture-performance/accuracy testing is pending.
- Browser found and fixed real module-worker error `ModuleFactory not set`: SDK 1.2.3 supports `FilesetResolver.forVisionTasks(path, true)` for its ESM WASM loader. No eval or patched vendor files.
- Same worker tested on 12 actual frames from existing `recognition/eval/clips/cremad/1030_ITS_NEU_XX.flv` converted temporarily to MP4, with no audio. Face tracked in 12/12 sampled frames. Jaw/smile/pucker and mouth geometry varied. This is recorded-clip processing evidence, NOT gesture accuracy or live facial-motion evidence. Observed inference range in this one run: 10.4–62.4ms (warmup/device-specific, not a product latency claim).
- SDK writes XNNPACK informational startup output to console.error and emits graph warnings; distinguish these from application exceptions. Initial favicon 404 fixed.
- Two focused visual refinement passes completed; final screenshots inspected at 1440×900, 1280×800, and 390×844, including long caller text/replies, proposals and completed playback. Impeccable source detector: 1 history accent-border warning before fix, 0 afterward. Single-context review per user's explicit no-subagents instruction.

## Final integration and browser evidence

- Final `npm run typecheck`, `npm test` (17/17), `npm run build`: all passed. MediaPipe dependency pinned to exactly 1.2.3 to match vendored assets.
- `npm run test:browser`: passed after final UI changes, zero application exceptions. Real Chrome checks: tap and keyboard selection, 600ms early-confirm guard, cancellation, explicit confirmation, all three viewport sizes, long text with no horizontal overflow/clipped cards, confirmation scrolled into view, reduced-motion styling, first keyboard focus, and injected camera-denial recovery with tap fallback.
- Actual backend simulation: caller fixture → local-rule candidates → select → cancel → select → explicit confirm → synthesizing/sent. UI correctly reports simulated transport and no remote listener.
- Actual authenticated browser-ws round trip: caller typed a question → backend generated local-rule candidates → user UI explicitly confirmed → real TTS audio reached a second browser → HTMLAudioElement reported ended → user UI showed `played` and the completed reply. This is real audio/playback-event integration, not proof of human audibility or spoken-microphone transcription.
- Backend auth was added during this session. Frontend now uses `/ws?token=…` and `/ws/caller?invite=…`, preflights `/api/health`, handles `session_info`, and uses distinct role-scoped session storage. Invalid user access shows recovery and does not retry sockets. No credential literals were written into frontend files, screenshots, or this note. No links containing tokens are rendered into page markup.
- Browser caught and fixed a transient StrictMode abandoned-socket warning. Later auth changes initially caused handshake failures; frontend adaptation resolved them. UI preview final console: zero errors/warnings. SDK startup emits its own XNNPACK informational message on console.error plus graph warnings when inference runs; no application exception resulted.
- Chrome DevTools Lighthouse desktop snapshot: Accessibility 100, Best Practices 100; initial label-content-name mismatches were fixed and the repeat audit has no accessibility findings. This is an automated snapshot, not a full accessibility certification. SEO/agent-discovery checks are outside this private communication-workspace verification.
- Built production worker separately verified on a real recorded face frame: tracked face, 12 mouth landmarks, inference completed. Temporary :4173 preview server stopped; temporary MP4 removed. Dev server :5173 remains running (started via `npm run dev -- --strictPort`; task session 91340).
- Screenshots: `web/evidence/desktop-1440-{ready,proposal,long}.png`, `laptop-1280-{ready,proposal,long}.png`, `mobile-390-{ready,proposal,long}.png`, `authenticated-browser-playback.png`, `caller-mobile.png`, and MCP captures. Node screenshot path handling was corrected to use fileURLToPath for spaces in this project path; artifacts were moved into the assigned directory and the accidental empty sibling removed.
- Design sources consulted: installed Impeccable 4.9.0 (context, Operate guidance, craft floor, critique/audit/polish guidance and detector), shadcn MCP Button/Card examples, Magic UI MCP Border Beam (intentionally not installed), Vercel Web Interface Guidelines, official MediaPipe Web sample/loader and LipLearner repository. No additional subagents.

## Backend contract requests (Claude owner)

No changes required for current UI.
Optional future additive message: `mouth_gesture_select {candidateSetId, index, method:'neutral-calibrated-mouth-gestures-v1', window:{startMs,endMs}, framesUsed}` accepted only for the current selectable set. Backend should create a `source:'mouth'` proposal through the controller, preserving confirmableAt/expiry/stale guards. This is a gesture mapping, not an AVSR RecognitionResult. Until agreed and added by Claude, frontend uses local highlight + explicit tap review.
Optional: add actual selected TTS voice label to Snapshot.speech; current UI can only show advertised providers and labels from services.voice.providers. Caller audio metadata already carries actual voice.

## Remaining / exact next tasks

1. Human physical test: camera on → relaxed-expression calibration → hold each mapped gesture → review → explicit confirmation. Camera capture and real recorded-face inference are verified, but no person performed all three gestures in this session. Validate lighting, thresholds and whether these gestures are usable for the intended person. Not clinically validated.
2. Human remote test over HTTPS: caller enables microphone and speaks; TACIT user chooses/confirms; remote listener verifies audibility. Browser Web Speech availability/autoplay on physical phones remain unverified. Superseded by the validation session below: caller now supports the backend raw-PCM audio_start path and server Whisper, with typed fallback.
3. Claude may add the optional mouth_gesture_select contract above to remove the current intermediate review tap while retaining separate confirmation. Until then the implemented review/tap path is the supported integration.
4. Gemini was verified in the validation session below; ElevenLabs remains unavailable. Voice is still the labeled system voice.


## Validation session · 2026-11-14 (in progress)

Read Claude's 03:35 UTC handoff and current shared/protocol.ts + shared/metrics.ts. No backend/shared changes.

### Implemented for real-user testing
- Caller microphone now uses getUserMedia → AudioWorklet → streaming mono PCM16 little-endian at 16kHz → existing audio_start/binary/audio_stop contract → server Whisper. Browser Web Speech is removed from the caller path. Microphone startup, denial, disconnect, slow-socket backpressure, cancellation and playback echo guard clean up capture. Input RMS and sent frame counts come from the actual captured stream; never confidence.
- Added an expandable Webcam gesture experiment: neutral arming, an 8-second target trial, correct/wrong/abstained/tracking-failure/interrupted outcomes, frame/tracking-loss counts and measured elapsed time. Cycles all three targets. Separate local recognizer; no call messages, speech, or proposal creation. Trial results and calibration features stay in memory, not persisted.
- Diagnostics now use shared turnStages, separating system processing, human-selection/confirmation stages, and audio-duration-inclusive playback. Stage category labels do not imply that an automated test's selection was human.
- Exposes current logging mode and explicit opt-in choices in diagnostics. Default remains the backend's off setting; no automatic logging changes.

### Verified now
- Baseline 17 tests + typecheck passed before changes. Updated 24/24 tests + typecheck + build passed (PCM rate/downmix/endianness/chunk boundaries; trial outcomes, neutral arming and interruptions).
- New `npm run test:microphone` passed: synthetic macOS say fixture used as Chrome's test microphone → actual frontend AudioWorklet → server Whisper transcribed exactly “Hey, it is Sam. Are we still on for dinner tonight?” → real gemini-3.5-flash-lite candidates → explicit scripted UI selection/confirmation → actual HTMLAudioElement ended acknowledgment. NO physical microphone/speaker or human audibility claim. Zero application exceptions.
- One automated run's real stage values: transcription 1818ms, generation 2075ms, display 49ms, scripted selection 443ms, scripted confirmation 907ms, synthesis 853ms, send 0ms, playback 2392ms (audio 2233ms); system processing subtotal 4746ms. These are observed test values, not user interaction latency or product guarantees.
- Real backend screenshots saved: final-workspace-gemini.png, final-candidate-focus.png (keyboard focus, not a mouth-recognition claim), final-confirmation.png. Source is a synthetic microphone fixture through real Whisper/Gemini. Actual mouth-selection capture awaits human test.

### Two installation warnings inspected
- Read actual npm debug log 2026-11-14T03_22_32_203Z-debug-0.log, npm install-scripts ls, package manifests, esbuild installer source, and installed native bindings.
- esbuild@0.28.2: postinstall checks/downloads/optimizes its native binary. Installed optional platform binary already works: transformSync succeeded, Vite build and tests succeeded with script blocked.
- fsevents@2.3.3: optional macOS watcher package; installed native watch binding loads. Package ships the binary; no install.js is present. No observed build/runtime failure.
- No scripts approved, no security setting weakened. Both unreviewed lifecycle-script warnings remain informational in this installation; relevant functionality is tested rather than assumed. MediaPipe WASM is loaded at runtime and does not depend on either lifecycle script.

### Human session
- `npm run validate:human` opened a separate headed Chrome with authenticated TACIT and Caller companion tabs. No fake media, synthetic audio, automated selection or confirmation. No camera/mic enabled automatically.
- User agreed to participate; nine physical webcam trials requested (three per gesture). Awaiting results. No accuracy or human-audibility claim yet.


### Final critique/audit pass in this validation session
- Impeccable context loaded the existing Quiet Precision system; review stayed in one context per the user’s no-subagents requirement (not an independent dual-agent critique). Applied craft-floor/Operate/critique/polish guidance to rendered real-backend workspace and confirmation screenshots.
- Concrete fixes: replaced the microphone path that bypassed Whisper; rendered server’s speech-detected ellipsis as a transcription state instead of quoted words; separated human vs system timing categories; added visible trial tracking status and retained abstentions/failures; retained existing visual hierarchy and no decorative animation.
- Impeccable detector: zero findings on UserPage, CallerPage, GestureTrials and styles. Chrome DevTools Lighthouse snapshot with the experiment and diagnostics expanded: Accessibility 100, Best Practices 100, no accessibility findings. Remaining automated failures are SEO/agent discovery (robots/llms/ARD), outside this private workspace’s task.
- Current full browser smoke re-run passed, zero application exceptions: three sizes, long text, confirmation, reduced motion, injected camera denial, invalid access recovery and authenticated caller audio. Build passed again after final core changes. Human physical results are still pending and will be appended rather than inferred.


### Relevant development-server issue found during final checks
The inherited Vite `fs.allow: ['..']` permitted HTTP /@fs access to backend files. A response-status-only check on the credential-store path returned 200; content was neither printed nor persisted. Tightened `web/vite.config.ts` to allow only the frontend and shared directory, with explicit deny patterns for backend paths and secrets. This does not change backend auth or credential files. Vite restarted, so the untouched human-test page refreshed before any measured trial had begun. Rechecking denied responses and regression suite before finalizing.

### Production microphone evidence
Built preview on :4173 was separately exercised through the same synthetic-microphone test. Worklet → real Whisper → Gemini → actual audio ended acknowledgment passed, zero application exceptions. In this run Whisper heard “Okay, it is Sam…” for the fixture's “Hey, it is Sam…”—recorded as a transcription variation, not hidden. That run measured transcription 1784ms, generation 1253ms, synthesis 1349ms, send 1ms, playback 2513ms (audio 2360ms); system processing subtotal 4387ms. Temporary preview server stopped. Production/automated evidence file currently contains this latest run.


Boundary regression result: backend credential store and backend TypeScript source now return HTTP 403 from Vite; shared/protocol.ts and frontend modules remain HTTP 200. Added these blocked-file assertions to browser smoke. Backend auth was unchanged, and no credentials were rotated or printed. Also suppressed stale playback status after a call ends, so a previous automated run cannot look like a new human acknowledgment.


Physical setup observation: the first visible Chrome camera request reached its startup timeout during permission/setup. Browser permission was then confirmed granted and the camera was retried once. No face/gesture trial results have been observed yet. This is a physical setup issue, separate from the passing synthetic/recorded-input tests. Human runner session 98170 remains open for continuation; camera/video frames are not persisted by the trial tool.


Physical camera retry result: actual FaceTime camera stream at 640×480 reached Face tracked, with live landmark/blendshape updates. One observed status sample showed 14.5 processed frames/s and 12.2ms last inference (single observation, not a benchmark or recognition accuracy). No physical gesture outcome is claimed from this. User has been asked to relax and perform neutral calibration before measured trials.

## Hands-on launch checkpoint · 2026-11-14

Read latest AGENTS.md and Claude's 05:00 UTC HANDOFF. Frontend :5173 HTTP 200; backend :8790 HTTP 200 with auth required. Authenticated health via the frontend proxy succeeds, phase DISCONNECTED, Gemini configured (gemini-3.5-flash-lite → gemini-3.5-flash), local persistent Whisper, labeled macOS system voice. Neither server restarted.

Added `web/scripts/open-local.mjs` and `npm run open:local`: user runs this in their own Mac Terminal to open private workspace and caller links in normal Google Chrome. Reads existing access codes in memory; never prints codes or private URLs; does not rotate/write backend credentials. `--check` verifies authenticated proxy/backend and model configuration without opening a browser. Launcher check, frontend typecheck and unit tests passed. The user's own Chrome visibility is awaiting their confirmation; no physical test success inferred.

Exact local base URLs: workspace http://localhost:5173/ and caller http://localhost:5173/#caller. Private authenticated URLs have the shared contract's token/invite parameters, supplied by the launcher without exposing them here.

Latest additive backend contracts noted for next frontend integration checkpoint: mouth_gesture_select is now supported; speech.voice gives the actual voice; services.voicePolicy and set_voice_policy implement explicit personal pre-synthesis/fallback choices; shared turnStages now defines systemMs using postConfirmMs. These will be integrated after the user has opened the UI, without editing shared/backend files.


## Autonomous product launch and UI review · 2026-11-14

Read AGENTS.md, Claude's latest 05:00 UTC HANDOFF, and current shared contracts before continuing. Ownership stayed within web/ and this document. No Git operations, backend changes, credential rotation, logging opt-in, or personal-voice-policy opt-in.

### Launch and current integration
- Both existing servers were running: frontend :5173 and backend :8790; authenticated proxy health succeeded. Neither was restarted. Executed `cd web && npm run open:local`, which requested authenticated workspace and caller tabs in normal Mac Chrome without printing private URLs. Opened and inspected the authenticated application using Playwright MCP; Chrome DevTools also inspected the running preview. Final Playwright check still shows System connected and camera released/off.
- Base URLs: http://localhost:5173/ and http://localhost:5173/#caller. Reopen authenticated tabs with `npm run open:local`; it supplies existing capabilities privately and strips query parameters after load.
- Integrated additive speech.voice and services.voicePolicy display/explicit policy controls. The current mouth workflow remains local visual highlight → Review selection (tap_select) → separate confirm of current proposal. Backend mouth_gesture_select is available but is not required by this functioning review workflow. No shared change requested.
- Updated timing presentation for current shared turnStages: postConfirmMs is separate; overlapping synthesis is not counted twice. Actual voice is visibly labeled macos-say (system, not personal) in this configuration.

### Files changed this checkpoint
- web/src/UserPage.tsx: previous-call transcript labeling, actual voice, current timing semantics, explicit voice policy controls.
- web/src/vision/GestureTrials.tsx: countdown excluded from live-region announcements; trial phase remains announced.
- web/src/styles.css: matching actual-voice, consent-control and countdown styles.
- web/tests/microphone-smoke.mjs: captures actual backend UI states; asserts zero audio before confirm and actual audio afterward; axe checks live candidates/caller; laptop/mobile screenshots and mobile overflow assertion.
- web/tests/vision-browser.mjs: recorded-image MediaPipe calibration/selection/review/cancel integration test, temporary media cleanup, explicit recorded-input/preview labeling.
- web/package.json and package-lock.json: @axe-core/playwright dev dependency; test:vision command.
- web/README.md: reproducible launch/test and recorded-input boundaries. web/artifacts/ui-review/: final screenshots, sanitized JSON results, manifest, captions and shareable ZIP.

### Actual checks and results
- `npm run typecheck`: passed. `npm test`: 24/24 passed. `npm run build`: passed. `npm run test:browser`: passed with zero application exceptions after UI changes (keyboard, cancellation, guarded explicit confirmation, responsive long content, reduced motion, denial/auth recovery, real backend audio and Vite file boundary).
- `npm run test:microphone`: passed with actual local backend. A temporary macOS say fixture supplied Chrome's microphone; actual AudioWorklet streamed PCM16/16k to server Whisper. Latest transcript began “Okay, it is Sam…” instead of fixture “Hey, it is Sam…”; this variation is preserved. Real Gemini model label gemini-3.5-flash-lite. Scripted selection and explicit confirmation produced real caller audio. Binary audio messages: 0 before confirmation, 1 afterward. HTMLAudioElement ended acknowledgment received; no application exceptions. Test alone does not establish human audibility.
- Latest single-run measured stages: Whisper 799ms, Gemini 1330ms, display 28ms, scripted selection 1061ms, scripted confirmation 1086ms, synthesis 1075ms, post-confirm 1ms, audio send 1100ms, playback 2221ms, audio duration 2233ms, system subtotal 2130ms. These are observed test values, not general performance claims; stage names “Human selection/confirmation” describe categories whose actions were scripted in this test.
- axe WCAG 2 A/AA + 2.1 A/AA checks on actual Gemini-candidate workspace and connected caller: zero violations reported. Sanitized accessibility-results.json contains state names and results, no credential-bearing markup. Not accessibility certification or a screen-reader user study.
- Actual camera permission was granted. Real webcam reached video readyState 4 at 640×480 and Face tracked. One status sample: 14.9 processed frames/s, last inference 10.6ms, jaw .011, smile .000, pucker .577, mouthAspect .067, yaw -.134, pitch .629. These are single live observations, not recognition accuracy/benchmarks. Saved a camera-masked screenshot and turned camera off afterward.
- `npm run test:vision`: passed in headed Chrome. Twenty sampled recorded face frames ran through genuine MediaPipe. Recorded images drove neutral calibration and a measured smile selection (slot 2), followed by separate review/proposal and cancellation, no speech. Preview banners explicitly disclose recorded sensor input and scripted conversation. No application exceptions. Initial headless harness failed WebGL initialization (activeTexture unavailable); switched only the test to headed Chrome, without unsafe GPU/security flags. Temporary converted clip removed. No reference media included in screenshots/bundle.
- SDK XNNPACK startup is informational console.error output plus graph warnings; distinct from JS application exceptions. Existing esbuild/fsevents lifecycle warnings still do not affect verified build/tests/runtime. No scripts blindly approved and no security settings changed; @axe installation reported zero vulnerabilities.

### Rendered design audit and refinement
Used installed Impeccable context/craft-floor/Operate/critique/polish guidance and source detector; no session reload was needed. Single-context review, respecting the user's no-subagents rule. Detector found zero issues on UserPage, CallerPage, GestureTrials and styles. Two focused refinement passes: (1) distinguish stale disconnected transcript from live caller speech, improve voice/timing disclosure and consent-control sizing; (2) remove repeating countdown live announcements, inspect actual candidate/proposal/caller/diagnostic captures and correct screenshot masking so camera-off UI remains visible. Real rendered screenshots inspected using browser MCPs and image viewing. Desktop/laptop/mobile screenshots use 1440×900, 1280×800, 390×844; long-text and reduced-motion checks remain in browser smoke. No decorative animation added.

### Shareable evidence
All requested captures are in web/artifacts/ui-review/. Read README.md or manifest.json for exact provenance. tacit-ui-review.zip includes final 01–16 screenshots (including recorded-input labels), sanitized test reports and captions. The original 01-workspace-initial.png remains as before-fix evidence but is excluded from the ZIP. Camera imagery is masked; private tokens are absent. Core captures: 02-three-gemini-candidates.png, 04-proposed-response.png, 05-confirmation-ready.png, 06-playback-acknowledged.png, 09-caller-playback-complete.png. Actual recorded-input selection: 13-gesture-selection-recorded-input.png.

### Reproducible human demo and recovery (still pending)
1. In Mac Terminal: cd to web/ and run `npm run open:local`. Workspace and caller open in normal Chrome. If a server is unavailable, the launcher identifies which; start only the missing frontend with `npm run dev -- --strictPort`. Backend ownership/startup remains Claude's responsibility.
2. Workspace: Enable camera, allow Chrome permission, center face, wait for Face tracked. Calibrate relaxed mouth. Open Webcam gesture experiment and run nine trials (three per gesture), relaxing between trials. Keep wrong selections, abstentions and tracking failures. Repeat under ordinary lighting/head movement. Calibration needs fresh tracked frames; inspect diagnostics and Chrome camera permission/device availability when it fails. The module is experimental gesture selection, not lip-reading.
3. Caller: Call TACIT → Enable microphone → allow Chrome. Prefer headphones. Speak an unscripted question, then pause. Check actual frame count/RMS and workspace transcript/model. No frames: inspect mic permission/device; frames but no transcript: check backend Whisper and speech/silence detection. Typed input is the explicit fallback.
4. User selects/reviews a reply. Confirm only the currently proposed response. Verify no audio before confirmation. Caller listens and reports whether it was audible; browser playback-end acknowledgment alone is insufficient. If playback is blocked, use the caller's playback recovery control and check Chrome output/mute settings.
5. End call; retry a fresh call for recovery. Screenshots/trial records should be reviewed before any claims of physical reliability. No measured human gesture session or human audibility result was supplied this checkpoint.

Backend integration requests: none required for the current local workflow. Human hardware testing is the remaining validation dependency. Personal voice and remote telephony are not configured and were not represented as working.


## Active contract request · continuous silent speech (2026-11-14)
User supersedes mandatory per-utterance confirmation and candidate selection: one intentional session activation → genuine VSR → automatic eligible speech; unvalidated recognition must remain gated. Sol is replacing the primary workspace, preserving old components as dormant infrastructure. No legacy confirm or Gemini candidate message will be used to simulate this.

Claude integration needed (backend/shared owner): publish additive typed session-authorized protocol in HANDOFF. Required semantics: server-issued live session/authorization generation scoped to call and socket; activate/pause/resume/end; immediate stop/clear current audio plus invalidate queued/in-flight utterances; recognition availability/model + validation gate/reason/evidence version; accepted image/video format and endpoint/framing; utterance ID/start/end/endpoint timestamps, actual frame counts and tracking-quality/drop reasons; raw visual hypothesis distinct from any optional correction, revision/stability, calibrated uncertainty if actually available; abstain/error/retry state; eligible server policy decision (never client-guessed); TTS/audio/playback acknowledgment linked to utterance ID. Reject stale, duplicate, old-generation and paused results. Do not accept client-supplied text as a VSR result. No automatic speech unless genuine recognition meets an experimentally validated policy.

Frontend is implementing bounded, memory-only timestamped full-frame JPEG capture (video only, no microphone) plus experimental temporal articulation windows. These windows are not evidence of words/speech vs smiling/swallowing. No visual frames or text are uploaded before explicit live activation. Until the published backend contract and validated recognizer exist, UI remains transmission-gated; local camera/articulation inspection works. Please specify whether full-frame JPEG sequence, video WebM, or aligned mouth ROI is required. Current planned replaceable recognizer interface accepts a timestamped frame window and AbortSignal; no invented backend endpoint.


## Mode 2 frontend implemented · continuous silent communication · 2026-11-14

User's latest direction supersedes the old per-proposal-confirmation product rule. Read latest AGENTS/HANDOFF (still old confirmation controller; ~07:50 UTC) and shared/protocol before work. No backend/shared edits, no Git operations, no extra agents. The old candidate implementation and evidence remain preserved but are not the primary application.

### Current product surface
- main.tsx now renders SilentWorkspace at `/`; caller page/audio capture/auth remain intact. No reply cards, candidate scoring, proposal panel or per-utterance confirm button on the primary route. No legacy tap_select/confirm/candidates_displayed/request_alternatives messages sent by this workspace.
- Quiet Precision identity retained: one main communication surface for the user's own raw recognized words, local camera/motion feedback, caller transcript/history, actual delivery state and optional diagnostics. Empty recognition remains empty. No canned text, Gemini substitution or language-model corrections.
- One future call-scoped Start live speech action, prominent Pause and Stop, Escape pause/stop, and a sticky header pause control when camera/speech is active. Camera setup is directly reachable in the main instrument, including mobile. Call changes/disconnect/end/hidden tabs invalidate incomplete work.
- Real MediaPipe worker now checks up to two faces. Experimental temporal motion endpointing uses measured feature derivatives, onset accumulation, quiet interval, duration bound, gap/head-motion/multiple-face rejection. It is NOT a speech/non-speech classifier or a recognizer. Ordinary non-speech motion may create windows; such windows never authorize words/audio.
- Timestamped full-frame JPEG sampling targets at most 25fps, actual capture timing retained. RAM buffer bounded to 10 seconds / 300 images / 12 MiB. Capture pauses/clears on pause, camera-off, missing/stale tracking, multiple faces and hidden tabs. Nothing uploaded by the current adapter; no visual recording persisted.
- Frontend-local SilentSpeechPort is an explicit replacement boundary, not a backend protocol. LiveSpeechSession gates activation on connected validated-model/evidence availability; enforces explicit activation, scoped authorization/result identity, pre-activation frame rejection, stable final results, deduplication, bounded two-window queue, retained uncertain window, AbortSignal cancellation and stale-result rejection. It contains no TTS, confirm or arbitrary text-send path. Backend alone must decide eligibility/deliver speech.

### Actual readiness / blocker
The real port is deliberately unavailable: the current shared protocol has no session-authorized visual recognition/TTS contract and no validated silent-human recognition evidence. Start live speech remains disabled with an explicit reason. This is NOT an operational silent-speech product yet. No unseen silent WER, incorrect transmission rate, physical gesture/word accuracy or human turn-taking/audio result is available. An accepted result in the local session unit tests uses a TEST ONLY port, not a real recognizer. Neither those tests nor recorded MediaPipe motion windows establish speech recognition. No AirPods integration: existing research concluded no-go for word recognition.

### Files created / changed
Created web/src/SilentWorkspace.tsx, web/src/silent/{workspace.css,articulation.ts,frameBuffer.ts,port.ts,session.ts,useSilentCapture.ts}; web/tests/{silent.test.ts,silent-browser.mjs,silent-microphone-smoke.mjs,silent-vision-browser.mjs}; web/PRODUCT.md; web/artifacts/silent-speech/ screenshots + sanitized result JSON. Changed main.tsx, CallerPage.tsx wording, vision/features.ts (face count), landmarker.worker.ts (two-face check), package.json test command targets, physical-validation.mjs current selectors/masking, scripts/open-local.mjs current-mode wording, README.md and DESIGN.md. Historical files/scripts preserved; old browser scripts are no longer the default test commands.

### Verified results
- Baseline typecheck and 24 tests passed. Final 38/38 frontend tests pass, including 14 new meaningful tests for segmentation, bounded buffer, validation gate, no submit before activation, consecutive automatic submissions without confirmation, queue ordering, duplicates, interruption, pause/disconnect/late authorization, mismatched/unstable results and pre-activation privacy. Typecheck and Vite build passed.
- New test:browser passed against actual authenticated backend: 1440×900, 1280×800, 390×844; no horizontal overflow; long caller-content fixture; keyboard and reduced motion; camera-denial recovery; blocked activation; Escape pause; zero legacy selection/confirmation messages; forbidden backend-file HTTP403. Zero application exceptions. Axe WCAG 2 A/AA + 2.1 A/AA on authenticated workspace with diagnostics: zero violations after correcting the brand link accessible-name mismatch. Automated audit is not accessibility certification.
- New test:microphone passed: synthesized mic fixture → actual AudioWorklet PCM16/16k → actual server Whisper → current workspace caller transcript. Whisper returned “Okay, it is Sam…” for fixture “Hey, it is Sam…”, variation preserved. Zero unsolicited audio frames while automatic speech is gated. This is a regression check of caller infrastructure, not user silent speech or a physical microphone/speaker test.
- New test:vision passed in headed Chrome: recorded CREMA-D video → real MediaPipe → bounded JPEG buffer → one experimental motion window; 533ms measured last-motion-to-endpoint in this run (configured quiet interval 480ms plus real sample spacing). A sample contained 125 frames in RAM; last window had 42 captured frames. These are single recorded-input observations, not speech recognition latency or accuracy. Pause cleared capture to zero; local resume recovered; camera-off released; mobile sticky-header pause worked without horizontal overflow. No application exceptions. Reference imagery masked by entire preview region in final artifacts; converted clip removed afterward.
- Impeccable available and applied using incumbent system, craft floor, Operate and polish guidance; single-context critique to respect no-subagents. Detector zero findings. Two concrete visual refinement passes: move camera setup into primary mobile action area; keep pause available in sticky header; reduce inactive control clutter; eliminate decorative camera background; correct accessible naming; tighten camera screenshot masking. Actual rendered desktop/mobile/recorded-camera screenshots inspected.
- Two initial shell invocations accidentally used the root (no package.json) and returned ENOENT; reran from web successfully. An initial new browser test exposed Escape overwriting its pause explanation; removed redundant interrupt call. Subsequent accessibility run exposed the brand label mismatch; fixed and reran clean. Neither was hidden.

### Backend integration handoff — exact next tasks for Claude
1. Update controller/shared contract for the user's session-authorized automatic-speech decision; current HANDOFF still requires old per-utterance confirmation. Publish typed availability/validation, activation/revocation, recognition events, interruption/delivery and accepted frame format before frontend depends on it. See Active contract request above and web/src/silent/port.ts for concrete frontend arguments/results.
2. Verify pretrained VISUAL-ONLY free decoding on held-out genuinely silent human utterances. Existing recognition engine is primarily a candidate scorer with free decode, not evidence of validated silent transcription. Do not use Gemini candidates/corrections as the user's words. Determine empirically justified uncertainty/stability/abstention policy.
3. Accept full-frame timestamped image windows or specify video/ROI framing. Authoritative call+live authorization generation, utterance IDs, deduplication, pause/stop queue invalidation and raw-text provenance must remain server-side. Reject client-supplied text as recognition evidence. Ensure cancellation aborts transport playback, not just synthesis.
4. Sol then replaces unavailableSilentSpeechPort in SilentWorkspace with the published adapter; no UI rewrite required. Test real authorization → actual visual inference → eligibility/stability → automatic TTS → remote playback; test duplicates, paused/stale recognition and ordinary non-speech movement.
5. Human evaluation before unattended auto-transmission: unseen silent references, raw visual WER, abstentions, incorrect transmissions, non-speech false triggers, true endpoint/recognition/delivery/turn-taking latency, and a remote listener's actual received words/audibility. Keep the gate blocked if evidence is insufficient. No mandatory per-utterance confirmation is reintroduced as the normal path.

Reproduction: in web run open:local; Set up camera; Diagnostics; observe local tracking/buffer/windows; Pause/Escape and verify capture clears; resume local check. Caller regression: Call TACIT → Enable microphone → speak/pause → Whisper transcript appears. No outgoing words are expected until the genuine backend contract and reliability gate are implemented.

Final current-mode evidence: web/artifacts/silent-speech/tacit-silent-workspace-review.zip; captions and exact filenames in the adjacent README.md/manifest.json. Old artifacts/ui-review/tacit-ui-review.zip is historical candidate-flow evidence. Final rerun recorded 124 buffered frames and a 534ms measured motion endpoint interval; variance across runs is preserved rather than treated as a benchmark. Authenticated launcher check passed and the new workspace/caller were requested in normal Chrome. Final typecheck/build passed after multi-face feedback refinement. No real silent-word model or authorized live backend contract appeared in shared/protocol.ts during this checkpoint.

## Integration-ready milestone · completed frontend checkpoint · 2026-11-14

Read current AGENTS.md, HANDOFF (09:20 UTC) and shared/protocol.ts. Git status was clean before edits. Sol owns only web/** and this note; Claude remains the sole Git writer. No backend/shared/native changes. **Stable checkpoint is recorded below; files are now yielded to Claude.**

### Contract response for Claude: JPEG versus WebM (source inspection, not a guessed wire protocol)

Reviewed recognition/tacit_vsr/{video.py,config.py,transcribe.py} and the proposed HANDOFF clip contract. Current code facts:

| Requirement | Exact implementation |
|---|---|
| Frame rate | MODEL_FPS=25. decode_clip resamples source presentation timestamps onto 25 Hz midpoint targets; implementation uses the last source frame at or before each target (zero-order hold), despite the docstring's “nearest” description. Capture need not be exactly 25 Hz; low-rate input duplicates frames and loses temporal information. |
| Container/codec | PyAV av.open(bytes) → first video stream → rgb24. Reader explicitly supports WebM/MP4/FLV; actual codecs depend on installed FFmpeg/PyAV. Tested codec/container results will be appended. No live endpoint exists in the shared protocol. |
| Time | Reads frame.pts × stream.time_base, then frame.time; only missing timestamps fall back to an assumed 30 Hz. Sorts and subtracts first PTS; all start/end bounds are relative milliseconds. Preserve fractional milliseconds, source PTS, performance.timeOrigin + monotonic capture time and clock-domain identity. Never substitute frame-index/25 for actual time. Browser/server clock synchronization and drift estimates are needed for fusion. |
| Geometry | Any decoded RGB dimensions/aspect are accepted; there is no enforced 640×480 or fixed input aspect. Current frontend preserves aspect, max width 640. Supply full face (eyes, nose and mouth); server aligns four stable points to the 256×256 mean face, extracts grayscale 96×96 mouth ROI, center crops 88×88, normalizes (x/255 − .421)/.165. Browser mouth crops would break this preprocessing. Decoder does not honor display rotation; portrait recordings must supply upright pixels or an explicit rotation normalized server-side. |
| Tracking | Server currently tracks one face, interpolates missing landmarks (including long gaps) and holds at ends. It does not enforce multi-person rejection there. Frontend rejection is helpful but cannot replace server validation. |
| Duration | decode_clip default max_seconds=20; it appends the first frame beyond 20 s before breaking. This is a soft decode cutoff, not a hard input security/memory limit. Frontend motion max is 8 s, RAM buffer 10 s/300 frames/12 MiB; backend must enforce duration/count/bytes/resolution before or during decode. Model has no validated conversational maximum. |
| JPEG sequences | Not accepted by decode_clip as-is. MouthCropper already accepts list[RGB ndarray], so a backend adapter could decode each JPEG, validate monotonically increasing timestamps, apply the SAME 25 Hz resampling, then reuse cropping/tensor/model. That adapter does not yet exist; do not send JPEGs to the proposed WebM endpoint. |

**Recommendation for agreement:** preserve the current timestamped JPEG evidence boundary and add an explicitly negotiated `jpeg-sequence` transport in Claude's contract as the first integration. Send full-frame bounded JPEGs + per-frame fractional capture/source timestamps, width/height/orientation, source identity, utterance bounds/endpoint times and capture/drop statistics. Server performs all decoding/ROI/recognition. This requires a small server frame-sequence decoder, not a model change, and avoids JPEG → canvas/stream → lossy WebM re-encoding with potentially rewritten timestamps and lost pre-roll. JPEG payloads cost more bandwidth; that tradeoff needs measurement on held-out clips and mobile networks.

**Alternative if Claude chooses video:** agree a complete, independently decodable video clip (WebM VP8/VP9 or MP4 H.264 subject to runtime negotiation), not arbitrary MediaRecorder timeslice fragments. A MediaRecorder chunk can lack container initialization/keyframes and cannot be assumed independently decodable. A continuous encoded ring needs init/keyframe-aware clipping, pre-roll, explicit PTS/boundaries and abort/byte limits. Starting a recorder only after motion onset would miss pre-roll. Native video encoding could reduce bandwidth and avoid current JPEG compression; it does not inherently add unacceptable latency. Neither quality loss nor incremental latency has been benchmarked here, so no numerical claim is justified. Do not change capture format until this choice is published in HANDOFF/shared.

**Requested shared contract additions:** negotiated input IDs (`airpods`, `camera`, `combined`), independent device/stream/articulation/recognition/validation facts with provenance and freshness; separate display-only recognition from automatic-transmission authorization; server-issued call/socket/generation-scoped authorization, input source and mode; bounded evidence upload with actual timestamps and cancellation; raw hypotheses and shown/abstained/uncertain/transmitted decisions; utterance-linked synthesis/delivery/playback events; pause/mute/stop revocation, duplicate rejection, reconnect invalidation and server-side authorization lease/heartbeat. Background/lock can freeze JS before a final revoke reaches the server: client cleanup alone cannot guarantee cancellation. Keep server transmission disabled until measured silent-word reliability exists.

Frontend `silent/port.ts` remains a local replacement boundary, NOT an invented WebSocket API. It now allows opaque native/fused evidence as well as JPEG frames and separates display-only from automatic mode. Real adapter remains deliberately unavailable until Claude publishes the shared contract. Coordination is through this owned workstream note; Claude must copy agreed interface decisions into HANDOFF, which Sol may not edit.

### Mobile/background findings and implemented policy

Research checked 2026-11-14. [MDN Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) documents background animation/timer throttling. [visibilitychange](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event) documents mobile app switching and hidden as the last reliably observable transition. The app therefore pauses/revokes on visibilitychange(hidden) and pagehide; it never automatically resumes on return. Pause now releases the camera stream/worker as well as JPEGs; late permission resolution stops its newly returned tracks. MediaStream track mute/ended becomes an explicit interrupted-camera error. Browser tests inject lifecycle/permission faults; they are NOT a physical iPhone lock/background test.

Native headphone motion is exposed by Apple's [CMHeadphoneMotionManager](https://developer.apple.com/documentation/coremotion/cmheadphonemotionmanager), not a browser AirPods sensor API. [Apple background execution modes](https://developer.apple.com/documentation/xcode/configuring-background-execution-modes) require appropriate native capabilities and platform constraints. **Engineering inference:** the intended camera-free, locked-screen/incoming-phone-call experience needs a native iOS sensing/call integration investigation; a responsive website alone does not establish it. Claude should evaluate native motion availability while backgrounded, interruptions from cellular/VoIP calls, permitted audio routing to the remote participant, permission/consent and revocation behavior on actual iPhones. Neither this frontend nor desktop native motion proves those capabilities. No blanket guarantee that a background mode grants continuous AirPods sensing or access to another app's phone call.

[WebKit Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/) added MediaRecorder WebM VP8/VP9 recording; do not rely on the old blanket claim that Safari only records MP4. Negotiate MediaRecorder.isTypeSupported, actual encoder startup and server codec support on each device if video transport is chosen. A format-support check does not prove foreground/background continuity. [requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback) supplies presented-frame mediaTime; the replay runner uses it, with an explicitly less precise currentTime fallback.

### Reproducible physical evaluation once the genuine adapter exists

1. First pass automated regressions (`typecheck`, unit tests, build, browser, microphone, vision, replay). Replay existing held-out recordings with labels; use a TEST ONLY adapter solely for state/transport tests. Keep this separate from any human model evaluation.
2. Record environment/model/evidence versions, device/earbud side, silent vs voiced mode, lighting, input source, actual clock/sync offsets, call transport and voice policy. Logging/recording requires consent; keep faces/voices/references private. Use held-out speakers/sessions/re-seating; do not tune on their results.
3. With automatic transmission blocked, use display-only authorization. Silently articulate unseen references at natural/slow/fast pace, including multiple consecutive sentences and internal pauses. Add separately labeled non-speech intervals: smile, swallow, yawn, head turn, face loss, two people. Preserve raw decoder text, empty results and abstentions; never use reference text to correct predictions.
4. Compute WER = (substitutions + deletions + insertions) / reference words, stating normalization and whether abstentions are counted as deletions (primary all-trial WER) plus accepted-only WER and coverage separately. Report non-speech false windows AND actual false recognized/transmitted events per minute, incorrect-transmission rate, abstention count/rate, onset/offset errors/missed/merged/split boundaries, capture fps/drop/jitter, queue overloads, and source/sync failures. Do not average away failures or confuse a detected window with speech.
5. Report real endpoint → server receipt → decode/preprocess/model → raw result → TTS first byte → caller playback start/end timings, with source-clock provenance and uncertainty. Keep capture-window duration, endpoint latency, inference latency and end-to-end turn latency separate. Backend logs and actual remote playback acknowledgments must link call, generation and utterance ID.
6. Only after the backend's measured reliability policy authorizes automatic delivery: enable Live once, articulate sequential phrases without touching the UI, verify exact raw words/eligible delivery and audible output with a second human at the remote endpoint. Record the listener's heard words/audible yes/no, not just browser playback-ended. Stop/pause during inference, queued audio and active playback; verify immediate silence and no stale/replayed words. Repeat call end, reconnect, background/lock and explicit resume. If speech is not heard or policy/evidence is insufficient, record failure and keep transmission gated. No human audibility or silent accuracy result has been produced in this frontend session.

### Actual Auto-AVSR transport feasibility probe

`cd web && npm run test:vsr-inputs` ran the existing Python CPU engine and cropper on the previously recorded VOICED CREMA-D actor clip `1030_ITS_NEU_XX.flv`. No backend code edits, fake hypotheses, human silent recordings or uploads. `web/scripts/check-vsr-inputs.py` creates temporary MP4/WebM conversions and removes them, then exercises a probe-only JPEG→RGB list directly through the existing crop/tensor/encoder/beam path. It does NOT add JPEG support to the backend endpoint. OpenCV JPEG quality 80 is not guaranteed equivalent to canvas quality .8.

| Input | Video geometry / model frames | Bytes | Raw model words | Decode or JPEG encode+decode | Crop + inference |
|---|---|---:|---|---:|---:|
| Original FLV | 480×360 / 58 | 295,790 (original includes audio, decoder reads video only) | I THINK I'VE SEEN THIS BEFORE | 55.9 ms | 1105.2 ms |
| H.264 MP4, ffmpeg CRF 18 | 480×360 / 58 | 184,806 | same exact raw words | 53.9 ms | 901.2 ms |
| VP8 WebM, ffmpeg CRF 10, 1 Mbit/s target | 480×360 / 58 | 199,591 | same exact raw words | 10.2 ms | 811.0 ms |
| JPEG80 RGB sequence, PROBE ONLY | 58 frames after original 25 Hz resampling | 935,293 | same exact raw words | 41.8 ms (encode + decode) | 832.1 ms |

Real source PTS measured ~29.97 Hz; decoded durations 2335.0–2336.0 ms; tracking fraction 1.0 for all variants. One sequential run, cold/warm ordering effects, one voiced clip, no quality/latency generalization. Offline ffmpeg encode wall times were 167.4 ms MP4 / 208.9 ms WebM; **these are not browser MediaRecorder startup or incremental latency measurements**. JPEG was ~4.7× the WebM payload in this probe. This supports feasibility of the recommended JPEG adapter and of a complete WebM alternative; it does not settle mobile bandwidth/quality tradeoffs or justify an encoding rewrite. Private aggregate results: web/artifacts/transport/results.json (ignored). The [W3C MediaStream Recording draft](https://www.w3.org/TR/mediastream-recording/#data-handling) also explicitly permits individual timeslice blobs to be unplayable while their completed combination is playable, reinforcing the independently-decodable-clip requirement.

### Stable frontend checkpoint · 2026-11-14 09:55 UTC · yielded to Claude

**Implementation:** AirPods is the initial input choice; camera setup is optional and no longer the primary action. Input selection is inside the communication surface on mobile. Independent capability facts report device/stream/articulation/model/validation/authorization, including not-reported and unavailable states. A helper that has never started does not prove headphones are physically disconnected; inactive camera capture does not prove the camera hardware is absent. Streaming freshness is a UI observation (1.5 s in estimated server time), not a recognition threshold. The current controller only exposes placeholder AirPods status, so the UI does not invent connectivity or motion. Legacy service reachability/candidate scoring never sets live recognition readiness.

`CommunicationUtterance` / `RecognitionHypothesis` and per-input supported/validated input lists support visual JPEG evidence or opaque native/fused evidence without a camera requirement. The old visual type names/capture entry points remain supported. `LiveSpeechSession` supports display-only (raw words shown, no automatic eligibility) independently of automatic authorization. Automatic mode needs that input's backend evidence and a server-issued matching call/mode authorization. A camera validation cannot authorize AirPods. Rejected activation ends old authorization; blocked/duplicate/stale/pre-activation/source-mismatched/unstable output never enters a client speech path. Recognition has a 30 s deadline with AbortSignal + remote interrupt hook; timeout says delivery is unconfirmed, never claims the caller could not have heard it. Pause also mutes/cancels outgoing speech; Stop ends the authorization. The new adapter must implement those hooks remotely. Current `cancel` messages only interrupt existing audio; no candidate/confirm/arbitrary-text speech shortcut was introduced.

Capture and replay share `SilentCapturePipeline`, `useVision` and `useSilentCapture`. Both trackers/samplers use presentation-time deadline accumulation, fixing half-rate scheduling near a callback deadline. Pending JPEGs carry an invalidation epoch: pause/face loss/multiple faces/gap/head-motion resets cannot be refilled by a late encode. Encoded RAM is bounded: rolling capture 10 s/300 frames/12 MiB, individual evidence 12 MiB, session held evidence 24 MiB, queue two windows. Saturation discards the newest window with a reason/counter; it is never silently auto-retried or sent later. These are encoded payload accounting bounds, NOT a measurement or bound of whole-browser heap, decoded surfaces, worker memory, GPU memory or network buffers. Cadence retains at most 250 sample timestamps; dedup at most 512 IDs, with server-side scoped dedup still required.

Capture diagnostics expose measured captured fps, source callback gaps, browser-reported video drops, encoder-busy skips, rejected stale encodes, sampling jitter, window duration, last-motion→endpoint, queue/held bytes and overloads. Live `t` is a monotonic browser callback stamp, not a verified camera exposure time; `mediaTimeMs` preserves the source presentation timeline and `deliveredAtMs` distinguishes arrival. Fusion must measure clock mapping AND capture/transport delay; ping offset alone does not prove frame/motion synchronization. No endpoint thresholds were tuned on the actor clip; the original 160 ms onset / 480 ms quiet heuristic remains experimental. Smiles/swallowing can still generate windows; slow/fast delivery changes boundaries. A mouth-motion window is never a speech-intent decision.

Mobile pause stays in the sticky header with a text label and ≥44 px target; main controls ≥52 px on mobile. Recognized words have a live region, input controls are labeled, keyboard Escape pauses, and reduced-motion behavior remains. Pause/background/pagehide release camera/worker/JPEGs; late permission tracks are stopped, and return never automatically resumes. A future validated camera session can reactivate through one Live action that waits for fresh tracking rather than requiring a second per-utterance/camera action. Call change/disconnect do not undo a user's pause. Native locked-screen/cellular-call integration remains unverified; see the sourced mobile limitations above.

**Replay workflow:** `/?replay=1` accepts local recorded video and optional source-time JSON labels; .5×/1×/2× delivery, independent capture/worker sample drops, source-time tracking masking, repeated recordings, pause/restart/pagehide, bounded metric-only reports and explicit local export. No TACIT application socket, recognizer, mic, API upload or audio exists on that route. Vite's development HMR socket is unrelated and excluded from the application-socket assertion. Real model outputs come from the separate offline probe, not from scripted UI hypotheses. Default actor recording has no true utterance labels; reports correctly omit boundary accuracy rather than pretending clip boundaries are speech labels. Synthetic labeled unit tests cover the boundary-report arithmetic and interruption/state-machine paths. Reports retain at most 200 windows, and pause clears image buffers while retaining measured cadence aggregates for export.

**Fresh verification:**
- `npm run typecheck`, `npm test`: **55/55 passed**, then `npm run build` passed (Vite production assets built). Baseline was 38 tests. Added behavior coverage for capability truth, unavailable cameras, 30→25 Hz scheduling/precision, epoch cancellation, 100,000-sample bounded telemetry, source-time faults/labels, natural short vs long pause windows, display-only/automatic gates, camera-free TEST ONLY evidence, per-input validation, overload/byte caps, hung recognition, blocked reactivation and pause-before-dispatch.
- `npm run test:browser`: passed against actual authenticated backend at 1440×900, 1280×800 and 390×844, with no horizontal overflow or application exceptions; zero legacy selection/confirmation messages. Camera denial, unsupported media API, late permission after pause (returned track ended), mobile AirPods without camera, keyboard and reduced motion passed. Axe WCAG 2 A/AA + 2.1 A/AA: **zero violations** on mobile and expanded desktop diagnostics. This is an automated audit, not screen-reader user certification. Existing forbidden backend-file HTTP403 checks passed.
- `npm run test:vision`: genuine recorded-face pixels → camera stream → actual MediaPipe → JPEG buffer/window, **122 frames in RAM, one window, measured endpoint 485 ms** in the final run; pause clears, resume reacquires, camera-off releases; mobile no overflow; no recognized words/audio fabricated, zero application exceptions.
- `npm run test:replay`: all five genuine MediaPipe scenarios passed; repeated voiced actor input is 8.72 s including frozen lead/trail pixels. Normal: 213 captured frames, **24.77 source fps / 24.74 delivered fps, 3.87 ms source interval SD**, two windows (1560/1640 ms), endpoint 480/480 ms, encoded buffer 3,251,356 bytes. Slow .5×: 24.77 source / 12.38 delivered fps, windows 1520/2080 ms. Fast 2×: 12.50 source / 25.02 delivered fps, windows 960/560 ms, endpoints 560 ms. Every-third drop: **71 deliberately dropped capture samples**, 16.55 source fps, 21.10 ms jitter, two windows 1360/640 ms; this demonstrates degradation rather than robustness. Tracking loss 1.0–1.6 s: nine rejected tracking updates, one invalidated pending JPEG, cleared old buffer, two later windows. Zero compositor callback gaps and browser-reported drops in these runs; intentionally injected drops are counted separately. Buffer stayed below 12 MiB. Pause/restart and pagehide release passed. Replay axe zero violations; zero application sockets, POST/API uploads or JS exceptions. Results: ignored web/artifacts/replay/results.json.
- `npm run test:microphone`: synthetic mic → actual AudioWorklet PCM → actual backend Whisper, caller transcript received, **zero unsolicited audio frames**, zero application exceptions. Whisper returned “Okay…” for the fixture's “Hey…”; preserved as an actual STT variation. No human microphone/audibility claim. Caller playback implementation was untouched.
- `npm run test:vsr-inputs`: actual model outputs and codec/byte/timing observations above. No silent accuracy claim.
- `git diff --check` passed. Only web/** and docs/WORKSTREAM_SOL.md changed. No Git writes, backend/shared/native edits, new dependency, tunnel, large dataset, or voice-policy change. Vite remains available on :5173 for review; existing backend :8790 was not restarted or modified.

**Failures found and fixed during development:** early replay selector naming and axe context setup failures; MediaRecorder-style playback-rate reset on load (fixed with defaultPlaybackRate plus assertion of the actual rate); callback deadline aliasing visible in the first normal-rate run (fixed using PTS and tested rounding tolerance); Vite HMR initially counted as an application socket (now filtered by control-channel path); mobile hidden diagnostics text produced a nameless icon button (added aria-label, audit rerun clean). Two npm invocations from repository root returned ENOENT and were rerun from web. No failing result is presented as a pass, and the final reports overwrite provisional development results.

**Stable files for an atomic Claude commit:** web/src/{SilentWorkspace.tsx,main.tsx}, web/src/silent/{capabilities.ts,capturePipeline.ts,captureTelemetry.ts,deadline.ts,RecordedReplay.tsx,replay.ts,frameBuffer.ts,port.ts,session.ts,useSilentCapture.ts,workspace.css}, web/src/vision/{features.ts,useVision.ts}, web/tests/{integration-ready.test.ts,replay-vision-browser.mjs,silent-browser.mjs,silent-vision-browser.mjs,silent.test.ts}, web/scripts/check-vsr-inputs.py, web/package.json, web/README.md, docs/WORKSTREAM_SOL.md. Suggested subject: `feat(web): add sensor-agnostic sessions and recorded-input evaluation`. Tests/docs belong with the cohesive feature; artifacts/recordings/builds must stay ignored. **Sol has finished editing and explicitly yields all listed files for review/staging by Claude.**

**Remaining backend/human work, not frontend claims:** shared/protocol.ts and HANDOFF were rechecked at the end; no typed Live messages are published. Claude must decide/publish the transport and authorization/recognition/delivery contract, implement the backend decoder/service/remote cancellation, and then replace the unavailable local port. Frontend needs adapter wiring, not a new communication surface. Per-input real silent WER/abstention/incorrect transmission/non-speech gate measurements, physical iOS/background/native call routing, and human-confirmed remote audibility remain unmeasured. Automatic speech stays disabled. The physical procedure above is ready for that stage; no extra human recordings were requested merely to exercise code paths.

### S0 — Live integration resumed · 2026-11-14

Sol is actively editing frontend files again; previous yield is superseded until S5 below. Existing uncommitted web work is preserved. Published `tacit-live-v1` reconciled against shared/protocol.ts and server/src/live.ts: display-only needs no caller, `shown` is not accepted/transmitted, `stable:false`, uncertainty uncalibrated. No native output-route or typed AAC contract exists in the current shared types.

**Claude coordination request:** the current :8790 process needs a coordinated restart to expose the published Live handler/capability. Sol will not restart it. For verification Sol may launch an isolated own backend/service on separate local ports and stop only those processes afterwards. Please copy milestone summaries to HANDOFF (Claude-owned); Sol updates this workstream only.

**Exact additive native contract request (proposal for Claude, not a frontend wire assumption):** publish `services.outputRoute?: { kind:'none'|'browser-caller'|'macos-virtual-microphone'; installed:boolean|null; helperConnected:boolean; callingAppSelected:boolean|null; available:boolean; reason:string }` with explicit provenance for device selection; publish utterance-scoped output events containing authorizationId, generation, utteranceId, state (`queued`/`synthesizing`/`routed`/`interrupted`/`failed`), actual voice label and timestamps. Remote-audibility evidence must include a separately obtained human confirmation; playback ACK alone cannot establish it. Typed AAC additionally needs an explicit user-authored text command, output session authorization, cancellation and failure acknowledgments. Until published, UI will show native route not reported and typed output unavailable.

### S1/S2 implementation checkpoint · in verification

Added `LiveSocketPort` on useTacit's existing authenticated connection, shared `tacit-live-v1` event handling, FIFO acknowledged controls (wire protocol has no control request ID), generation+sequence-qualified utterance IDs with local correlation, atomic synchronous header/JPEG batch enqueue, pre-batch backpressure and protocol limits. Display-only session no longer depends on caller or automatic validation; `shown` stays raw/display-only with `stable:false`, `transmitted:false`. No text-to-TTS path exists. Pause→Stop retains enough authorization to end the paused remote session. Disconnect and lost capability invalidate work.

Astra checkpoint 1 actually performed by `gpt-6-astra`: two P2 races reproduced (parallel submit during backpressure; capability loss while activation awaited), fixed with regression tests. 64 tests and typecheck/build passed at this checkpoint. Browser recognition verification ongoing; no recognition/UI completion claim yet. Separate own services: :8791 backend, :8767 recognizer, :5173 Vite proxy to :8791. Existing :8790 untouched. Files are still being edited; do not stage.

### S3 reconciliation — native types arrived during verification

Re-read shared/protocol.ts at 10:26 UTC: Claude has now added VoiceRouteStatus, SpeechOutputStatus, SpeechDelivery, output_control and speak_typed (server/src/route.ts and speech.ts also present). This supersedes the earlier missing-contract note for those fields. No output handler is wired in the inspected server/src/index.ts yet and current services predate those additions. Sol is implementing event/route/AAC consumers using only those exact published types; backend integration/restart still belongs to Claude. HANDOFF's Interface contract has not yet been updated with these additions; please announce and confirm wiring there before the physical demo. RecognizedSpeechAllowed and autoTransmitAllowed remain literal false. No model words will be copied to typed AAC.

Follow-up precision request: SpeechDelivery currently has requestId but no output authorizationId/generation; frontend will correlate only locally issued unique request IDs on the current socket/authorized generation and discard after pause/reconnect. Please add those identity fields in a future additive contract if multi-controller/native status can outlive a connection. output_status is also unsolicited on queue/route changes, so an output control acknowledgment must be distinguished by a generation/state transition, not by consuming any status event.


### TACIT Flow external engineering checkpoint · 2026-11-15T13:45:05.233565+00:00 · stable for owner review

User authorized substantial isolated Flow implementation, but retained file ownership. No ownership transfer was received. No Git writes, stable backend/shared edits, restart, device-default change or promotion were performed. Existing unrelated HANDOFF/adaptation work was preserved.

External snapshot/delivery: `/Users/tanushsavadi/Documents/TACIT-Flow-Development/2026-11-15/README.md`. Includes real MV3 tabCapture implementation and scoped PCM endpoint, persistent local STT, revisioned source/draft store, grounded Gemini interpreter, native Flow controls and existing speech-path integration, tests/docs, ad-hoc-signed separate candidate and review patches. Candidate processes stopped after tests; stable process IDs remained present.

Fresh checks: server typecheck + **246/246**; native **115/115**; web typecheck + **84/84** + build; unchanged native route/voice helpers build; candidate signature verified. Native binary connected to real isolated sockets with capture/consent off and zero speech requests. Three synthetic local-STT files decoded at 610–618 ms. Chrome loaded the extension but automated invocation did NOT obtain capture permission: **no live Meet/playback/remote-hearing proof**. Native screenshots/video are explicitly synthetic UI fixtures.

Semantic evidence is negative/incomplete: original Flash-Lite binary-change **9/12** (grounding 12/12), new stress **4/8**, lexical comparator stress **4/8**; all eight 3.8 Flash LOW requests hit 5 s timeout. No measured user effort reduction/clinical benefit or Gemini superiority. **NO-GO for stable promotion.** Hardware/participant/VoiceOver/provider-account gates remain blocked. Do not present this as shipped or live meeting-aware.

**Claude integration request:** review `patches/backend-shared.patch`, then native/web + docs patches. `git apply --check` against the original checkout passed; nothing was applied. Proposed additive protocol: `RespondContextSource += 'meeting-selected'` plus private :18892 `/flow` source/control protocol, never PCM through visual JPEG `/ws`. Selected meeting HMR context requires current Flow consent/source membership and cancellation on invalidation. This is an EXTERNAL contract proposal, not announced stable support. Please record accepted interface changes and this checkpoint in HANDOFF before integrating; Sol does not edit Claude-owned HANDOFF. No promotion without new semantic evidence, real consented capture/playback and two-device exact speech/Stop verification.

Owned original code was not changed; only this coordination note was appended. External candidate files are at a stable review checkpoint. Preserve existing work and apply patches only after your ownership/current-source review.

Final external checkpoint 2026-11-15T13:52:53.200450+00:00: sticky Flow action bar keeps Speak/Save available while context scrolls; fixture renderer supports an explicit visible test window. Last native tests **115/115**, signature verified, final patch apply/whitespace checks pass, candidate ports closed. Some diagnostic AppKit captures omit heading glyphs; not full UI acceptance. Source/binary manifests refreshed; no further external source edits in progress.


### Flow Demo + hover restoration checkpoint — 2026-11-15T18:00:48.517676+00:00 — stable for owner review

User authorized a complete isolated seeded Flow demo and then requested hover-away collapse / hover-return restoration of the same workspace. Runnable delivery: `/Users/tanushsavadi/Documents/TACIT-Flow-Development/2026-11-15/demo-ready/README.md`. Distinct bundle `edu.hackumass.tacit-flow-demo`, ports 19890/19892, native presenter + Flow notch, three real interactive scenarios, synthetic transcript adapter importing the existing FlowState/SemanticEngine, source validation/provenance, exact authored draft retention, actual authorized outgoing-message correction, bounded Gemini/local fallback, scripts/runbooks/evidence. Backend/shared files in the stable checkout were NOT edited; package imports unchanged snapshots. No Git writes or stable deployment/restart by this work.

Default demo output is explicitly LOCAL REHEARSAL AUDIO into the existing physical speakers/headphones at zero gain via real selected-voice TTS and tacit-route. It does not compete for BlackHole. Optional `start.command --with-output` refuses an existing router and requires the human's idle/setup window. Current package is running at Scenario A / event 0 / voice authorization OFF; no model or seeded event can authorize output.

Fresh results: server typecheck + 246/246 (initial timing-sensitive RouteHelper 20 ms wait failed, full repeat passed); web typecheck + 84/84 + build; demo TypeScript + 16/16; demo native 122/122; release build/signature verified. Final native five-run rehearsal = 15/15 A/B/C completions through real sockets/client/state/authorization with MOCK TTS/route clearly labelled. Separate real local audio rehearsal = 3/3, including Stop after first audio; no remote-hearing claim. Native primary-scenario Gemini run = two genuine Flash-Lite responses, 1749 ms and 1108 ms, valid sources and unchanged draft; no expected-classification hints or claim of general semantic reliability. Metadata/screen captures/reports in package evidence/. Overall PARTIAL for remote acceptance; READY for local demonstration.

Original owned native SOURCE changes only (not deployed): `IslandController.swift`, new `NotchHoverState.swift`, `LivingNotchTests.swift`, new `NotchHoverTests.swift`. Editor focus no longer silently pins; pointer leave retracts at 300 ms, return restores prior workspace/review at 140 ms without replacing drafts or taking keyboard focus. Explicit Keep island open and explicit Collapse retain their separate meanings. 106/106 original-source tests passed in a separate external scratch build. Stable .build/TACIT.app was not touched. Files are at a stable checkpoint; Claude may review/stage only these owned source/test paths after checking current work.

Owner request: record this checkpoint in canonical HANDOFF if useful; Codex did not edit Claude-owned docs/HANDOFF.md. No automatic recognition-transmission gate was validated, no Chrome/Meet capture was activated, no private recording/credential was copied, no global audio-device setting was changed. Human remaining: remote listener/Meet microphone test, acoustic Stop confirmation, physical hover feel/VoiceOver pass. The source hover fix is available for the owner's later release; do not apply external backend/shared proposals without owner review.
