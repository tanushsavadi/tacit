# Test report — 2026-11-15, isolated snapshot

**Recommendation: NO-GO for promotion.** This report distinguishes implementation tests from physical product verification. Exact command outputs and synthetic model responses are in the external evidence directory; none are private meeting recordings.

## Fresh checks

| Area | Result | Scope |
|---|---|---|
| Server strict typecheck / Vitest | PASS, 246/246, 21 files | Includes original 196; new consent/source/draft/citation/stale/cancel/backoff/socket/STT boundary tests |
| Native Swift tests | PASS, 115/115 | Original 103 + Flow authorship, edit/Stop races, exact typed output/dedup, recovery, provenance and consent controls |
| Web typecheck / tests / build | PASS, 84/84; Vite build PASS | Original 80 + actual worklet byte/sample tests, source/manifest restriction and worker late-start cancellation |
| Native candidate build/signature | PASS locally | Separate bundle, ad-hoc signature verification; not notarization/distribution |
| TacitRoute / TacitVoice build | PASS locally | Unchanged helper source; no emitted audio or default-device change |
| Native binary ↔ actual candidate sockets | PASS | Off/empty/default-no-consent state, no speech request; not live Meet functionality |
| Local persistent whisper-server | Three real local decodes of synthetic TTS files | 618, 612, 610 ms; not meeting audio accuracy/streaming latency |
| Chrome extension laboratory | BLOCKED | Extension loads in isolated Chromium; no actual toolbar invocation grant obtained; no source/playback claim |
| Native UI screenshots | Rendered/inspected synthetic fixture views | Explicit NOT LIVE label, no sockets/capture/model/audio; AppKit snapshots can omit some heading glyphs, so these are diagnostic fixtures, not complete UI acceptance |

## Real API observations

Two initial development calls exposed one bad character boundary, rejected by validation. The exact-quote contract revision then passed two separate development calls. Original frozen twelve-case change evaluation: 12/12 grounded, 9/12 correct binary change decisions. Misses: amount and added condition. False warning: unchanged four→four. Equal-detail suppression was added from this failure; a post-fix replay is development evidence, not independent held-out validation.

Original lexical comparator: 11/12. Its implementation followed inspection of model results, so this is descriptive, not a blinded fair model comparison. A later eight-case stress experiment fixed that comparator before API calls: Flash-Lite 4/8, comparator 4/8; neither meets the development bar. Gemini 3.8 Flash LOW thinking: all eight requests exceeded the five-second deadline, no accepted annotation. No prompt retuning or further model retries were performed after those results. No semantic superiority claim is justified. Binary-change matching does not establish the correct target, latest corrected value or relevance to a draft; even a counted match needs those separate semantic checks. No full semantic reliability score is claimed.

Thirty-two inference attempts total; 24 completed responses have reported usage, eight stronger-model requests timed out. Known Flash-Lite usage: 9,789 input, 2,059 output tokens, published-rate estimate $0.0080842. Not an invoice or total charge: aborted requests may still be billed with unavailable usage. No meeting audio, face recording or private transcript was uploaded.

## Covered software behavior

Participant refusal; cloud-text policy disabled; wrong origins/Host/path/query credentials; second owner privacy; one-use pairing/replay; source epoch/frame-sequence failure; synchronous resource invalidation; Stop/disconnect; pause/resume preserved drafts; three-turn bound; stale draft versions; source revision/eviction; exact question ID among multiple questions; provisional exclusion; invalid JSON/fake quote/revision/ID/offset/detail/tool/speech fields; wrong source ordering; same-detail correction; ignored abort; 429/backoff; rate cap; nonspeech silence; STT failure/cancellation; local URL restriction; no rewrite on late model result; exact authored Speak through existing generation/deduplication; recovery templates inert until review/Speak. Existing reviewed-recognition/voice/Stop regression tests remain passing.

Not every schedule/hardware condition is proven. A failing transport test revealed that waiting for a peer close handshake delayed pause; it was fixed to invalidate immediately before close. A native editor acknowledgment issue was corrected so unrelated snapshots cannot clear an in-flight draft edit. Both remain covered in the relevant tests.

## Required gates not executed

Real selected Meet audio isolation, ordinary playback/headphones, Bluetooth/device switching, source navigation/permission revocation/browser crash, realistic overlapping speakers, measured real-call WER and latency, recognition/capture load contention, full keyboard/VoiceOver trial, actual user effort A/B/C, listener-confirmed exact words once, and listener-confirmed Stop. No clinical result, automatic recognition reliability validation, successful integrated live call or release promotion is claimed.
