# TACIT Flow — Gemini judging script and operator guide

Audit date: 2026-11-15, approximately 18:06–18:10 UTC. Frozen-build instructions supersede the older package runbooks. This document is the only manually written artifact from this audit. No application code, scenarios, existing notes, stable runtime, native build or recognition model was changed.

## 1. Implementation audit

**Defensible headline:** a working native communication workflow with simulated incoming transcript events, genuine optional Gemini interpretation, user-owned drafts, and an existing authorized speech path. **Local workflow verified; real Meet capture/delivery not demonstrated.** Do not call this a validated AAC intervention or say Gemini outperforms the local comparator.

The requested `~/Documents/tacit` directory does not exist. The main checkout is `/Users/tanushsavadi/Documents/Hackathons/HackUMass 26'`. Flow is the separate package containing this document.

### What was checked in this audit

- Read the fixtures, provider, socket service, launcher, semantic prompt/schema/validator, draft store, native views/client, correction template, speech guards, native rehearsal harness, and saved reports.
- Fresh TypeScript no-emit check passed. Binary and all files listed in `evidence/source-manifest.json` matched their recorded hashes. No native rebuild or new regression suite was run for this documentation audit.
- The demo backend was initially stopped. Before the freeze instruction arrived, the isolated demo was launched and Scenario A was exercised through real native controls. A background launch subsequently disconnected during the audit; a foreground demo supervisor was then used. Cause not established. This is not proof of unattended launcher longevity.
- Fresh observed Gemini question response: `gemini-3.5-flash-lite`, **1,014 ms**, `source references accepted`. This is one measured request, not a latency guarantee.
- Fresh observed second event: `POSSIBLE PROPOSAL UPDATE`, **Four → Five**, `Gemini live analysis`, `Gemini · source-checked interpretation`, and the exact draft **Thursday at four works for me.** still present. Its fresh latency was not read, so none is invented here.
- A later read-only process check found **both normal TACIT and TACIT Flow Demo app processes running**. Neither was terminated. This is the overlap condition the latest launcher addresses; the owner must select one mode through the approved launcher during an idle window before judging.
- The current inspection stopped at that state. **No fresh Speak/Stop, B, or C interaction was performed after the freeze.** No session was reset or terminated after the freeze. Voice remained off. The active session is not a blank presentation starting point.
- Saved evidence records 15/15 native A/B/C completions with mocked TTS/route, 3/3 real-local-audio scenarios, and a primary live-Gemini run with 1,749 ms and 1,108 ms validated responses. These are **previous-run evidence inspected today**, not fresh human listening tests.
- Saved regression reports: 16 demo tests; 246 server tests on repeat; 122 native tests; 84 web tests. The first server run had a timing-sensitive RouteHelper failure; its full repeat passed. Do not describe all of these as rerun during this audit.

### Verified feature matrix

Code paths are relative to this demo-ready folder.

