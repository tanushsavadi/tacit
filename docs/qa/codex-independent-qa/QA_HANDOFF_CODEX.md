> Follow-up: both P1 fixes are now implemented and stable in this isolated worktree. See [the implementation handoff](P1_RELIABILITY_HANDOFF_CODEX.md). The baseline findings and proposal-only status below are historical.

# Independent demo reliability audit — Codex

Assessment: **NO-GO for complete demo acceptance** until QA-01 and QA-03 below are fixed and the physical listener checklist passes. This is a narrower, independent gate than the earlier release recommendation. No P0 authorization bypass was reproduced. The repeated-click defect is accidental duplicate delivery under repeated user action, not an authorization bypass.

## Provenance and scope

- QA worktree: `/Users/tanushsavadi/Documents/Hackathons/tacit-independent-qa`, detached at **e5c86e51a1832adaa32416b7a596c00e32dd1388**. Created with the user's explicit authorization for an isolated worktree. No commits, staging, push, branch changes, resets or changes to other worktrees by this audit.
- Native release advanced during the audit: **03cb9a4** (communication experience), **263e872** (native My Voice), then **35ec16a** (offline lab voice-status input). Final harness snapshots the latter release from main; source hashes and dirty-state metadata are recorded. Backend/shared source in QA is byte-identical to the inspected merged release; the harness checks backend, shared and script equivalence on every run.
- Closing read: main **4920946590657144e286d7387d23f2006201802c** changes HANDOFF/RELEASE_RUNBOOK only; implementation remains the tested 35ec16a source. The rewritten runbook closes QA-04 below.
- Read AGENTS, HANDOFF, RELEASE_RUNBOOK, DEMO_RUNBOOK_CODEX, WORKSTREAM_SOL and Sol's NATIVE_EXPERIENCE_HANDOFF_SOL. Main's HANDOFF still described My Voice as unmerged during initial inspection; commit/source checks took precedence. No other agent's handoff was overwritten.
- Changes: **only this document and `docs/qa/**`** in the isolated QA worktree. Dependencies and source/build/evidence snapshots are private under ignored `server/data/independent-qa/`. Existing recordings, calibration, models, system preferences and worktrees were preserved.
- Tested only synthetic inference, fake audio bytes and recorder output, plus passive real health/device queries. No camera, live control socket, real synthesis/playback, BlackHole changes, production app launch, runtime restart or server stop by this audit. Claude's concurrent integration changed the running release independently.
- Evidence is synthetic QA metadata, never proof of live silent-recognition accuracy or remote hearing. Credentials stayed in memory; no credential literals or private URLs were written to reports.

## Reproduce

From the QA worktree, with the project's Node 22 and the installed Xcode toolchain:

```sh
cd "/Users/tanushsavadi/Documents/Hackathons/tacit-independent-qa"
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
(cd server && npm ci --ignore-scripts --no-audit --no-fund)
node docs/qa/acceptance.mjs \
  --native-root "../HackUMass 26'" \
  --runtime-root "../HackUMass 26'"
```

Each invocation creates a new ignored evidence directory and preserves previous runs. Exit 1 means a failed gate; exit 2 means automated gates passed with human checks outstanding. Current intentional regression failures keep this command red. Do not change expectations to make it green.

The harness copies Package.swift, Sources and Tests into its own directory, adds independent XCTest cases there, reuses `npm test`, typecheck, the existing native offline selftest and passive preflight, then feeds native-generated requests through the real backend `SpeechOutput` class with a fake route. It never imports the backend entrypoint or starts a server. Session authorization IDs/generations are explicitly translated between independent fixture sessions; text, hashes, kinds, indexes and request IDs are preserved. This is contract replay, not a native-to-live-WebSocket end-to-end test.

Primary final evidence directory: `server/data/independent-qa/2026-11-15T02-39-51-960Z/` (**Node 22**, complete at 02:40:17 UTC). Earlier comparable runs: `2026-11-15T02-31-35-129Z/` and `2026-11-15T02-35-30-107Z/` (Node 26 wrapper limitation, QA-07). Read `report.json`, `native-with-audit.log`, `conversation-contracts.log`, `native-wire.json{,.rapid.json,.motion.json}`, source manifests and runtime logs. They contain exact timestamps and commands' results. They are ignored; never stage build snapshots or evidence wholesale.

## Reproducible defects and integration recommendations

### QA-01 — P1: rapid authored Speak queues duplicate speech

Affected: `Client.swift:speakTyped`, and `CommunicationSession`'s draft, Hold and phrase actions. Seen in merged **263e872** and final native snapshot.

