# TACIT native communication experience — isolated handoff

**STABLE — YIELDED FOR CLAUDE**

Final checkpoint: 2026-11-15 01:47:49 UTC. Sol has stopped editing source and yields all listed files for Claude’s review and integration. No other agent is editing them.

## Exact workspace and ownership

- Worktree: `/Users/tanushsavadi/.codex/worktrees/564f/HackUMass 26'`
- Base commit: `e710dfe27e7438a1426ffc92a7d9345f4542c27f` (main, release integration matrix).
- Branch: **detached HEAD**, as provisioned by Codex's authorized managed-worktree tool. No branch created because Claude is the sole Git writer. Proposed branch for Claude: `feat/tacit-native-experience`.
- No Git writes, commits, merges, pushes or edits in the active main working tree by Sol/Astra.
- Current changes are uncommitted companion source/tests/local tooling plus the three isolated documents named below. No server/shared/recognition/TacitRoute/production launcher/model/camera/audio changes.
- Astra was explicitly selected as **gpt-6-astra** for the motion lab. It completed and yielded `Sources/TacitCompanion/Motion/**` and `Tests/TacitCompanionTests/MotionTests.swift`. Sol subsequently added the local reduced-motion-preview hook to the button style. **No agents are still editing those files.**

## Product decision and completed behavior

Chosen thesis: **keep your place → prepare your words → deliberately speak → recover**. The persistent native surface coordinates reviewed visual speech, turn-holding and a preserved draft across apps. Quick phrases/turn-holding already exist in established AAC. The combination and input/output integration are the product hypothesis; no comparative user-validation claim.

Research, initial friction audit, three concepts compared, source links, licensing review and answers to the eight product questions: [NATIVE_EXPERIENCE_RESEARCH_SOL.md](NATIVE_EXPERIENCE_RESEARCH_SOL.md).

Implemented, bound to existing production contracts:

- Reviewed recognition is the primary conversation surface whenever current eligible server candidates exist. Exact strings/casing/hashes are retained. No candidate is preselected. User explicitly chooses raw/decoder/phrase or Edit, then Speak.
- Dedicated `speak_reviewed` request still carries output/Live authorization and generations, utterance ID, kind/index/hash. Corrections retain edited provenance. New headers, expiry, pause, replacement, disconnect and submission lock still reject stale/repeated choices. No recognition is passed to `speak_typed`.
- Inline correction and typed composition replace separate editor windows. Native Command-A/editing and Command-Return verified. Edit now focuses the new field without a second click. Hover does not take the calling app's keyboard.
- **Hold My Turn** speaks the exact saved phrase through authorized typed output, without replacing typed or review drafts. Disabled until current output authorization and route are ready; pending Pause blocks before server acknowledgment. Global **⌃⇧⌘H**, when registration succeeds; local **⇧⌘H** in the focused island. Shortcut registration status appears in diagnostics. No implicit output enable.
- Four expressive phrases: user selection then Speak, customization and local persistence. Only explicitly saved wording persists; no automatic conversation history/personality memory.
- Typed draft stays in RAM across controls, collapse and reconnect. A last **user-authored requested** message can be restored into an empty draft. Requested does not mean delivered/heard.
- Invalidated correction stays in RAM as **read-only reference**, with no stale Speak or transfer to typed speech. Select current recognized words for a new correction.
- Paused, route-unavailable, recognizer-unavailable and disconnected states have a fallback and immediate Stop. Long recognized text scrolls for full review.
- The shell expands to **460×350 pt**, bounded to the selected display. Physical notch measurement, negative/offset display coordinates, fallback and Spaces/wake placement retained. Solid black avoids transparency dependence; high-contrast outline and Reduce Motion respected.
- Astra's bounded native spring retains top-center anchoring, handles rapid reversal and cancellation, snaps under Reduce Motion, and stops its timer at rest. Requested timer cadence follows advertised 60–120 Hz; this is not a display FPS guarantee.

## Assistance: working local workflow versus deferred AI

**Working local scaffolds:** Help Me Respond accepts optional user-provided text, displays its source, offers user-chosen intentions and editable starters, then explicitly adds/uses the draft in the typed composer. A separate Speak is always required. It states **no meeting capture / no AI connected**. Existing typed text is retained; concatenation is labeled Add to draft and blocked beyond the speech limit. Context is ephemeral and Clear revokes/removes it.