| Feature | Code evidence | Runtime evidence | Real/simulated | Safe to claim? |
|---|---|---|---|---|
| Incoming conversation | [fixtures](demo/flow/scenarios.json), [provider](runtime/provider.ts) | Exact A question and update observed in native UI | Seeded text; no incoming audio | Yes: simulated transcript input |
| Live Gemini invocation | [semantic.ts](candidate/server/src/flow/semantic.ts), `geminiModel`, `SemanticEngine.run` | Fresh request row at 1,014 ms; fresh second-event source-checked state; [prior metadata](evidence/gemini-native/gemini-operations.json) | Actual API; no prerecorded result provider | Yes, only for successful current requests |
| Immediate question display | Provider `local(false)` extracts turns containing `?`; native `FlowClient.question` prefers the longest latest-source quotation | Full original question appears | Deterministic source rail; Gemini also returns question annotations | Do not attribute the first appearance solely to Gemini |
| Four-to-five interpretation | Gemini structured relationship + literal before/after details; validator; provider `local(true)` fallback | Fresh `POSSIBLE PROPOSAL UPDATE` / `Four → Five` in Gemini mode | Model interpretation in successful live path; lexical comparator in fallback | Yes, with visible provenance; not proof rules cannot do it |
| Draft ownership | [state.ts](candidate/server/src/flow/state.ts), `edit`; [Flow.swift](candidate/macos/TacitCompanion/Sources/TacitCompanion/Flow.swift), local `words` | Typed draft remained exact after event 2 | Real editable state | Yes |
| Keep / edit / dismiss | [FlowView.swift](candidate/macos/TacitCompanion/Sources/TacitCompanion/FlowView.swift), `update` | All exact buttons visible freshly | User actions; no model answer insertion | Yes; Keep and Dismiss acknowledge the card, Edit focuses the field |
| Save/resume interrupted answer | State `save`, three draft slots, immutable source snapshot; native `choose` | [recorded native runs](evidence/rehearsal-mock/rehearsal.json), [saved view](evidence/real-local-audio/B-saved.png) | Deterministic storage | Yes, as previously tested; not fresh B verification today |
| Across scenario selection/reset | Provider `reset`, state `stop`, native off-state cleanup | Reset assertions in recorded runs | Real explicit destructive reset | **Drafts are cleared.** Preservation is within a scenario, not across A/B/C resets |
| Correction of last message | [DemoPresenter.swift](candidate/macos/TacitCompanion/Sources/TacitCompanion/DemoPresenter.swift), `DemoCorrection`; [launch.ts](runtime/launch.ts), current-epoch queued/rendered tracking | [real-local-audio report](evidence/real-local-audio/rehearsal.json) | Real authorized prior message; deterministic weekday template | Yes; no Gemini correction claim |
| Speak | Native `speakTyped`; [speech.ts](candidate/server/src/speech.ts); unchanged route/voice helpers | Prior native real-TTS/physical-output PASS; current ready Samantha/local-output status | Real TTS and physical route in local mode | Claim implemented and previously routed; let judges hear the current run before saying audible |
| Stop | Native `stopEverything`; SpeechOutput `cut`, abort and route stop | Prior real-local run reached first-audio routing then output off/zero queued | Real cancellation path | Software/route interruption supported; fresh acoustic cutoff not verified today |
| Standalone app | Distinct bundle `edu.hackumass.tacit-flow-demo`, copied backend on 19890, Flow service on 19892 | Fresh native owner connection / separate listeners | Separate app/server; reuses implementation, local dependency/helper links and environment | Say separate runtime, not fully self-contained or part of stable app |
| Live Meet audio capture/delivery | Demo launcher disables real Flow capture, Whisper supervision and recognition autostart; default physical output | No meeting joined; no listener acknowledgment | Incoming context simulated; default outgoing audio local | **No live meeting-understanding or remote-delivery claim** |
| Visual polish | Notch views, frame spring, source badge, evidence disclosure, persistent action bar | Fresh actual notch screenshot viewed during audit | Real native state/rendering | Highlight the amber update above the unchanged draft, not a fake notification |

### Exactly what Gemini receives and returns

The SDK call sends a system instruction and JSON `{turns, anchors}`. `turns` contains up to the last **12 finalized** source turns with `id`, `revision`, `order`, `text`, `final`, and runtime `at`. `anchors` contains current selected draft source references: `turnId`, `revision`, `start`, `end`, `quote`.

**It does not receive `draft.text`, the user's availability, the final response, expected classifications, fixture timing labels or an answer key.** IDs such as A-turn-1 identify sources; they do not encode an expected semantic answer. This demonstration sends fictional transcript text, not microphone audio, video or faces.

Gemini returns structured questions and relationships: relation type; exact before/after quotations with turn IDs/revisions; literal `detailBefore`/`detailAfter`; and `abstain`. It generates **context annotations, not suggested reply sentences** in this workflow. It is instructed not to infer the user's opinion, availability, identity or intended response. Do not present prompt instructions as a correctness guarantee.

