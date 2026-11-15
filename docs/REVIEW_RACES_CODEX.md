# Review safety sprint — Codex handoff

Isolated branch: `fix/review-races`, based on `e69f04105aca2767a3ead00740aa26625008450a`.
Worktree: sibling directory `../tacit-review-races` (outside the original working tree).
The user's sprint request authorizes branch-local backend/shared edits and a commit; Claude retains main/Git ownership
in the original working tree. Nothing is merged or pushed. Inspect the commit with `git log -1 fix/review-races`;
cherry-pick its SHA only after coordinating with Claude's current work.

## Reproductions and root causes

Before production-code edits, the unchanged original audit diagnostic was copied into this worktree and run:
`server/node_modules/.bin/tsx docs/demo-review-races-codex.mts` → exit 1, **three REPRODUCED lines**.
Then `cd server && npm test -- --maxWorkers=1 src/review-races.test.ts` → **3 tests failed / 0 passed**.
All tests use synthetic strings, deferred promises, fake route/TTS and fake readline/WebSocket IO. No credentials are
loaded by the terminal harness. Tests transpile and execute the actual terminal script, rather than a reimplementation.

| Race | Deterministic ordering and pre-fix evidence | Root cause and fix |
|---|---|---|
| Terminal correction rebound | Display A → open edit → display B → submit A's correction; emitted request named B | Callback captured only the candidate index and read mutable `latest`. Each displayed offer now has a local token and immutable hypothesis/Live/output snapshots. Replacement, authorization changes, expiry and disconnect invalidate it; callbacks cannot adopt another offer. |
| Old review during newer recognition | Display A → accept B's header, withhold B's frames/result → approve A; old target was A and audit fake TTS ran | Review identity changed only when a result was shown. A valid newer header now immediately clears the target, publishes `review_invalidated`, and cancels pending reviewed speech. Failed/incomplete/busy/abstained B never restores A. Invalid/duplicate headers do not revoke A. |
| Completion order reversed review | Accept A, B → resolve B → resolve A; target reverted B→A | No acceptance-order check. A server sequence now identifies the latest accepted header. Superseded results are abstained with no words/candidates and sent only to their original socket, so other clients keep B. Client clocks are not used for ordering. |

The committed race suite now has **15 passing tests**. The old untracked audit diagnostic remains historical: it expects
the old terminal command syntax and must not be used as the regression command after this patch. Its temporary copy was
removed from this worktree; all original runbook/preflight/diagnostic files remain untouched in the original repository.

## Safety behavior

- Picks and corrections reach TTS with exactly the approved string, including case, whitespace and UTF-8. No LLM,
  trimming or sentence-case transform is applied to reviewed speech. Candidate kind/index/text/SHA-256 and both
  session authorizations/generations are still checked. Corrections remain `user-corrected`, not typed AAC.
- Speculative synthesis of review candidates is removed: displaying recognition cannot synthesize unapproved text.
  Reviewed requests now use cancellable TTS directly. This trades the previous speculative-cache latency benefit for
  the requested approval invariant; legacy call candidate caching is unchanged.
- Review expiry is an exclusive, finite deadline. Requests at/after expiry are refused. Queued/in-flight approvals
  expire too: checks precede synthesis and route handoff, and a deadline timer cancels waiting/synthesizing/routed work.
- A newer accepted utterance cancels older reviewed work, including in-flight synthesis. Pause/Stop/Live interrupt
  retain cancellation and generation checks. Even a TTS implementation that ignores abort cannot later route cancelled
  audio. Late route callbacks cannot republish a terminal delivery. The current review's one-shot latch also survives
  eviction from the bounded request-ID cache.
- The route helper has a global Stop, so cancelling an already-routed reviewed request also cuts other audio held by
  that helper. Waiting typed messages are not removed by review replacement. No automatic recognition transmission is
  enabled (`autoTransmitAllowed` and `recognizedSpeechAllowed` remain false).

