# Verification and release verdict

Date: 2026-11-15. These are development checks on synthetic conversations, not recognition reliability validation or clinical/user-benefit evidence.

**Local demo: READY. Overall acceptance: PARTIAL.** Native scenarios, real local TTS and Stop work. Real incoming Meet capture is intentionally replaced by seeded transcript events. Remote Meet audibility and listener-confirmed Stop remain UNVERIFIED. The stable deployed application has not been replaced or restarted by this work.

## Fresh automated checks

| Check | Actual result | Evidence |
|---|---|---|
| Demo/runtime + imported source TypeScript | PASS | demo-typecheck.log |
| Dedicated demo state/socket/speech-boundary tests | 16/16 PASS | demo-tests.log |
| Existing server TypeScript | PASS | command run in candidate/server |
| Existing server regression | 246/246 PASS on repeat | server-tests-rerun.log |
| Existing web TypeScript/tests/build | PASS, 84/84 | web-tests.log, web-build.log |
| Demo native suite | 122/122 PASS | native-tests.log |
| Stable-source hover-only suite | 106/106 PASS | stable-source-hover-tests.log |
| Release app build/ad-hoc signature | PASS | native-build.log |
| One-command startup/native owner connection | PASS | start-check.log |

One initial unchanged server RouteHelper test failed under concurrent builds: its 20 ms filesystem wait observed no queued play commands. The complete suite passed 246/246 on repeat. No owner-managed backend test/source was modified to conceal this. The original test remains timing-sensitive.

## Native end-to-end rehearsals

The harness drives the actual native FlowClient/TacitClient and real authenticated sockets. It selects source questions, enters and versions user text, advances events, preserves drafts, saves/returns to the launch question, edits the changing-time response, authorizes exact speech, and resets each scenario. It captures the actual native view. It does not render SwiftUI fixture screenshots.

- Five runs × three scenarios = **15 successful scenario completions**, zero reported unexpected errors; exact text/reset assertions passed. Automated TTS and route are clearly mocked for isolation. Reports: `evidence/native-five-run/rehearsal.json` and final `evidence/rehearsal-mock/rehearsal.json`.
- Separate **real local audio run: 3/3 scenarios PASS**, real selected system voice → TTS → tacit-route → BuiltInSpeakerDevice at 0 dB. Monday is genuinely approved/rendered before the Tuesday correction is formed and approved. In A, a separately approved longer message reaches first-audio routing, then Stop leaves output off with zero queued messages. `evidence/real-local-audio/rehearsal.json`, `evidence/real-local-audio.log`.
- This is local software/route evidence. Acoustic audibility and remote audibility are not inferred from rendered state. No remote participant or listener acknowledgment is fabricated.
- Native mouse interaction was also exercised through the actual accessibility controls: scenario selection, Start, Next, Respond, draft editing and explicit voice enable. The automation tool intermittently loses references to the retracting non-main notch panel. Controller-level tests verify retract/restore and exact draft preservation; a human pointer feel/VoiceOver pass remains desirable.

## Genuine Gemini evidence

Actual configured Google GenAI SDK path, default model `gemini-3.5-flash-lite`, synthetic transcripts only. There are no expected classifications, answer hints, approved response sentences or fixture labels in the model input. Gemini sees the engine's transcript turns and selected source citations. Its output has no speech or draft-writing capability.

- Native primary-scenario verification completed with **two real responses**, **1,749 ms and 1,108 ms**; both source validations accepted. Native checks confirmed the time-change card and unchanged user draft. Metadata: `evidence/gemini-native/gemini-operations.json`; report and actual UI captures in that directory.
- Earlier manual native Control Center request: real source-checked Gemini response, **2,020 ms**, observed in presenter controls. Not averaged into the two-call run.
- Additional manual Scenario C question inference succeeded during UI inspection. No unsaved latency is invented for it.
- Total deadline five seconds; model cancellation/stale epochs enforced by the existing engine. Eight requests/minute, 80 per process lifetime; 429 blocks further cloud work for a minute. SDK retry attempts remain one. The provider falls back visibly to narrow deterministic lexical analysis. There is no recorded response presented as a new API invocation.
- No claim of Gemini superiority: the earlier candidate's broader semantic evaluation missed its targets. These rehearsals establish that the selected demo workflow can run, not general semantic reliability. Exact quotation grounding does not prove correct interpretation. Ambiguous links are labelled uncertain; users can inspect, keep, dismiss or edit.

## Failure checks

Tests exercise reset mid-inference with an abort-ignoring provider, transcript/draft versions, invalid source references, malformed/extra fixture fields, duplicate events and double Next, repeated Start, early/manual and delayed/timed advancement, pause/resume/reset stale timers, 429 backoff, network outage, five-second timeout, disabled source, owner disconnect/teardown, competing owners, authorization refusal, and unchanged authored text. Native tests also verify hover retraction/restoration without losing drafts, explicit pinning, reconnection text recovery and Stop clearing recoverable text.

Port conflicts are rejected before child launch. Meet-output launch rejects an existing speech router rather than stopping it. Local output explicitly selects an existing physical output at zero gain and leaves global defaults unchanged. Stop only signals the supervisor whose recorded workspace and command match this demo; it revokes output and closes its own children. The setup scripts do not modify stable files, permissions or credentials.

## Known limitations and human steps

- Remote Meet listener verification is still owed. Use the checklist in DEMO_RUNBOOK; do not describe local audio as Meet delivery.
- Incoming context is simulated, including when a teammate speaks the same scripted words. No bot or live meeting recording is used in this mode.
- The Chrome capture adapter and local transcription remain in the prior engineering candidate, not activated here. Loading an existing recording would require a deliberate local transcription/import adapter; this package's source is the versioned synthetic transcript fixture.
- Automatic recognition transmission remains unvalidated/off. Review First and explicit speech approval are mandatory in this demo. No visual recognition words are rewritten by Gemini.
- Local demo output uses the voice selected in this isolated session. It does not silently import or substitute a stable personal voice. Choose the intended voice explicitly in My Voice.
- Screen sharing, real human hover feel, VoiceOver, unusual displays and personal-voice output need human checks. Notarization/distribution signing is not provided.
- Dependency/helper symlinks refer to this machine's candidate workspace; this is a runnable local engineering package, not a portable installer.
- No production database, new framework, hidden capture, credential duplication, public tunnel, Git write or stable deployment was performed.

The small source hover fix was additionally applied only to Codex-owned original native files, with a separate scratch build and 106 passing tests. It is an uncommitted review checkpoint for the Git owner. The running stable binary was not rebuilt/replaced/relaunched.