The application finds offsets for unique exact quotations and validates current finalized source membership, IDs, revisions, bounds, chronological ordering and literal detail substrings. It rejects invalid references and filters unchanged literal correction details. These checks establish source grounding, **not semantic truth**. Native code decides whether a relationship belongs beside the selected draft and renders the arrow. Draft storage, approvals, speech authorization and TTS are deterministic application responsibilities.

A narrow local comparator can identify a single earlier meeting proposal plus explicit correction wording and different literal times. It runs for deterministic mode or when live analysis is unavailable/uncertain. There is no prerecorded AI result masquerading as an API response. The broader candidate evaluation did not establish a Gemini advantage; [the earlier report](../candidate/docs/flow/TACIT_FLOW_TEST_REPORT.md) remains a limitation.

### Controls, limits and nonclaims

- Keep my response and Dismiss update both acknowledge this update for the current draft; neither edits or speaks it. Ignoring the card leaves the words alone. Edit my response focuses the editor; **you** supply the new sentence. Review source evidence expands exact quotes/references.
- Pause preserves drafts and revokes output; Resume continues events. Reset, Restart, changing A/B/C, disabling the simulated provider, and Stop clear the demo session. Clear context preserves authored drafts as old source snapshots but revokes voice. Do not demonstrate reset as a draft-preservation feature.
- Five-second model deadline; eight requests/minute; 80/server-process lifetime; 429 cooldown one minute. Reset does not replenish quotas. Typical A consumes two requests. Do not restart a frozen build to evade rate limits.
- `Gemini: configured` only means configuration exists. The provenance label can survive Reset; operation rows are also retained across resets. Verify a **new successful row** after the current event. A badge by itself is insufficient API proof.
- Changing the Analysis selector does not re-analyze old turns. The demo service's `analyse` action is a no-op. Automatic fallback handles provider failure. A missing/incorrect but source-valid model relationship may still produce no useful card: inspect source and edit manually; do not invent a successful interpretation or promise a retry control.
- Fictional events say “four” and “five”; they do not specify PM, date or timezone. No calendar is read or changed.
- Source texts/question rows can also cause the generic “A new question arrived. Your response stays with its original question.” banner in A. That is deterministic UI logic, not another Gemini discovery.
- No clinical benefit, calibrated reliability, general meeting understanding, automatic speech, or model superiority was established. Main TACIT silent-speech recognition is a separate feature, not used in this Flow sequence.

## 2. Scenario comparison

| Scenario | Best visual moment | Gemini contribution | Reliability evidence | Judging choice |
|---|---|---|---|---|
| A — The changing question | Amber Four → Five above the still-unchanged typed answer | Genuine structured correction relationship in live mode; rules can do this simple case too | Fresh native/Gemini walkthrough plus earlier native and local-audio runs | **Primary sponsor demonstration**: shows interpretation, grounding and agency together |
| B — Don’t lose my turn | Original launch answer reopened after the budget question | Optional question/relationship analysis; preserving text requires no Gemini | Previously recorded repeatable native runs; deterministic core has no cloud wait | Best operational fallback and accessibility story, weaker sole Gemini centerpiece |
| C — Correct or clarify | Real Monday message → user-supplied Tuesday → reviewed correction | None needed for correction; deterministic template | Previously recorded real local audio/authorization flow | Optional follow-up; demonstrates recovery, not Gemini necessity |

Use A for Gemini judging, B if network availability is poor or a judge asks about retaining a turn, C on request. Do not replace A with B while implying Gemini stores the draft. No additional feature work is justified during the freeze.

## 3. Final three-minute Gemini pitch

Approximately 307 spoken words, leaving room for the clicks, two bounded requests, typing and a short TTS sentence. The time blocks are rehearsal targets, not model-latency promises. Use the success lines only when live provenance and the update are actually present. Pin the notch and prepare window placement before the clock starts.

### 0:00–0:30 — Hook

**[Face the judges. Do not click yet.]**

“Have you ever started answering a question—and somebody changes it before you can finish?

