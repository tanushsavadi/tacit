# TACIT P1 reliability — Claude integration handoff

**STABLE — READY FOR CLAUDE INTEGRATION**

Verified 2026-11-15 03:08:02 UTC. Implemented in `../tacit-independent-qa`; the live demo checkout, server, companion and audio route were not changed or restarted. No camera, microphone or remote call was used.

Baseline: current `main` = `4920946590657144e286d7387d23f2006201802c`, checked before work and after verification. The QA worktree had detached HEAD `e5c86e51a1832adaa32416b7a596c00e32dd1388` and only untracked QA artifacts. Its tracked files were advanced with a read-only `git archive` filesystem export; no Git metadata or index was changed. All preexisting untracked QA artifacts remain. The actual filesystem was compared against every baseline file: only the three production files below differ; no baseline files are missing. **Do not use an unrestricted `git diff main`, stage the entire QA tree, or copy the entire native directory:** its older index does not track the unified-release additions.

Branch / commit: **none created**. `AGENTS.md` reserves all Git writes for Claude: “Other agents (Sol/Codex, Gemini) ... never run Git write commands.” The user explicitly requested the patch/worktree fallback if this restriction applies. Requested integration branch: `fix/tacit-p1-reliability`. No merge or deployment is authorized by this handoff.

## Files in the integration patch

Production:
- `macos/TacitCompanion/Sources/TacitCompanion/Client.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/CommunicationWorkspace.swift`
- `macos/TacitCompanion/Sources/TacitCompanion/CompanionContent.swift`

Regression tests / repeatable isolated verification:
- `macos/TacitCompanion/Tests/TacitCompanionTests/AuthoredPendingAuditTests.swift` (new)
- `macos/TacitCompanion/Tests/TacitCompanionTests/ConversationAuditTests.swift` (new)
- `docs/qa/conversation.test.ts` (new on main; extends the preserved independent QA harness)
- `docs/qa/vitest.config.mjs` (new on main)
- `docs/qa/verify-p1.mjs` (new)
- This handoff, `docs/P1_RELIABILITY_HANDOFF_CODEX.md` (new)

Local coordination notes in `docs/HANDOFF.md`, `docs/WORKSTREAM_SOL.md`, `docs/QA_HANDOFF_CODEX.md` and `docs/qa/README.md` point here. They are not in the integration patch, to avoid overwriting Claude's current coordination notes. The historical `proposed-native-reliability.patch` remains intact; integrate **`docs/qa/implemented-p1-reliability.patch`** instead. Its SHA-256 and the exact integrated-file hashes are in `docs/qa/p1-reliability-manifest.json`.

## Root causes and behavior

1. Every native authored Speak, Hold and phrase action minted a fresh request ID. The backend correctly deduplicates IDs but cannot tell that three different IDs came from one pending message. A native pending-operation record now binds request ID to output authorization, generation and the hash of the exact trimmed transmitted text. It is installed before sending, including synchronous acknowledgments. Identical pending text is suppressed across all authored entry points and across My Voice changes. Distinct messages still queue. Only a matching typed terminal delivery under the current authorization/generation releases that operation. Progress, unrelated/stale deliveries, queue-status refreshes and an earlier operation's duplicate terminal cannot unlock it. Pause/stop, changed authorization/generation and disconnect discard the obsolete pending guard; they never resend anything. Each later explicit Speak creates a fresh operation with current authorization and voice revision.

2. Submitting an edited review set `reviewSubmittedID` before clearing `reviewDraft`. The draft-preservation observer intentionally skips submitted drafts, so the only corrected copy was lost. The client now retains the exact correction in RAM **before** clearing the editor or sending. It survives unacknowledged delivery, progress, every terminal outcome, invalidation and reconnection. The correction stays a read-only reference; it never populates `typedDraft`, preselects a candidate, or creates an authorization. The previous-correction link remains available even when a new current hypothesis is shown. Recovery copy explicitly explains uncertain delivery and no automatic retry. The legacy native typed composer also keeps its draft after a request, matching the unified composer.

My Voice keeps its existing acceptance-time binding and revision checks. The pending duplicate key intentionally excludes voice revision: a voice switch cannot turn an in-flight identical message into another operation. A later deliberate repeat after terminal acknowledgment uses the newly displayed revision. Corrected speech retains its dedicated `speak_reviewed` request with exact text/hash, output authorization/generation, Live authorization/generation, utterance ID, candidate basis and voice revision. No backend/protocol change, LLM rewrite, voice substitution, or automatic recognized speech was added.

## Reproduction and regression evidence