**Provider boundary:** `MeetingContextProvider` + `UserProvidedContext` have source, supplied text and `liveCaptureAvailable=false`. This is an abstraction, not a live transcript/capture integration.

**Deferred:** live meeting capture, contextual question detection, LLM generation, personal-memory learning, external action agents, expressive/rate controls, repeat of recognized speech. No suitable authorized native context contract was present. No AI inference/meeting audio/external-provider upload occurs. No personal-voice synthesis/presynthesis/voice-policy change was introduced. Automatic recognized speech remains disabled.

No backend contract additions are needed for implemented Hold, phrases, draft recovery or local starters. Future proposals are documented in the research file. True processing/visual activity states are reserved for genuine published signals; they are not inferred from a socket. A repeated recognized utterance would require a dedicated fresh approved-repeat contract, not typed reclassification.

## Architecture and dependencies

| Component | Interface / responsibility |
|---|---|
| `CommunicationSession.swift` | Local surface/phrases/context/intention. Shared action methods `holdTurn(using:)`, `speakSelection(using:)`, `speakDraft(using:)`, `useAssistanceDraft(in:)` are used by views and tests. `CommunicationState.resolve(Facts)` defines deterministic priority. |
| `CommunicationWorkspace.swift` | Persistent identity/status/Pause/Stop + review/editor body + Hold/phrase/type/help dock. Same composition used by menu fallback. |
| `PersonalExpressionViews.swift` | Phrase selection/customization; local editable response scaffolds. |
| `Client.swift` | Additive `IsolatedTransport` injection, `canSpeakAuthored`/reason and correction recovery memory. Production receive/auth/wire boundaries preserved. |
| `IslandController.swift` | Inline navigation/focus, one `IslandFrameAnimator`, app-view-only snapshots. Offline-only fixture focus helper cannot run with production transport. |
| `Motion/**` | `IslandFrameAnimator.setFrame(_:on:animated:)` / `cancel()`, deterministic `IslandFrameSpring`, `CommunicationMotion` and `CommunicationButtonStyle`. See Motion README for Apple APIs and measured limits. |
| `ExperienceLab.swift` | Distinct offline fixture/interaction lab, sample source labels, native resize/update timing and hover-cancellation harness. No real output. |
| `OfflineSelfTest.swift` | Release executable `--offline-selftest`, recorder transport, no sockets/credentials/camera/audio. |

No dependencies/frameworks added. Existing MIT notices are retained; no GPL source copied. `Package.swift` excludes the motion README from compilation. `CompanionAccessibility.reducedMotionPreview` applies only to isolated lab plus `--lab-reduce-motion`; no global system setting changes.

## Exact modified files

Relative to base, existing files modified:

- `docs/WORKSTREAM_SOL.md` — prepended isolated status/link; historical content preserved. **Do not overwrite main's newer notes; integrate only the new checkpoint.**
- `macos/TacitCompanion/Package.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/App.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/Client.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/CompanionContent.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/IslandController.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/IslandGeometry.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/IslandView.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/ReviewedTextView.swift`
- `macos/TacitCompanion/Tests/TacitCompanionTests/CompanionTests.swift`

New files:

- `docs/NATIVE_EXPERIENCE_HANDOFF_SOL.md` (this file)
- `docs/NATIVE_EXPERIENCE_RESEARCH_SOL.md`
- `macos/TacitCompanion/Sources/TacitCompanion/{CommunicationSession,CommunicationWorkspace,PersonalExpressionViews,ExperienceLab,OfflineSelfTest}.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/Motion/{IslandFrameAnimator,IslandFrameSpring,CommunicationMotion}.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/Motion/README.md`
- `macos/TacitCompanion/Tests/TacitCompanionTests/{CommunicationTests,MotionTests}.swift`
- `macos/TacitCompanion/tools/build-experience-lab.sh`

`git status --short` lists these as M/??. No staged changes; no commit or branch writes.

## Verification and actual interaction observations