“Now imagine that every answer takes time to compose through assistive communication. You've worked out what you want to say. You're halfway through typing it. And the conversation moves on.

“Your thought still matters. But keeping your place takes work.”

### 0:30–0:55 — Insight

**[Point to the native notch and the SIMULATED badge.]**

“We're building TACIT. Flow explores the other half of giving someone a voice: helping them keep their place in the conversation.

“For this prototype, incoming conversation text is simulated. Gemini's analysis is live. The user writes the response—and decides when to speak.”

### 0:55–1:55 — Live centerpiece

**[Control Center: A · The changing question; Manual advance; Gemini live analysis. Press Start, then Next event →. Return attention to the pinned notch.]**

“Someone asks: ‘Could we meet Thursday at four? Does that work for you?’”

**[Click Respond / save question. Type: Thursday at four works for me.]**

“That's my answer. I haven't spoken it.”

**[Control Center: Next event →. Stop talking briefly; let judges read the update.]**

“Now they say: ‘Actually, sorry, could we make that five instead?’”

**[Only after successful live analysis and the actual card appear, point first at Four → Five, then at the draft.]**

“Gemini linked that correction to the earlier proposal. Look underneath: my words still say four.”

**[Open Review source evidence briefly, then close it. Click Edit my response. Select the draft and type: Five works better for me.]**

“I can inspect the source, keep my answer, dismiss the update, or change it myself.”

**[Read the exact edited sentence. Click Enable voice if needed, then Speak. Stay silent while TTS plays.]**

“And only when I press Speak does TACIT turn my words into voice. Here, it plays locally.”

### 1:55–2:30 — Gemini's specific role

**[Keep the source/draft interface visible. Show the latest successful Gemini invocation row only if it is already conveniently placed.]**

“Gemini receives recent transcript turns and the source I'm responding to—not my draft. It returns structured relationships with exact quotations. Our code checks those references and rejects stale results.

“The AI interprets the conversation. Our application preserves the draft and controls speech. It doesn't invent my availability or write my opinion.

“A simple rule can handle four-to-five; our local fallback does. Gemini's broader contextual value still needs stronger evaluation.”

### 2:30–3:00 — Impact and close

**[Face the judges. Let the final words remain on screen.]**

“We also preserve unfinished answers when a topic changes, and support reviewed corrections after speaking.

“This is an experimental prototype, not a validated accessibility intervention. Incoming context is simulated; real meeting capture and remote audio still need verification.

“The goal is simple: more room to express your own thought, without constantly starting over.

“Gemini shouldn't take someone's turn. It should help them keep it.”

### Conditional live-demo lines

If assistance times out: **[Point to actual fallback provenance.]** “Gemini is unavailable, so this is our labelled local fallback. My draft and voice controls still work.” Replace the success explanation with “The workflow is still live; the cloud interpretation isn't.”

If Gemini returns no useful change card: “This time it didn't produce a useful update. I can inspect the new source and edit my response myself.” Do not force the Four → Five claim.

If audio is not heard: “The audio didn't come through in this run. The exact approved words are here; I won't call that a successful playback.” Continue to the technical explanation without repeatedly pressing Speak.

## 4. Detailed live-demo runbook

### Frozen-build operating rule

These are **operator instructions**, not permission for an agent to switch an active session. Coordinate an idle window first. From the main checkout, the only permitted launch/mode commands are:

```bash
./scripts/tacit.sh demo
./scripts/tacit.sh flow start
./scripts/tacit.sh flow stop
```

Use `flow start` for this presentation. It checks that normal Live is off, closes the normal notch app, leaves the stable server running, and starts Flow in local-output mode. `flow stop` returns to normal TACIT. `demo` returns to the normal experience and stops Flow. Do not run any of these during another person's session. Do not launch bundles or the package scripts directly, run rehearsals, rebuild, alter hover, switch models, or use older restart/rollback procedures during the freeze.

**One notch app at a time.** The latest launcher addresses overlapping notch windows taking each other's clicks. The stable server may coexist with the separate Flow server; the two notch applications should not. No Meet call is required for this local sponsor demo.