1. Output ready with current authorization/generation and a ready route.
2. Type a message, or choose a saved phrase, or use Hold My Turn.
3. Click the corresponding Speak/Hold action three times before any acknowledgment.
4. Observe **three `speak_typed` messages with different UUIDs**. Replay those exact native requests into SpeechOutput: **three route.play calls**. Expected: one pending instance of the intended message.

Deterministic reproduction: `ConversationAuditTests.testAdversarialRapidAuthoredSpeakMustNotDuplicatePendingMessage`; backend replay cases `native rapid draft/hold/phrase Speak must reach output once, not three times`. Three assertion failures in the native test and three separate failing backend cases. Reviewed speech correctly rejects repeated Speak and is unaffected.

Minimal suggested fix for Claude/Sol: track a pending authored request by normalized text/hash plus output authorization/generation and voice revision **before sending**. Block the same message while pending; allow a different longer message after Hold. Correlate terminal delivery to the request before unlocking, preserve the draft and never auto-resend after uncertain delivery/reconnect. A deliberate repeat after completion can remain possible. The server correctly treats distinct IDs as distinct approvals; global text deduplication in the backend would incorrectly suppress intentional later repeats.

### QA-03 — P1: submitted correction is lost on uncertain delivery/reconnection

Affected: `Client.swift:reviewDraft.willSet`, `speakReviewed`, `resetServerState`.

1. Receive current recognition A; explicitly Edit.
2. Enter a user-authored correction and press Speak.
3. Disconnect before delivery outcome is known, then reconnect.
4. `reviewDraft` is empty, `lastDelivery` is cleared, `preservedCorrection` is **nil**. No retained correction reference remains. The typed draft is correctly untouched.

Deterministic reproduction: `testSubmittedCorrectionSurvivesDisconnectionAsReadOnlyReference`. The source sets `reviewSubmittedID` before clearing the draft; the preservation observer deliberately excludes this submitted ID. A failure after submission therefore loses the user's work, while invalidation before submission correctly preserves it.

Minimal suggested fix: when submitting an **edited** review, retain that user-authored string in the existing RAM-only `preservedCorrection` reference before clearing the draft. Keep the old utterance non-speakable, with no transfer to typed speech and no automatic replay. Add refusal/failure/disconnect tests. Do not resurrect the consumed review or weaken backend identity checks.

### QA-02 — resolved integration gap: native voice revision

The **03cb9a4** client omitted voiceRevision; **263e872** includes it and the independent revision test passes. Existing My Voice tests also pass. Do not report the old gap as an outstanding defect. Approval-time voice binding and stale revision refusal pass against the actual backend state machine. Private preview behavior passes existing unit tests; this audit did not play or listen to previews.

### QA-04 — resolved P1 procedure: unsafe historical rollback in RELEASE_RUNBOOK

The initial runbook returned to a revision predating the reproduced review-race fixes. **Closed by Claude's 4920946 rewrite**, independently read at audit close: rollback now targets the tagged e710dfe release, which retains those fixes. Do not follow the superseded historical instruction. This audit's recovery card uses the current runtime and contains no checkout/reset/rollback command.

### QA-05 — P2: route-helper test has a timing flake

One full run at **02:29:13 UTC** produced 166/167: `route.test.ts:49`, expected play IDs a/b/c, observed `[]` after `await tick(20)`. Targeted rerun: **8/8 pass**; subsequent full run: **167/167**. This is a fixed-wait test under filesystem/load scheduling, not evidence of a physical output failure. Suggested test-only fix: await the fake child's observable play messages with a bounded condition instead of assuming async file writes finish in 20 ms. Preserve the original failure log.

### QA-06 — P2: preflight can count an offline lab as a competing companion

At **02:33 UTC**, `pgrep -x TacitCompanion` found the production bundle and a separate `TACIT Experience Lab.app`. The wrapper reported two competing instances even though the lab's source disables network/hotkeys. No process was killed by QA. Suggest counting production app identity separately from isolated labs. A later passive run returned zero failures after the other owner's lab exited. Earlier generic base-preflight failures remain in the evidence; do not relabel them as product speech failures or erase them.

### QA-07 — P2 tooling: passive wrapper is incompatible with this worktree's default Node 26