- Baseline: 18/18 existing Swift tests passed before edits.
- Integrated native suite: **36/36 PASS**, 0 failures, fresh final run logged at `/tmp/tacit-native-experience-final-tests.log` (final run 2026-11-15 01:45:39 UTC, after the hosting-size fix; 36/36 PASS, zero warnings/errors).
- Release packaging: production `build-app.sh` compiles release and passes ad-hoc signature verification. Build-only; production app was never launched except the offline-only selftest.
- Release binary `--offline-selftest`: **10/10 PASS**, real client actions through isolated recorder, no credential/socket/camera/audio access.
- Offline actual native CUA checks: typed draft; Command-A; Command-Return; Hold preserving unfinished draft; phrase customization and selection; supplied context → intention → edited starter → retained typed draft; current candidate selection; Edit focus with no second click; Pause clearing review; read-only correction recovery; disconnected/unavailable output states and disabled controls. No requests reached a live service or physical output.
- Astra motion pure-model tests: 10/10 integrated; hidden NSWindow cancellation/reversal/convergence/no-key/no-visibility harness also reported by Astra. Existing geometry regressions cover notched, unnotched, offset/negative/small-display positions.
- Reduce Motion: pure spring tests pass; actual isolated native preview `--lab-reduce-motion` rendered and performed snap transitions without changing macOS settings. No actual global accessibility preference was toggled.
- Whitespace and shell syntax checks pass; signatures verified. Final evidence section below supersedes earlier timestamps.

### Performance limits and real measurements

Actual **NSWindow notification cadence**, not rendered frame presentation, measured on a screen advertising 120 Hz, 2026-11-15 01:33:51 UTC:

- Normal spring run: 362 resize notifications; interval p50 **6.06 ms**, p95 **10.47 ms**. Maximum **1014 ms** includes deliberately quiet settling/hover periods. Duplicate notifications and layout behavior mean these numbers cannot be converted to FPS.
- Window-update notifications: 20, p50 116 ms; these are not compositor frames either.
- Reduce-motion preview: 18 resize notifications for explicit snaps; no intermediate native spring frames scheduled. Hover cancellation true in both runs.
- JSON: `/tmp/tacit-native-experience-final/motion-pacing.json`, `/tmp/tacit-native-experience-reduced/motion-pacing.json`. Additional motion rerun writes `/tmp/tacit-native-experience-stable/motion-pacing.json`.
- No idle waveform, invented camera audio signal or permanent animation loop. No GPU/display frame-pacing trace or rendered-FPS guarantee. Physical compositing/inference-contention measurement remains a follow-up.

### Screenshots and capture limitations

Actual app-window CUA screenshots (offline samples clearly labeled where content is expanded), inspected during this session:

`/tmp/tacit-native-experience-final/cua-{collapsed,expanded,review,editing,phrases,assistance,error,recovery,reduced-motion}.png`.

The primary review and final phrase captures show the complete native shell and controls. Some native snapshot calls return partial retained compositor layers, omitting unchanged icons/text even though AX and a later fresh capture include them. This also affected NSView cache images. **Do not use partial captures as production visual evidence.** A trial hosting-tree refresh did not eliminate the capture issue and could let NSHostingView resize the lab unexpectedly; it was removed. Hosting sizing options are now empty so the controller alone owns the bounded window dimensions. All images are UI sample fixtures, not recognition accuracy, AI, live audio, or remote audibility evidence. No private desktop/call/recording was captured. Artifacts remain outside Git; do not stage them. No movie was exported; the offline lab is the interactive motion demonstration.

### Failures found and resolved / limits

- Initial geometry test expected former 420×258 shell; updated to the explicitly changed 460×350 bound, other position safety tests retained.
- Main-actor initializer cannot be a synchronous default argument; optional injection resolved inside controller init.
- SwiftUI Reduce Motion environment is read-only; preview uses a local isolated override instead of mutating that environment/global settings.
- Initial inline correction did not consistently focus after Edit because the view was no longer recreated in a new utility; task keyed to editing plus native defaultFocus resolved and was verified by typing with no extra field click.
- Native screenshots can contain compositor artifacts as noted above. No failing compile/test is represented as passing.
- Physical VoiceOver/switch/motor access and multiple actual monitor configurations are not certified. AX labels/selection/disabled states were inspected; global VoiceOver was not started during Claude's call work.

## Integration instructions for Claude

**First concrete step:** inspect the isolated source diff and new files, then rerun the safe native suite and offline selftest. Do not run the old live `--selftest` against Claude's active runtime.