### 30-second pre-judging check — after the owner has selected Flow mode

- **0–5 s:** Confirm app title `TACIT Flow Demo · Control Center`, Flow connected, voice route ready, LOCAL REHEARSAL AUDIO. No competing normal notch app. Do not switch modes as a check.
- **5–10 s:** Internet available; Analysis = Gemini live analysis, Playback = Manual advance, simulated provider on. Configuration alone is not proof of live service availability.
- **10–15 s:** At an agreed idle moment, choose A and Reset to initial; verify Event 0 / 2. This clears the previous draft and revokes speech. Do not do it while another presenter is using the demo.
- **15–20 s:** Place the Control Center at screen left, away from the top-center notch. More → Keep island open for the timed demonstration. This explicit presentation choice requires no hover-code change. Restore Unpin island afterward only if the owner wants it.
- **20–25 s:** Use already configured physical speakers if judges should hear TTS; check ordinary volume/mute. If using headphones, do not suggest judges heard local audio. Do not change global audio devices or Meet routing.
- **25–30 s:** Confirm the selected voice label in My Voice if necessary, identify Stop, and practice the mouse path without emitting events or spending API quota. Ready for Start.

### Exact sequence

| Timestamp | What I say | What I click | Expected screen state | What Gemini does | Recovery if it fails |
|---|---|---|---|---|---|
| Before clock | Nothing; coordinate with operator | Owner uses approved flow start only if idle | Separate Flow Control Center; local output; one notch app | No request just from launching | If active elsewhere, do not switch. If disconnected, operator checks connection; no competing launch |
| Before clock | “We'll show a fictional exchange.” | A · The changing question; Reset to initial; Manual advance; Gemini live analysis | Event 0 / 2; draft empty; voice authorization off | None for reset/selector; old evidence rows may remain | Do not reset another presenter's session. Record old row count before new calls |
| Before clock | Nothing | Open Flow notch; notch More → Keep island open | Full Flow workspace remains visible when Control Center gets focus | None | If difficult to reach the menu, use the actual pointer and give the menu time to close before editing; no code fix |
| 0:00–0:55 | Hook and insight from script | No event yet | SIMULATED and local-audio source labels | None | Use the spoken disclosure even if source badge is small |
| 0:55–1:05 | Read the exact first question | Start, then Next event → | Event 1 / 2; “Could we meet Thursday at four? Does that work for you?”; Respond / save question; Dismiss context | Live request 1 if configured, within quota and online; local question rail can appear immediately | Wait for current result. Don't call instant display proof of Gemini |
| 1:05–1:18 | “That's my answer. I haven't spoken it.” | Respond / save question; click Your answer; type Thursday at four works for me. | YOU'RE RESPONDING TO; YOUR UNCHANGED WORDS; exact draft; Save my turn, Discard, Enable voice | No API call from typing/selecting; selected source anchor is available for next request | If first click only closes a menu, click the field again. Verify actual text visibly before continuing |
| 1:18–1:30 | Read exact second event, then pause | Control Center Next event → once | Event 2 / 2; later source text “Actually, sorry, could we make that five instead?” | Live request 2 receives both turns plus selected source anchor | Up to five-second deadline; no repeated clicks or scripted fixed wait |
| 1:30–1:38 | “Look underneath: my words still say four.” | Point to actual card, then draft | Observed successful state: POSSIBLE PROPOSAL UPDATE; Four → Five; original draft exact; LOCAL AUDIO · Gemini live analysis | Structured relationship accepted by source validator | If deterministic provenance, disclose fallback. If no useful card, inspect source and edit manually |
| 1:38–1:44 | “I can inspect the source…” | Review source evidence; close it after showing | Before: exact original quote; Later: exact correction quote; IDs/revisions | No new request | Disclosure expansion can push editor below the fold; close before editing |
| 1:44–1:50 | “…or change it myself.” | Edit my response; select existing text; type Five works better for me. | User-authored final words, not an AI replacement | None | Edit my response only focuses; it does not insert the example. You must type it |
| 1:50–1:55+ | “Only when I press Speak…” | Enable voice if necessary, then Speak once | Selected-voice synthesis/routing; local audio; Stop visible | Gemini does not synthesize/speak this draft | Stop if wrong. If audio fails, acknowledge and proceed; don't spam Speak |
| 1:55–2:30 | Explain the actual division of work | Optional latest new row under Gemini invocation evidence | Model, engine elapsed ms, source references accepted | No new call merely from inspecting evidence | `configured`/old rows alone are not fresh proof. Don't narrate unmeasured latency |
| 2:30–3:00 | Impact and close | Leave interface visible | Final typed response and user's controls | None | Cut optional clicks if a judge interrupts; do not rush the user's choice |
| After judging, only when idle | Nothing | Reset to initial in Control Center if authorized for next run | Event 0 / 2; prior draft/output reference cleared; voice off | Quota counters and operation history persist | Another agent must not reset or terminate it independently |

