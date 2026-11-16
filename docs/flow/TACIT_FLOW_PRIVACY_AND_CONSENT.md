# Privacy, consent and threat model

Before Start, the user confirms everyone in the meeting agreed to selected-tab capture. This is an understandable participant-agreement workflow, not proof of everyone's legal consent or an automatic legal-compliance mechanism. No capture at launch. Refusal leaves ordinary TACIT usable. Local PCM/STT and cloud-text interpretation are distinct decisions. Cloud audio is not implemented; there is no automatic fallback.

Gemini text processing of meeting context is disabled unless operator configuration is `TACIT_FLOW_PROVIDER_POLICY=paid-verified` and the user separately opts in each activation. The account/project's applicable terms and active billing need human verification. Unpaid and paid terms differ; paid does not imply zero provider retention. Synthetic nonsensitive API tests are labeled separately. [Provider terms](https://aistudio.google.com/docs/terms).

Audio and recent transcript context stay in bounded RAM; no raw face upload, transcript export, recording history, permanent preferences or action-item database. Persistent whisper-server runs without conversion and with stdout/stderr discarded; in-memory WAV upload follows its non-`--convert` path. No temporary audio file is created by the Flow runtime adapter. The separate STT lab creates synthetic files in a temporary directory and deletes them. Local memory cleanup is best-effort, not forensic erasure. [Whisper server source](https://github.com/ggml-org/whisper.cpp/blob/master/examples/server/server.cpp).

| Threat | Implemented control | Evidence/remaining limit |
|---|---|---|
| Malicious Meet speech/prompt injection | No tools/output capability; strict schema; source data not instructions | Synthetic injection and schema tests; semantic errors remain possible |
| Malicious web tab/socket | Exact loopback Host/path, native bearer, extension origin + one-use pairing, no external messages/content scripts | Real WS rejection tests; same-user local processes are not sandboxed adversaries |
| Incorrect client/private context broadcast | One native owner; second owner gets no snapshot; source never receives transcript | Real WS tests |
| Widened/source-switched capture | Exact Meet path checks, reload/navigation/closure/device changes stop, source lease | Code and scope tests; physical tab isolation still blocked |
| Stale model/draft/voice | Epoch/revision/ordering checks, unchanged local editor, existing output generations/voice revision/dedup | Unit/native regression tests |
| Cancellation race/resource exhaustion | Immediate framing rejection, bounded queue/frame/turn/draft/socket limits, timeout/backoff/heartbeat | Concurrency/transport tests; OS/browser crash cleanup still needs physical check |
| Leaked secrets/private logs | Key server-side via env reference; native own token file; no token URL on Flow; generic errors; metrics only | Source inspection/tests; candidate logs suppressed |

Global Stop invalidates Flow, closes capture and STT requests, clears context/drafts, aborts inference, and invokes existing speech Stop. Listening Pause preserves authored drafts as old snapshots but clears active sources/consent. No replay after reconnect. Browser/OS/provider may finish already accepted work after local cancellation; late results cannot become current state or speech.
