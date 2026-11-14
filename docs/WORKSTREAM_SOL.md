# TACIT frontend workstream · Codex

Updated 2026-11-14. Ownership: `web/` and this file only. No Git commands or backend/shared edits.

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