**Exact visible wording is from the current source and fresh A observation.** Model-produced detail excerpts may differ on a future call. Describe the words actually shown. The fixture does not contain “PM.”

### Failure and quota cheat sheet

- A successful ordinary A run uses two cloud requests. The process allows eight/minute and 80 lifetime. Four rapid A runs can consume the per-minute allowance; normal three-minute judging cycles are less demanding. Other features sharing the API project can still cause 429s. Stop load testing before judges arrive. Reset is not a quota reset.
- Gemini slow/unavailable: five-second deadline, then labelled local fallback for this explicit time change. Speak/manual editing remain separate. Don't click a nonexistent Retry button or rely on `analyse`; it is a no-op in this demo adapter.
- A source-valid but unhelpful model answer need not trigger fallback. Keep the uncertainty visible, inspect the source, and demonstrate deliberate manual editing instead.
- No internet: use Deterministic analysis for a subsequent, explicitly reset run with the owner's agreement. Switching the selector alone does not process existing turns. Call it the local workflow, not a live Gemini demonstration.
- Speech failure: keep the final sentence on screen; acknowledge the failed playback. Do not select a replacement voice or change audio devices without the user's deliberate choice. Do not claim Meet delivery.
- Backend disconnect: preserve the visible/local draft if available; Check connection may reconnect. Do not promise every draft in every client survives all failure modes. No mode switch, launch or termination by an independent agent.
- Whole demo unavailable: open an **existing historical screenshot** such as [the earlier Gemini update](evidence/gemini-native/A-context-update.png), label it “earlier verified run,” and explain the workflow. That screenshot predates the current cautious headline wording; it is not a new inference, an audio recording, or an interactive fallback provider. Offer to return when the owner restores the demo. No fabricated success.

## 5. Forty-five-second Gemini sponsor demonstration

Use a blank, pre-positioned A session; do not preload a result or approved answer. Roughly 75 spoken words with short actions/pauses.

**[Start → Next event →. Respond / save question. Type Thursday at four works for me.]**

“This conversation input is simulated; Gemini's analysis is live. I'm answering a Thursday-at-four proposal.”

**[Next event →. Wait for actual successful live analysis.]**

“Now: ‘could we make that five instead?’ Gemini links that correction to the earlier proposal and returns source quotations. Our code checks them.”

**[Point at the arrow, the unchanged draft, then briefly Review source evidence.]**

“My draft still says four. Interpretation doesn't give the model permission to rewrite me.”

**[Open the latest new successful invocation row if time allows. Skip TTS.]**

“That's the Gemini boundary: context analysis in; the user's words stay theirs.”

If fallback appears, say “This request fell back to local rules. Here's evidence from an earlier real Gemini run.” Do not describe fallback as today's API success.

## 6. Three-minute alternate pitch using Scenario B

