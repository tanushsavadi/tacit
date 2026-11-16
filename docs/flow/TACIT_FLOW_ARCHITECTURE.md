# Architecture and acceptance boundaries

Decision: implement a narrow Flow module alongside existing TACIT, with its own loopback WebSocket endpoint. Existing `Segmenter` supplies endpointing; `SpeechOutput` and native reviewed/typed controls retain exclusive output authorization. Existing per-segment CLI STT creates temporary WAVs; Flow instead uses a dedicated persistent whisper-server and in-memory multipart WAVs. No recognition model changes.

## ADR-Flow-001: capture source

Choose Chrome MV3 tabCapture over native Core Audio process taps or app-filtered ScreenCaptureKit for this candidate. Tab identity is narrower than browser-process identity. Native taps avoid an extension but browser subprocesses and multiple tabs make the advertised source harder to prove; SCK adds broader permission scope. No experiment has proved actual Meet playback yet. This is a documentation-based selection, not a measured architectural victory. Revisit only if browser lifecycle/user effort fails real testing.

## ADR-Flow-002: transcription

Use a persistent local whisper-server, CPU four threads, explicit loopback URL. No cloud or CLI fallback. Partial local hypotheses are provisional; finalized utterances alone reach semantic analysis. Each local decode still retranscribes a bounded segment; it is not token-level streaming STT. A newer final revision invalidates old source citations. Source timestamps are receipt times; no acoustic-word alignment or speaker diarization is claimed. Capture-to-transcript latency needs physical measurements.

Gemini Live Transcribe is a documented alternative, not enabled: `gemini-3.5-transcribe-live`, TEXT response, PCM16, VERBATIM, interim/final events, ten-minute sessions, no streaming diarization/word timestamps. Its privacy/cost/session complexity has not been justified by an accuracy comparison. There is no cloud-audio checkbox that silently changes the local pipeline. [Official contract](https://aistudio.google.com/docs/live-api/live-transcribe).

## State, ownership and data

`FlowState`: monotonic consent epoch/context revision; 24 source turns, max 2,000 characters each; six anchors; 12 relationships; three drafts, max 500 characters each. Draft anchor is an immutable snapshot; source eviction/revision does not rewrite the draft. Source-backed annotations require current finalized revisions. Old snapshots remain visibly saved references, not fresh evidence.

`FlowService`: one native owner; one paired Chrome source; no private global broadcast. Listen/Stop, capture/source lease, frame sequencing, limits and model coalescing live here. `/flow` is on :18892, distinct from visual JPEG `/ws` on candidate :18890. Code remains feature-flagged off outside the isolated candidate.

`SemanticEngine`: typed extraction, exact quotation grounding, request cancellation/deadline, stale revision rejection, 8 requests/min, 80 requests/server lifetime. A result contains no opinion/draft/output tools. Valid quotes do not prove valid semantics.

`FlowClient`/`FlowView`: local editor owns its exact wording; incoming snapshots cannot replace it. Edits are versioned and one is in flight per draft. Expanded Flow is 460×540 at most, screen-bounded, deliberately opened/pinned; compact/Peek and emergency controls retain their geometry. Existing recognition review/speech outrank Flow Peek. Inspect source is collapsed by default. No automatic popup for every question.

## Lifecycle

Launch/relaunch: off; no capture/consent restoration. Start requires participant agreement; cloud text is separate and disabled unless provider terms are verified. Native arms, issues one-use capture pairing; Chrome user chooses Meet tab. Capture ends on source navigation/reload/closure, device change, mute/ended track, owner/source disconnect, malformed/overloaded transport or twenty-minute lease. Tab activation elsewhere does not widen the selected source. Source change always requires a new consent/pairing epoch.

Pause/Stop listening: capture resources released, transcription cancelled, inference invalidated, context cleared; authored drafts retained as old snapshots. Resume renews consent and source, preserves drafts. Global Stop: all of the above plus clears Flow drafts and invokes existing outgoing Stop; no replay after reconnection. Unexpected native transport loss keeps local authored text for manual recovery while the server clears private context. Relaunch does not restore it.

## Additive integration proposal — requires backend owner review

`RespondContextSource` gains `meeting-selected`; the native user can explicitly import selected, current transcript context into Help Me Respond only with text consent. Server checks exact current selected context against Flow state before calling Gemini. Pause/Stop/clear/selection invalidate in-flight assistance. This contract is proposed in this external patch; it is not published on the stable checkout. Raw recognition is never imported into Help Me Respond or Flow typed speech.