Main's shell selected Node **22.23.2**, while the new QA worktree's shell selected Node **26.8.1**. The existing passive wrapper's permission-restricted child fails on Node 26 with `ERR_ACCESS_DENIED`, permission **Net**, resource **tsx temporary IPC path**. Running the same wrapper with the project's Node 22 succeeds (exit 2, unresolved human checks). Filesystem protections remain intact. Minimal recovery: use the Node 22 PATH above; do not broaden production permissions. Older generic wrapper failures in `02:31`/`02:35` harness logs are this QA environment mismatch, not a speech-path failure. Final gate rerun uses Node 22. Future wrapper compatibility should be separately tested before changing its permissions.

## Automated results and coverage

Stable baseline / final equivalent source:

| Check | Result and limit |
|---|---|
| Backend typecheck and independent test typecheck | PASS |
| Existing backend tests | 167/167 on clean rerun; one recorded timing flake above |
| Web fallback typecheck / tests / build | PASS / 80/80 / PASS in QA worktree; no browser capture or remote delivery claim |
| Existing native suite | 40/40, including 4 My Voice tests and 10 spring tests |
| New native audit | 8 tests: 6 pass, 2 fail (four assertions: three duplicates + one lost correction) |
| Native total with audit | 48 tests: 46 pass, 2 fail; XCTest reports 4 assertion failures |
| Existing native offline selftest | 10/10 PASS; actual release-client actions, recorder transport only |
| New backend conversation audit | 21 cases: 18 pass, 3 expected-to-fail duplicate-delivery regressions |
| Existing preflight helper tests | 3/3 PASS; credentials not created/rewritten/disclosed |
| Native snapshot stability | PASS; copied source hash equals inspected source before/after testing |
| Actual runtime | Recognizer reachable; automatic speech false; BlackHole 16ch ready; My Voice engine ready after Claude's integration. Remote Meet listener remains unverified |
| Final passive preflight under Node 22 | **0 FAIL, 4 human actions**, exit 2 |

Coverage: repeated/late recognition; candidate arrival during editing; pending approval revoked by newer header; Stop during synthesis and routed playback; 20 acknowledged Pause/Resume cycles; Hold → longer message; expressive phrase while review remains current; voice switch during queued synthesis; ten rapid reviewed Speak requests; rapid authored clicks; disconnect during delivery; invalid IDs/hash/generations/authorizations; typed draft retention and correction reference recovery. Fake recognizer inputs are explicitly labelled synthetic and cannot establish WER or real recognition reliability.

Expected safety behavior, not defects: new accepted headers immediately revoke old review and can cut reviewed audio; Pause invalidates the current review; stale picks cannot be retried by rebinding them; explicit selection and Speak are both required; reconnect never resends an uncertain message; automatic recognized speech remains disabled. Presenter must stay still while reviewing, and wait for reviewed playback to finish before mouthing the next sentence. A teammate can narrate.

## Performance and accessibility findings

- Fresh hidden-NSWindow test: 20 rapid 16 ms retargets, then convergence; exact final dimensions, no key/focus theft, invisible window and no subsequent resize notifications at rest. Final **02:40:14 UTC**: 75 resize notifications, interval p50 **8.89 ms**, p95 **16.78 ms**. These are timer/resize notifications, **not compositor frames/FPS, animation smoothness, or input latency**. Pure Reduce Motion/reversal tests also pass. Global macOS Reduce Motion was not changed.
- Real native offline CUA interaction on the integrated communication experience (**03cb9a4**): typed entry, Cmd-A/Cmd-Return, phrase selection, Hold preserving draft, correction focus without an extra click, Pause, read-only correction recovery, Stop and error surfaces. Phrase labels/selected traits and emergency Stop were visible in AX; inspected phrase screenshot had complete content. Later **263e872** offline My Voice UI also exercised: Samantha → Use Eddy updates the effective name/selected trait; language, preview, rate/pitch and Stop labels present. No preview was played and this lab registry was synthetic. My Voice's screenshot exhibited Sol's documented retained-layer capture artifact (unchanged header/dock partially omitted); AX controls remained present. Do not treat that image as evidence of a missing Stop control. Settled screenshots cannot prove frame pacing or voice quality. Both QA fixture apps were quit; production app untouched.
- 25 one-second `ps` samples during offline **debug** lab use: RSS **112,832–124,144 KiB**, maximum reported CPU **36.1%**. Log: `2026-11-15T02-25-09-134Z/lab-process-samples.json`. Short sample, startup/layout/tool interaction, no inference or Meet load: no leak, sustained-CPU or production-performance conclusion is justified.
- No fresh physical Speak latency measurement: real playback was excluded to preserve the active integration session. Claude's earlier My Voice report records local onset p50 65–76 ms (n=10 per comparison) and Stop 7–8 ms; those are **attributed prior measurements**, not independent results or remote-call latency. Passive HTTP time is not speech latency.
- **Keyboard conditional:** plain Tab from native editors did not reach Speak/buttons on this Mac's current configuration; Cmd-Return worked and Escape collapsed. The global AppleKeyboardUIMode preference was unset. Full Keyboard Access/Keyboard Navigation was not changed. Test full traversal, visible focus, menu operation and Stop on the actual presenter's configuration before claiming keyboard-only usability. Complex global shortcuts alone are insufficient for many motor-access users.
- **VoiceOver unverified:** AX labels/order/selected/disabled states were inspected; VoiceOver speech was not started during call work. Status/error changes are plain SwiftUI Text; no explicit announcement mechanism was found. Check announcements of new result, invalidation, failure, disconnection and Stop without moving the editor's focus. An AX tree is not a screen-reader listening test.
- **Text size/motor effort, P2:** fixed 9–13 pt secondary text and 460×350 shell; saved phrases allow 500 UTF-16 units but picker labels show two lines. Long similarly prefixed phrases can be visually ambiguous before Speak. Test enlarged text/display scaling and full selected wording. Header icon hit areas are 28 pt; alternatives/enable/reselect/edit flows and multi-modifier global shortcuts need practical motor-access review. Recognition invalidation is safe but can impose repeated correction work.
- **Contrast conditional:** black background, white/mint labels, textual state and selection checkmarks observed. Source white opacity .60/.72 on black implies about 7.4:1/10.6:1, but this does not certify every rendered state, dynamic system color, disabled state or focus ring. High-contrast and Reduce Motion branches exist and pure motion tests pass; actual system preference combinations/text scaling remain human checks.
- No automated check or engineer interaction here constitutes validation by actual AAC users.

