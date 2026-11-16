# Gemini semantic engine

Inputs are bounded finalized source turns, stable IDs/revisions/order and exact selected anchor snapshots. Draft text is not needed by the interpreter and is not uploaded. Conversation text is untrusted JSON data, with no function-calling tools. Model outputs only exact question quotations, source-backed relationship types, literal before/after details, and abstention. No speaker identity or addressee is inferred.

Every output passes strict Zod schema: unexpected speech/tool/commitment fields rejected. A quoted source must exist at the requesting revision, be finalized, and contain exactly one occurrence of the exact quotation. Offsets are then derived locally, never guessed or repaired. Changed details must appear inside their citations; relationship ordering must be forward. Same-detail 'corrections' are suppressed. Request/epoch/context revision/state must still match, including when a provider ignores abort.

Initial offset-emitting model contract rejected a real result with an off-by-one boundary. It was replaced with exact quotation references; the original failure is retained in evidence. Syntactic grounding does not establish semantic correctness, certainty or clinical reliability.

Finalized event cues (questions/corrections/proposals/conditions and possible draft-related changes) schedule one coalesced request after 700 ms. Explicit analysis can cover missed lexical triggers. Eight requests/min, one active request, five-second total deadline, 80 requests/server lifetime, no retries, no model fallback storm. 429 opens sixty-second backoff. Bounded token/latency metrics contain no private content. Manual/recognition communication never waits for Gemini.

Flash-Lite original synthetic change evaluation: 12/12 source-grounded, 9/12 binary-change matches; missed amount and condition, false same-value correction. The later equal-detail filter is development replay, not fresh evaluation. See the reasoning-model experiment/evidence for the separately frozen stronger-model comparison. The guard remains experimental, below the release bar. Do not claim a measured Gemini advantage or that more models automatically improve it.

Usage estimates use published per-token rates and successful-response usage; aborted requests may still be billed and their usage may be unavailable. No audio/video is uploaded by Flow. [SDK contract](https://github.com/googleapis/js-genai), [structured outputs](https://aistudio.google.com/docs/structured-output), [pricing](https://aistudio.google.com/docs/pricing).