On unmodified `4920946` source, run the added native tests before the production change:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test --package-path macos/TacitCompanion --filter 'ConversationAuditTests.testAdversarialRapidAuthoredSpeakMustNotDuplicatePendingMessage|ConversationAuditTests.testSubmittedCorrectionSurvivesDisconnectionAsReadOnlyReference'
```

Observed: 2 tests failed, 4 assertions. Three rapid actions emitted **3** `speak_typed` requests for each of draft, Hold and phrase; submitted correction became **nil** after disconnect/reconnect. Preserved log: `server/data/p1-reliability/before.log` (ignored; do not stage).

Manual reproduction for later physical rehearsal:
1. With voice output authorized, type a draft and click Speak three times before terminal delivery; repeat with Hold and a selected phrase. Before: three requests/audio queue entries; after: one, with pending-message feedback. A different message remains usable while the first is pending.
2. Choose Edit for a current recognized candidate, type a correction and press Speak; lose the connection before terminal status. Before: correction lost. After: View previous correction shows the exact text, and reconnect sends no speech. With a fresh current utterance, the user must explicitly select/edit and press Speak again. Uncertain delivery may already have played partly or fully; never retry automatically.

Regression coverage also exercises queued/synthesizing/routing and rendered/refused/failed/interrupted events; unrelated/stale/duplicate acknowledgments; synchronous refusal; trimmed authored input; voice changes while pending; distinct Hold + draft; repeated Pause/Resume; stop/disconnect; fresh session generation; exact Unicode/whitespace correction hashes; no preselection after reconnection; no corrected-to-typed conversion; native wire replay through production LiveSession, SpeechOutput and voice-binding contracts.

## Fresh verification

Command (Node 22; isolated QA checkout with no `server/.env`):

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH node docs/qa/verify-p1.mjs
```

Final evidence: `server/data/p1-reliability/2026-11-15T03-05-50-491Z/report.json` and its per-gate logs (ignored, local only). All **14 gates exit 0**:

| Gate | Result |
|---|---|
| Companion `swift test` | **54/54**, including 14 added regression/audit cases and the existing 4 My Voice cases |
| Companion release build | PASS |
| Release binary `--offline-selftest` | **10/10** |
| TacitRoute Swift tests | **4/4** |
| TacitVoice Swift tests | **5/5** |
| Backend typecheck + full tests | PASS, **167/167** in 15 files (includes speech, reviewed, review-race, My Voice, preview, route, auth/security and voice-policy cases) |
| Integration harness strict typecheck + native wire replay | PASS, **29/29** |
| Web typecheck + tests + production build | PASS, **80/80** |
| Passive preflight helper tests | **3/3** |
| `npm run security:check` | **13/13**, separate ephemeral loopback server, route/voice/recognizer disabled, separate temporary directory and QA-only secrets |

Earlier failed harness runs are preserved in the same ignored evidence folder: one invalid assertion signature, one macOS Unix-socket path limit, and the security fixture initially lacked an STT adapter (closing invalid Twilio streams before the script's expected token-check path). These were harness/configuration issues. The final fixture uses an unreachable local STT endpoint so invalid stream tokens are checked before any transcription; no inference occurs. All failures are resolved in the final gate.

## Limits / unresolved issues

No unresolved P1 implementation or automated-test failure remains. The tests use real product state machines with **synthetic recognition, synthesis and routing**, not measured silent recognition or remote audibility. The separate security server uses the real HTTP/WebSocket handlers with audio disabled.

Physical `speech:check`, `myvoice:check --preview`, `route:check`, live recognition/stress and the connected companion `--selftest` were deliberately **not run**: those can emit audio into the same Mac's virtual microphone, alter calibration, or control the live session even from a separate server. Human Meet-listener checks (exact words once, selected voices, reviewed/corrected speech, Hold, phrase and Stop), camera recognition and accessibility rehearsal remain required after Claude's review and an explicitly scheduled demo-runtime change. Do not read this status as permission to restart or deploy. Automatic recognized-speech transmission remains disabled by the existing reliability gate.

## Exact integration instructions — Claude, sole Git writer

1. Keep the live checkout unchanged. Inspect current `main` and the working trees; preserve every existing change. Create a separate integration worktree on a dedicated branch from `4920946` or newer. For example, from the repository (only Claude executes these Git writes):

```sh
git worktree add -b fix/tacit-p1-reliability ../tacit-p1-integration main
cd ../tacit-p1-integration
```

2. Review `../tacit-independent-qa/docs/qa/implemented-p1-reliability.patch` and its SHA-256 manifest. Apply **only this patch**, not the QA worktree's broad diff or old proposed patch:

```sh
git apply --check ../tacit-independent-qa/docs/qa/implemented-p1-reliability.patch
git apply ../tacit-independent-qa/docs/qa/implemented-p1-reliability.patch
```

If current main has changed these files, resolve the small targeted changes against the current native/My Voice code; never replace whole directories. The artifact was validated by applying it to a clean `4920946` source export and comparing all patched file hashes with the verified QA source.

3. Install worktree-local dependencies if absent (`npm ci` in `server` and `web`; do not copy demo `.env`/data or change the running app). Run the isolated verification command above. It refuses a checkout containing `server/.env`, uses a random loopback port, and shuts down only the security server it starts. Review all 14 results. No live audio checks are included.

4. Review the exact file list above. Add the nine explicit paths (three production, two native tests, three QA harness files, this report); run `git diff --cached --check`, `git diff --cached --stat`, and read `git diff --cached`. Commit one cohesive change, suggested subject: `fix(companion): suppress pending duplicate speech and preserve corrections`. Record the branch/commit and verification result in the canonical HANDOFF. No recordings, QA evidence/data, secrets, build output, old QA reports, or broad baseline-export changes belong in that commit.

5. Leave the branch for review. **Do not merge into main, restart the demo, or launch physical audio checks automatically.** Schedule the physical checks only when the live session can be deliberately controlled. There is no automatic retry on uncertain delivery at any stage.

The QA source and patch are yielded at this stable checkpoint for Claude's integration; no Git write was performed by Codex.
