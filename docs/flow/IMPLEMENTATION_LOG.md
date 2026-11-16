# Implementation log

2026-11-15. Source baseline, real timestamps/hashes/status are recorded in external `baseline.json` and evidence files. No Git writes or stable runtime restart. Original unrelated modifications preserved.

- M1: research/prior P0/source audit; protected filesystem snapshot; baseline server 196, Swift 103. Full architecture/acceptance plan written; owner-managed Git branch not created.
- M2: real MV3 tabCapture/offscreen/playback/worklet implementation, authenticated one-source PCM endpoint, lifecycle/limits tests. Physical capture/playback/source proof BLOCKED on Chrome invocation and consenting participant; not called live.
- M3: real persistent local whisper-server adapter, provisional/final revisions, bounded queue and cancellation. Three synthetic speech files decoded locally. Actual Meet WER/streaming latency BLOCKED.
- M4: structured Gemini state interpreter, unique exact quotation/span/revision validation, supersession/timeout/backoff/usage, actual synthetic API runs. Original 9/12 and stress 4/8; 3.8 Flash 8/8 timeouts. Semantic reliability gate FAILED; no positive advantage claim.
- M5: authored draft/source binding, three-turn queue, pause/resume/discard, editable deterministic recovery requests, unchanged text through inference. Unit checks PASS.
- M6: native Flow surface/capture consent/source status, optional context-change review, old-source drafts, current VSR context notice, exact output-path reuse, selected-context HMR bridge. Native unit/build/socket checks PASS; VoiceOver/human navigation BLOCKED.
- M7: full two-device Meet slice BLOCKED; no fabricated capture/transcript/listener acknowledgment.
- M8: software race/resource/error fixes and regression checks performed; real effort, attention and hardware/load evaluation BLOCKED. Optional feature registry includes six further ideas; unsupported add-ons rejected/deferred.
- M9: separate ad-hoc-signed candidate, helper builds, reviewable integration patches, setup/consent/rollback/demo/test docs. Promotion NO-GO; no stable release changes. Signing for distribution not configured.

Next human actions: owner reviews backend/shared patches or explicitly transfers isolated ownership; verify API project data terms; consenting participant + actual toolbar source capture/playback; then native keyboard/VoiceOver/remote speech acceptance. Semantic improvements need new independent labels/evaluation before promotion. Do not repeatedly tune against the studied cases.