```sh
cd "/Users/tanushsavadi/.codex/worktrees/564f/HackUMass 26'"
git status --short
git diff -- macos/TacitCompanion docs/WORKSTREAM_SOL.md
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test --package-path macos/TacitCompanion
bash macos/TacitCompanion/build-app.sh
"macos/TacitCompanion/.build/TACIT.app/Contents/MacOS/TacitCompanion" --offline-selftest
bash macos/TacitCompanion/tools/build-experience-lab.sh
"macos/TacitCompanion/.build/TACIT Experience Lab.app/Contents/MacOS/TacitCompanion" --experience-lab
# Optional fixture captures and motion timing, no live services:
"macos/TacitCompanion/.build/TACIT Experience Lab.app/Contents/MacOS/TacitCompanion" --experience-lab --capture-lab /tmp/tacit-native-review
# Optional equivalent preview; never changes macOS preferences:
"macos/TacitCompanion/.build/TACIT Experience Lab.app/Contents/MacOS/TacitCompanion" --experience-lab --lab-reduce-motion
```

**Conflict risk:** `Client.swift` and `ReviewedTextView.swift` may overlap later safety work on main. Preserve Claude's latest generation/hash/invalidation/refusal logic. All feature additions are companion-local; shared protocol is unchanged. Main WORKSTREAM_SOL may have advanced; append the new checkpoint, do not copy the whole historical document. Keep HANDOFF/DEMO_READINESS edits with Claude.

**Review/integration:** Claude may create the proposed branch from the recorded base, review explicit files, and commit under the single-writer policy. Untracked new files are not in ordinary `git diff`; read/include them explicitly. Never copy `.build`, recordings, screenshots, tokens, dependencies or server data. Stage only the cohesive companion feature/tests/docs after confirming this stable yield; no blanket stage. No main replacement or merge was performed here.

**Rollback:** rebuild the previously shipped companion commit, then swap/relaunch only during an idle approved rehearsal. Old app ignores the additive phrase-preference key. There are no server/protocol/model/voice-policy migrations to reverse.

## Remaining physical and product validation

- Real current camera result → explicit native review/correction → synthesis → ordinary call → **listener confirms exact heard words**. This isolated session makes no new remote-audibility or recognition-accuracy claim.
- Hold/custom expressive phrase while using a real call and while composing in another application; verify shortcut registration and no focus theft.
- Pause/Stop while real audio is queued/playing; no stale speech after reconnect/replacement. Offline tests verify requests and blocking, not physical silence.
- Actual notched/non-notch/external display placement, app switching, full-screen spaces, keyboard-only, VoiceOver, high contrast/Reduce Transparency/Reduce Motion, and varied motor-access methods with AAC users.
- Compare effort, speed, turn retention and fatigue against each participant's existing AAC; do not presume articulation/camera use or general benefit.
- Optional LLM/context/capture/action-agent functionality remains deferred, not a production dependency or hidden prototype.


## Final stable checkpoint

**STABLE — YIELDED FOR CLAUDE** — 2026-11-15 01:47:49 UTC

- Final integrated suite **36/36 PASS**, 0 failures (01:45:39 UTC); no warning/error lines.
- Final production release packaging and both app signature verifications passed. Release `--offline-selftest` **10/10 PASS**, exit 0, after final source build.
- Actual native `dimensions.json`: **9/9 match**. Collapsed **261×35 pt** on this display; ready/review/editing/phrases/assistance/error/paused/disconnected **460×350 pt**. Hosting `sizingOptions=[]` prevents intrinsic size from taking over controller dimensions.
- Normal and reduced-motion hover-cancellation harnesses passed. Normal final rerun uses native notifications, not rendered FPS.
- `git diff --check` and companion-local shell syntax passed. No files staged, no Git writes, no main runtime changes.
- Durable artifacts copied to **`macos/TacitCompanion/.build/experience-evidence/`** inside this isolated worktree. Original `/tmp` paths are only working copies. Includes all screenshots (with capture limitations identified above), native dimensions/timing JSON and test logs.
- Review inventory/archive generated under `.build/experience-evidence/`: `source-manifest.json`, `native-experience-source.tar.gz`, `tracked-changes.patch`. The archive includes explicit modified/new source/docs only; screenshots/logs/builds/secrets are excluded. It is a review aid, **not authorization to overwrite main**. The ordinary patch omits untracked new files; the manifest/archive include them.
- Only Sol's isolated lab was stopped at the end. Production app/server/camera/voice route were not stopped or reconfigured.

**First next step for Claude:** inspect the listed files and source manifest from this isolated worktree, preserving latest main safety changes; run the safe suite/offline selftest commands above, then integrate the cohesive companion change under the single-writer policy. Physical call/accessibility validation remains outstanding. No unfinished AI/capture feature is silently wired into production.

**HANDOFF READY — Resume from `docs/NATIVE_EXPERIENCE_HANDOFF_SOL.md`, starting with isolated source review and safe offline verification.**