**Use only when reliability/accessibility workflow is the priority, or the judge explicitly asks about losing a turn. It is not the stronger sole Gemini sponsor proof.** Roughly 289 spoken words with 60–75 seconds reserved for interaction. Successful current Gemini annotations may be mentioned, but draft preservation must always be credited to application state.

### 0:00–0:35

**[Face judges.]**

“Imagine you finally have the words for a point you want to make. You're typing them into your communication tool. Before you're ready, somebody says, ‘Before that, let's discuss the budget.’

“Your answer hasn't stopped mattering. But now you have to remember it, remember what it answered, and find a way back into the conversation.

“That's the moment we're working on.”

### 0:35–0:55

**[Show the native notch and simulated-source badge.]**

“We're building TACIT. Flow explores how to keep someone's place while they prepare their voice. This prototype uses fictional conversation input. Gemini can analyse that context, while our native application protects the user's work.”

### 0:55–2:05

**[Control Center: B · Don’t lose my turn → Start → Next event →.]**

“Here's the question: ‘What do you think about launching the project next week?’”

**[Respond / save question. Type I think we should wait until testing is done.]**

“I have an opinion. These are my words.”

**[Next event →.]**

“Now the conversation turns to the budget. Notice that my answer is still attached to the launch question.”

**[Save & view new question. Point out the budget question. Click the Resume row containing the original draft.]**

“I can save this thought, follow what's happening, and return to it. The original question and my unfinished answer come back together.”

**[Point at Your answer is saved and the unchanged draft. Do not read an unobserved Gemini topic label.]**

“No automatic rewrite. No automatic interruption. No automatic speech.”

**[Optional, only if time: Recover my turn → Bring this back. Show the separate editable template; do not overwrite the saved response.]**

“If I want to return to the topic, I choose to do that.”

### 2:05–2:35

**[Keep the original draft visible.]**

“Saving text isn't an AI task, so we don't pretend it is. Our application does that deterministically.

“Gemini's separate job is to analyse recent transcript turns and return source-backed questions and relationships. Our code checks those references before displaying them.

“The user supplies their opinion. Gemini isn't asked to decide what they believe.”

### 2:35–3:00

**[Face judges.]**

“We've built and tested this workflow, but its benefit still needs research with people who use AAC. Incoming context is simulated, and remote meeting audio isn't verified here.

“What we want to protect is simple: a thought shouldn't disappear because it took longer to express.

“Giving someone a voice should also mean giving their thought time to arrive.”

### Scenario C: optional 30–45-second follow-up, not part of either three-minute pitch

**[Only start after the owner agrees to clear the current scenario. C → Start → Next → Respond / save question.]** Type **I can send the report on Monday.** Enable voice and Speak; wait for actual rendered delivery. If it fails, stop the demonstration of correction rather than inventing a prior message.

**[Correct last message → type Tuesday instead. → Review correction.]** The editable result is **Sorry, I meant Tuesday, not Monday.** Say: “This uses a deterministic template because I've supplied the changed day. It doesn't need Gemini.” Review the full sentence and click **Speak correction**. This demonstrates recovery after an actual approved message, not a model guessing what you meant.

## 7. Judge Q&A cheat sheet