## Compact judge-demo recovery card

Run commands from the **integrated runtime checkout**, never the QA worktree with no models/assets. The supported commands were inspected; passive preflight and device enumeration were executed. Pause/Stop/stale/reconnect recovery was exercised with fixtures. **Hardware permission changes, real call failures and full runtime restarts were not deliberately induced.**

1. **Any uncertain speech / frozen controls:** mute the Mac's Meet microphone first. Try native **Stop everything / ⌃⇧⌘.**. If native is frozen, use the original browser workspace **Stop session**. A disconnected/frozen native app cannot guarantee delivery of Stop. Do not unmute or resend an uncertain message until the listener confirms what was heard.
2. **Camera denied/busy:** Stop preview; keep the original workspace in a separate visible window, Meet camera off. In macOS **System Settings → Privacy & Security → Camera**, allow the actual browser; also allow Camera for the localhost site's browser permission. Close only competing camera apps you deliberately opened. Return and use **Retry Live preview**. Reopening private workspace: `./scripts/tacit.sh open`. Native has no camera of its own. Use typed AAC/phrases if camera recovery fails. No `tccutil reset` or new capture during an active session.
3. **Recognizer unavailable:** use authored typed/phrase speech; do not label it recognition. Run `./scripts/tacit.sh preflight`; let supervised recovery complete (prior release measured about 8 s, no fresh guarantee). If still unavailable, stop Live/output and make the call idle, then perform step 8. No model replacement/retraining.
4. **Stale/expired review:** never resend old tokens or copy recognized text into typed speech. Check the current result; select it again only if still current. Otherwise mouth a new utterance and review it. Previous correction is reference only. Until QA-03 is fixed, a submitted correction may be lost if disconnected; do not assume its recovery button will exist.
5. **No sound in Meet:** confirm local delivery says rendered (this alone is insufficient). Meet **More options → Settings → Audio → Microphone = BlackHole 16ch**; speakers = physical output/headphones. Unmute Mac Meet; second device joins normally with its own mic muted. Listener reports exact words once. A meter or a `tacit-route` reader is not proof of a Meet listener. If rendered but clipped, rehearse available noise-cancellation settings and keep the configuration that a listener verifies.
6. **Wrong BlackHole device:** while active, mute and stop first. Read-only inventory: `./macos/TacitRoute/.build/release/tacit-route list`. This Mac's measured intended device is **BlackHole16ch_UID**, 44,100 Hz. If only Meet is wrong, select that microphone in Meet. If the server is wrong, after making the runtime idle use `TACIT_ROUTE_DEVICE_UID=BlackHole16ch_UID ./scripts/tacit.sh restart`, then preflight. This environment override is for that launch; owner should reconcile persistent configuration. Do not change macOS default output to BlackHole, aggregate devices, channel maps or calibration during judging. `route:check` plays a tone and rewrites calibration: do not use it as passive recovery.
7. **Missing/unavailable voice:** inspect **My Voice** and its explicit reason. Do not silently substitute a personal voice. Deliberately choose an available voice (or Use default only if you intend it), wait for acknowledged selection and approve again. Preview is local audio; only listen when the call is muted and preview safety allows it. Apple Personal Voice is not offered as a routed call voice. If all synthesis fails, show the written draft; do not claim delivery.
8. **Safe restart after failed attempt:** mute Meet; stop browser camera/Live and output; confirm call idle. Owner runs `./scripts/tacit.sh restart` (or `start` if stopped), then `./scripts/tacit.sh preflight` and `node docs/demo-preflight-codex.mjs`. Never run these restart steps during an active TACIT session. Check exactly one production companion. If missing, launch **once** with `node macos/TacitCompanion/tools/open-companion.mjs` (no `--selftest`). A frozen companion can be quit/force-quit through macOS only after the call is muted and runtime idle; don't kill all similarly named lab processes. Reconnect, deliberately enable voice/Live, verify the selected voice/route and obtain a fresh review. Ask listener to verify a short authored message and Stop before resuming the demo. No destructive reset or safety-regressing rollback.

