# TACIT Flow — isolated engineering candidate

**Not promoted. NO-GO for replacing the stable release.** Real Chrome toolbar capture/playback, consenting two-device Meet delivery, accessibility use, and effort reduction remain unverified. The first semantic evaluation missed the release target. This package contains working implementation and tests, not a claim that those gates passed.

Core path: selected Meet tab → local PCM/STT → source-revision store → Gemini display annotations → saved authored turn → explicit user Speak through TACIT's existing output checks. Raw Auto-AVSR words and genuine candidate identities remain on `speak_reviewed`. No model has access to speech execution.

Read [architecture](TACIT_FLOW_ARCHITECTURE.md), [capture](TACIT_FLOW_AUDIO_CAPTURE.md), [Google Meet runbook](TACIT_FLOW_GOOGLE_MEET_RUNBOOK.md), [test report](TACIT_FLOW_TEST_REPORT.md), [feature/discovery registry](FEATURE_REGISTRY.md), [release checklist](TACIT_FLOW_RELEASE_CHECKLIST.md).

The snapshot was created from the recorded `baseline.json` outside the shared working tree. Dependencies are symlinked locally for development, not vendored. No Git writes, stable backend edits, restart or promotion were performed. Backend/shared changes are reviewable patches for Claude. Canonical HANDOFF must be updated by that owner if patches are accepted. The candidate's own app has a distinct bundle ID and server ports.

Operational evidence is outside the candidate under `../../evidence/`. Screenshots are explicitly synthetic native UI fixtures, not a live-call recording. Do not include local credentials, builds, personal recordings or operational artifacts in a public commit.
