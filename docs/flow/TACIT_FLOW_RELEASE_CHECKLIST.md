# Release recommendation: NO-GO for promotion

The stable release remains the usable release. The separately named Flow candidate is reviewable local engineering work. It is not deployed or feature-ready.

| Gate | Status | Required action |
|---|---|---|
| Isolated source/native build | PASS local scope | Owner reviews integration patches; no Git ownership transfer assumed |
| Server/web/native regression suites | PASS reported in test report | Rerun after owner integration, not before unrelated work is stable |
| Source grounding/cancellation/auth/typed speech controls | PASS finite software tests | Continue adversarial independent cases |
| Real selected Meet capture + playback | BLOCKED | Human grants toolbar capture, verifies correct source and hearing |
| Local real-call transcript accuracy/latency | BLOCKED | Consenting scripted call, compare actual words, receipt/end timestamps |
| Gemini semantic usefulness | FAIL development threshold | New independently labeled varied cases; improve recall/false warnings without tuning final cases |
| Native keyboard/VoiceOver/attention burden | BLOCKED | Human operates actual candidate, reports focus/steps/notifications |
| Exact authorized sentence heard once remotely + Stop | BLOCKED | Second-device consenting listener confirms words/cut |
| Provider project terms | BLOCKED for meeting text | Human verifies actual billing/data terms; separate per-session opt-in |
| A/B/C usefulness/resource-load evaluation | BLOCKED | Measure real effort and load; no assumed benefit |
| Developer ID/notarization | NOT PROVIDED | Separate signing identity/provisioning if distributing |
| Promotion | NOT AUTHORIZED | Only request promotion after all required gates pass; user explicitly approves |

Stop conditions: incorrect capture scope, lost playback, unintended output, incorrect/stale source attachment, private content logging, or inadequate user control. Do not mask failures with fixtures, broader audio sources, cached inference or fake listener reports.

Rollback is limited to stopping this candidate's capture/app/supervisor. No stable rebuild/restart, default-device change or Git reset is required. Proposed backend/shared modifications and doc publication belong to Claude under current ownership. Review patches against the recorded baseline and current owner work; do not blindly apply a patch over changed files.