Human rehearsal, on the exact judging setup: three naturally mouthed utterances with distinct current reviews; exact chosen alternative and correction heard once; Hold followed by longer draft; expressive phrase; Stop mid-sentence and silence afterward; keyboard/focus and VoiceOver recovery; reconnect with retained typed draft and no automatic resend. Do not enable automatic transmission.

External settings references checked during the audit: [Apple camera access](https://support.apple.com/en-euro/guide/mac-help/mchlf6d108da/27/mac/27), [Apple accessibility keyboard settings](https://support.apple.com/en-ie/guide/mac-help/mchlae61a6de/27/mac/27), [Apple accessibility settings](https://support.apple.com/en-euro/guide/mac-help/mchlp1400/27/mac/27), [Google Meet audio device setup](https://support.google.com/meet/answer/10409699?hl=en), [Google Meet noise filtering](https://support.google.com/meet/answer/9919960?hl=en). These document settings; they are not TACIT-specific success evidence.

## Validated proposed fix — isolated copy only

`docs/qa/proposed-native-reliability.patch` contains the minimal Client.swift proposal for QA-01/QA-03. It was **not applied to any production/native worktree**, staged or committed. `propose-fixes.mjs` copies the frozen native snapshot, applies exact-context replacements there, generates the reviewable patch and runs the tests. A changed source context aborts generation. Evidence: final baseline directory's `proposed-fix-validation/` (completed **02:45:02 UTC**).

- Native: **51/51 PASS**, including all 8 original independent audit tests plus 3 new adversarial acknowledgment/repeat tests.
- Backend native-wire replay: **21/21 PASS**, including all three former duplicate-delivery failures.
- Existing native offline selftest: **10/10 PASS**.
- Additional cases show progress events, unrelated terminal events and stale authorization/generation cannot unlock a pending message; a matching terminal permits a later deliberate repeat without automatic retry; Hold → longer message stays usable; reconnect preserves typed text without sending it.
- Retained corrections remain RAM-only unsendable references. No stale review resurrection, new protocol, model change, recognition-to-typed conversion, pre-synthesis or voice substitution.

Reproduce against a **new baseline evidence directory** (existing validation directories are preserved):

```sh
node docs/qa/propose-fixes.mjs server/data/independent-qa/NEW_BASELINE_TIMESTAMP
```

Review the generated patch against current main before integration; the baseline's implementation is 35ec16a and closing main 4920946 changed only docs. Integrate the existing audit tests plus `AuthoredPendingAuditTests.swift` with the fix. Do not replace Client.swift from an old worktree. This green candidate does **not** turn the deployed release's red baseline into a pass; actual integration and physical verification are still outstanding.

## Stable handoff to Claude

**QA files are stable and yielded for review; no production implementation files were edited.** Minimal next integration: review the validated QA-01/QA-03 patch in the owned native client, then rerun this harness against the integrated release and complete the human listener/accessibility rehearsal. QA-04's runbook fix is already on main. Keep the safety expectations intact. Do not merge the QA source snapshots, build output, dependency directories or private evidence. Append the short note in `docs/qa/HANDOFF-entry.md` to canonical HANDOFF under Claude's ownership; this audit leaves that file untouched. The standalone [judge recovery card](QA_RECOVERY_CARD.md) is ready to print.