Terminal change: enter the full displayed choice, e.g. `1@v3`, or `e 1@v3` to edit. Bare `1` / `e 1` deliberately do
not speak. A delayed partially typed command therefore cannot silently select a replacement result. The token is local
to this terminal process; the wire request still carries the original utterance and authorization identity.

## Native companion follow-up (source inspected; not changed)

The original working tree contains the current uncommitted companion review UI; it is not part of this branch's base.
Do not overwrite it with this worktree's older native sources.

1. Handle `review_invalidated` for the current authorization/generation by clearing `reviewDraft`, `lastHypothesis`,
   and the expiry task. Until then the native UI can still show an old choice while the next utterance is pending;
   the patched backend refuses it and cancels old approved work regardless of whether the UI handles the event.
2. Bind candidate-menu/Edit closures and editor text updates to their originating hypothesis identity. In the inspected
   current `RecognitionReview`, closures capture a candidate but `chooseReview` consults mutable `lastHypothesis`
   and checks candidate value membership. If A and B contain an identical candidate, a delayed A closure can bind to B.
   This does not change the candidate's text, but its original-utterance provenance is wrong. A server cannot distinguish
   that freshly constructed B request from an intentional B selection. Capture authorization/generation/utterance ID at
   render/edit start and reject a mismatch before selection or draft mutation. This is a source-level residual risk,
   not a newly executed native UI reproduction. Existing `speakReviewed` already checks the selected draft's utterance
   and output generation; preserve those checks.

This patch fixes all three reproduced terminal/backend races. It does not claim universal native UI race freedom or
physical cancellation latency. Ordinary-call listener verification remains an integration task after Claude reviews
and deliberately integrates the commit; this sprint never played audio or touched the running runtime.

## Verification (2026-11-15 UTC)

| Command | Result |
|---|---|
| `cd server && npm run typecheck && npm test -- --maxWorkers=1` | PASS: **139 tests / 13 files**, including 15 review-race regressions, exact-text/hash checks, concurrent corrections, expiry, Pause/Stop, ignored abort and late route callbacks |
| `cd web && npm run typecheck && npm test && npm run build` | PASS: **80 tests**, build; additive review invalidation does not disturb pending recognition or send speech |
| Shared protocol | Included in both successful TypeScript checks; no standalone shared package/test command exists |
| `cd macos/TacitRoute && DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test -j 2 --scratch-path .build-codex-review` | PASS: **4 pure playback-queue tests**, no CoreAudio/device use |
| Copied original `node --test docs/demo-preflight-codex.test.mjs`; `node --check docs/demo-preflight-codex.mjs` | PASS: **3 tests**, syntax clean; temporary copies removed, originals preserved |

The first helper test attempt with Command Line Tools failed to resolve XCTest; rerunning with per-command
`DEVELOPER_DIR` pointing to full Xcode passed. System developer-tool selection was not changed. Native app/selftests,
recognition, datasets/training, webcam/browser-media tests, runtime probes/restarts and route/audio checks were not run.
All dependencies/build/test outputs stayed local and are excluded from the commit.

## Exact changed files

- `server/scripts/review.ts`
- `server/src/index.ts`
- `server/src/live.ts`
- `server/src/live.test.ts`
- `server/src/reviewed.ts`
- `server/src/reviewed.test.ts`
- `server/src/speech.ts`
- `server/src/speech.test.ts`
- `server/src/review-races.test.ts` (new)
- `shared/protocol.ts`
- `web/tests/live-socket.test.ts`
- `docs/DEMO_READINESS.md` (terminal syntax only)
- `docs/HANDOFF.md` (isolated-sprint status and contract)
- `docs/REVIEW_RACES_CODEX.md` (this handoff)

Claude: inspect the single commit/diff; cherry-pick when the original tree is safe for it. Reconcile the native follow-up
against the uncommitted companion checkpoint, then run any physical rehearsal only when authorized and idle.