1. **Why Gemini instead of rules?** “For this simple time change, rules work—we include that fallback. Gemini gives us a structured way to interpret relationships across turns. We haven't yet proved it beats rules on broader cases; that's an evaluation question, not a claim from this demo.”
2. **How is this different from asking ChatGPT to write a reply?** “This Flow path doesn't ask for a reply. It returns context relationships tied to exact sources, beside a draft the user writes and controls.”
3. **What changes while the user is composing?** “The new source turn is versioned, interpretation runs against current context, and an applicable change can appear beside the original draft. The words aren't replaced.”
4. **Does Gemini change the user's intention?** “It has no draft-writing or speech capability here. The user keeps, dismisses, edits and presses Speak. We don't ask Gemini to infer their availability or opinion.”
5. **Does it listen to a real meeting?** “Not in this demonstration. Incoming transcript events are seeded. An earlier candidate contains scoped Chrome capture and local transcription, but that live-Meet path hasn't passed our verification.”
6. **What leaves the device?** “In Gemini mode, recent fictional transcript text, turn metadata and selected source references go to Google. Draft text, camera frames and microphone audio aren't in this Flow request. A cloud voice, if explicitly selected, can separately receive approved speech text; the observed system voice is local.”
7. **What if Gemini hallucinates?** “Invalid quotations, IDs or revisions are rejected; stale results are dropped. Exact citations can still support a wrong interpretation, so uncertainty, source review and user choice remain necessary. Source grounding is not a truth guarantee.”
8. **How do you prevent invented opinions?** “The user's opinion stays in their editor. The context model isn't given a tool to write it or send speech. Our code—not just the prompt—keeps that separation.”
9. **What's implemented versus simulated?** “The incoming conversation is simulated. Native interaction, versioned state, real API analysis when successful, user edits and the authorized local voice path are implemented. Offline fallback and correction templates are deterministic. Meet delivery is unverified.”
10. **Why accessibility rather than generic productivity?** “The design is about preserving a person's own answer, its question and their control over speaking when composing takes time. Some workflows may help others too, but accessibility benefit must be evaluated with AAC users, not assumed.”
11. **Could it integrate with Meet or Zoom?** “There's already an experimental selected-Chrome-tab capture path and a virtual-microphone output path. Reliable capture, consent, echo/overlap handling and listener verification still need work. We're not claiming a verified integration today.”
12. **What shows technical depth?** “A simulated source feeds the real versioned conversation engine, structured Gemini interpretation and citation validation, cancellable requests, bounded draft storage, native editing, and generation/voice-bound speech authorization. Reset and stale-result behavior are tested; it's more than a prompt and a response box.”
13. **How would you prove benefit for AAC users?** “With compensated, consented AAC-user studies comparing ordinary composition, deterministic tools and Gemini. We'd measure time to express the intended meaning, lost/recovered turns, edits/actions, false alerts, unintended commitments and perceived effort. We'd measure semantic errors separately from source validity and remote audibility.”

## 8. Final rehearsal checklist

- [ ] Owner explicitly selects Flow with the approved launcher during an idle window. No independent agent mode changes; no two notch apps.
- [ ] Frozen native binaries and recognition model remain untouched. No rebuilds, scripts that run automated rehearsals, new features or capture changes.
- [ ] One full human practice run before judging: exact A question, user types draft, second event, actual provider status, unchanged text, deliberate edit, explicit Speak, audible local output if available.
- [ ] Confirm the result is a new successful Gemini invocation, not an old evidence row or merely the configured badge. If it fails, rehearse the truthful fallback line.
- [ ] Remember the fixtures do not specify PM; no calendar/availability claim.
- [ ] Keep the full notch and editor visible; pin explicitly for presentation, close evidence before editing. Confirm essential Stop remains visible. Do not change hover code.
- [ ] Keep Control Center away from the top-center notch; presentation display/scale and physical volume have been checked by the human operator.
- [ ] Verify exact final typed sentence before Speak. Pause speaking aloud while the short TTS sentence plays. No remote-delivery claim.
- [ ] Practice correcting a failed first click or hidden editor without rushing. If there are click/hover problems, check for the other notch app through the owner/launcher; do not launch a second copy.
- [ ] Know A's two-call cost and the eight/minute, 80/lifetime limits. No quota-heavy checks just before judging.
- [ ] B is the deterministic participation fallback; C needs a genuinely approved/rendered prior message. Neither is sold as Gemini-generated speech.
- [ ] Stop/Reset/mode exit happen only on the presenter's deliberate action when nobody else is using the session. Reset clears drafts; it is not a preservation demonstration.
- [ ] Time the spoken script with actual mouse/typing pauses. Cut optional evidence/re-entry clicks before cutting source disclosure, user control, or the uncertainty line.
- [ ] Close confidently: **“Gemini shouldn't take someone's turn. It should help them keep it.”**
