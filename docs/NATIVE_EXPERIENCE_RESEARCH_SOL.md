# TACIT — participation, with authorship intact

Research and design decision, checked 2026-11-15. This is desk research and engineering judgment, not AAC-user validation or a clinical recommendation.

## Evidence that changes the brief

| Source | What already exists / what the evidence says | Consequence for TACIT |
|---|---|---|
| [Apple Live Speech](https://support.apple.com/en-gb/105018) and [Mac guide](https://support.apple.com/en-ie/guide/mac-help/mchl86b6234f/mac) | Type-to-speech, saved phrases and voice choice, including Personal Voice, already exist. | Neither a synthetic voice nor favorites is sufficient differentiation. |
| [Proloquo4Text Quick Blocks](https://www.assistiveware.com/support/proloquo4text/basics/the-quick-blocks) | Quick Talk can interject without replacing an unfinished text pad; conversations and history support recovery. | Preserve the current draft when holding a turn. Credit existing AAC instead of calling this invention. |
| [AssistiveWare's user accounts](https://www.assistiveware.com/blog/making-the-most-of-proloquo4text) | AAC users describe value in prediction, quick talk and stored conversations. The article explicitly discusses asking partners to wait while a message is composed. | Holding a turn is an immediate practical need, not an emotional story we should invent for users. |
| [TD Talk](https://us.tobiidynavox.com/products/td-talk) and [developer's phrase-prediction account](https://download.mytobiidynavox.com/Talk/Documentation/Story_of_TD_Talk/TDTalk_TheStoryOf_v1-0_en-US.pdf) | Text communication includes prediction, editing and multiple access methods; the documented phrase predictor reduces search burden with one inline option based on the user's wording. | Avoid a wall of uncertain alternatives. Ranked recognition is not certainty. Camera articulation is one access path, not a universal prerequisite. |
| [Speech Assistant AAC](https://asoft.nl/) | Custom categories, phrases, history, multiple conversation tabs, recordings, Personal Voice and phone-call support. | Favorites, personality and call support must not be presented as absent from existing products. |
| [Predictable](https://www.therapybox.co.uk/predictable-english) | Offers prediction, custom phrase grids and AI assistance. | An AI reply panel alone is also insufficient differentiation. |
| [One Does Not Simply 'Mm-hmm'](https://arxiv.org/abs/2506.17890) | Workshop with four AAC users plus four SLP interviews examines backchanneling and the visual attention AAC demands. Small qualitative study, not a population estimate. | Design for timing and attention, not merely faster text entry. Partners and conversation norms also matter. |
| [I, Robot?](https://arxiv.org/abs/2509.13671) | A full-time AAC user's longitudinal autoethnography reports agency, identity and privacy tradeoffs with ultra-personalized suggestions, including private details resurfacing in inappropriate contexts. One person's experience, not a universal finding. | Save only deliberately chosen wording. Do not log conversations to build an implicit personality. No model-written beliefs or unreviewed output. |
| [Affective sentence generation study](https://aclanthology.org/2025.findings-ijcnlp.100.pdf) | Studies mismatch between human expectations and model representations in AAC sentence generation. | Tone cannot be assumed to preserve meaning. Keep the user's semantic intent and explicit review primary. |

No participant was recruited or interviewed for TACIT during this implementation. Typing burden, fatigue, exclusion and reluctance to interrupt vary by person and situation. Some people cannot articulate silently, use a webcam, see a small panel, or use a conventional keyboard. The current notch is not a replacement for symbol-based AAC, eye gaze, switch scanning, dedicated hardware or professional AAC assessment. Native accessibility semantics help interoperability; they do not establish that all access methods work.

## Consumer interaction principles, not copied decoration

- [Raycast Quicklinks](https://manual.raycast.com/quicklinks): a stable entry point can bring an existing task forward instead of creating another task. TACIT keeps a communication draft available across apps. No active-app content is read.
- [Spotlight](https://support.apple.com/en-us/102650): a memorable system-wide invocation reduces navigation. TACIT retains its open/Stop shortcuts and adds an explicit Hold shortcut, all with registration status exposed.
- [Linear](https://linear.app/learn/intro-to-linear): keyboard actions and command discovery support frequent workflows. TACIT uses an enduring layout, direct shortcuts and ordinary native text editing.
- [Superhuman](https://help.superhuman.com/hc/en-us/articles/46005619081101-Default-Split-Inbox): focused prioritization reduces competing information. TACIT gives the current review one dominant surface and moves settings behind a deliberate action.
- [Granola consent guidance](https://www.granola.ai/blog/ai-notetaker-participant-privacy-consent): context tools require disclosure and meaningful consent. TACIT has no live capture adapter; supplied text remains visibly user-provided and session-only.

These are design inferences from product behavior/documentation. No comparative usability or speed study was run.

## Three concepts considered

| Concept | Need / differentiation | Practical and emotional potential | Feasibility / demonstration | Trust and accessibility / durable value |
|---|---|---|---|---|
| **Participation workspace — selected** | Keep a turn while preparing personally authored speech, then repair without losing the draft. Integrates reviewed silent speech with quick actions into existing call tools. Individual shortcuts are established AAC patterns. | A person can contribute their own thought and interject in their own wording. Less app navigation is plausible but unmeasured. | Existing reviewed/typed/output APIs; strong short demonstration with real listener, no new AI dependency. | Explicit authorization; no recognition-to-typed shortcut; keyboard/phrases remain alternatives to articulation. Daily use plausible across calls, still needs field study. |
| Context-aware conversational copilot | Surface permissioned questions/openings and propose intent-specific editable drafts. Could reduce context switching and composition effort. | Potentially useful for organizing responses; risks replacing the user's meaning with model assumptions. | Native contract has no authorized transcript source or suitable assistance endpoint. Live capture, echo avoidance and consent cannot be verified within the isolated work. | High privacy and agency burden. Keep a provider boundary and user-provided local starters; defer automatic awareness and AI generation. |
| Communication action agent | Turn user-authored intent into a reviewed calendar draft, follow-up or note. | May help practical participation after a conversation. | Requires tool-specific permissions and external actions, all with meaningful review; weak connection to the flagship review flow before judging. | Consequential actions create a second safety system. Defer rather than bundle a generic agent into AAC. |

**Product thesis:** TACIT is a persistent participation workspace: keep your place, prepare your words, speak deliberately, and recover. Its contribution is the coherent path from an alternative input modality through user review to an ordinary call, while a draft and quick conversational actions remain close at hand. The notch supports this path; it is not itself the product advantage.

## Initial friction audit and focused plan

Source inspected: existing IslandController, IslandView, CompanionContent, ReviewedTextView, Client, geometry/tests, HANDOFF contracts and DEMO_READINESS. Existing safety and route integration were already substantial.

| Observed friction | Implemented response |
|---|---|
| Typing/correction opened a separate utility window. | Editors stay in the same primary surface. Key status is acquired only on a deliberate editor action/click. |
| No turn-holding shortcut or personal expression shelf. | Persistent Hold action, global shortcut when registered, four user-customizable phrases with explicit selection/Speak. |
| Home emphasized display-only raw text even when reviewed speech was available. | Current eligible review becomes the conversation surface, with no preselection and exact original casing/text. |
| Losing current review cleared correction text. | Preserve correction in RAM for read-only reference; current utterance selection is still required for every correction. |
| Independent AppKit/SwiftUI timing could interrupt awkwardly. | Bounded native frame spring, rapid retargeting, opacity-only content changes and reduced-motion equivalents. |
| Existing live selftest would touch active output. | Distinct offline transport, release selftest and interactive lab; production runtime untouched. |

Sequence: preserve the contract; build the participation model and inline flow; integrate Astra's motion; inspect native rendering and keyboard interaction; exercise interruption and authorization; compile release; deliver isolated handoff. No new engine or framework.

## Reference engineering review and licensing

- [boring.notch](https://github.com/TheBoredTeam/boring.notch): visual/interaction inspiration only. GPL source was not reused. TACIT's spring, button feedback and shell remain original.
- [Coucou window controller](https://github.com/Louis-CFM/coucou/blob/0d7fe58884d99f275f3238e8dbe29ddee69fa9e8/NotchBuddy/Sources/App/IslandWindowController.swift) and state machine: inspected nonactivating panel, Spaces behavior, explicit key acquisition, canceled hover/expiry work and spring choices. TACIT keeps a smaller domain state model and no mascot/continuous decoration. No new source copied.
- [CodeIsland panel](https://github.com/wxtsky/CodeIsland/blob/03c77e9457f0adc56fa036caf4925e4a576b453b/Sources/CodeIsland/NotchPanelView.swift): inspected top-aligned panel layout, separate micro/open animations and Reduce Motion handling. Keep safety targets stationary during content replacement. No source copied.
- [Cyclop panel](https://github.com/akalikbergenov/cyclop/blob/8d1b9b2045979dc7bbe742994d1cd89d51090d65/Sources/Cyclop/Notch/NotchPanel.swift): existing TACIT MIT adaptation provides inactive-app editing and nonactivating panel configuration. Retain the license notice.
- [NotchDrop](https://github.com/Lakr233/NotchDrop/blob/e70b3d715a99e47de6eb823540282eafc7401a3a/NotchDrop/Ext%2BNSScreen.swift): existing TACIT MIT adaptation measures actual cutout geometry. Retain fallback for displays without a notch and preserve license notice.

Apple API sources and motion limitations are in companion `Motion/README.md`. Native references were inspected from their actual repositories; their full apps were not installed or run in this session.

## Direct answers to the product questions

1. **Why TACIT over Live Speech?** For a person who can use it, reviewed visual speech adds an alternative to typing, combined with a persistent across-app participation workflow and the existing virtual-microphone route. There is no evidence yet that it is faster or preferable to their current AAC. Live Speech may be the better fit for many users.
2. **Why the notch?** A predictable, always-available edge near the call's camera reduces window hunting and can preserve the calling app's keyboard focus. That is a testable design hypothesis. Menu-bar/non-notch access remains necessary; the notch is not inherently accessible to everyone.
3. **When typing is slow or disruptive?** Deliberately invoke a saved turn-holding phrase, select familiar wording, or use visual articulation when suitable. No current evidence establishes that review/correction beats typing on novel sentences.
4. **Whose personality?** The user's exact selected/corrected words and deliberately customized phrases. No inferred emotion, personality profile, paraphrasing or automatic AI replies.
5. **What becomes practical?** Combining a silent-input review with a quick interjection while keeping a draft and call application in place. This integration is real software, but the claimed participation benefit still needs user testing.
6. **Daily usefulness?** Persistent personal wording, repair, draft continuity, explicit output state and cross-app access. Measure actual use and fatigue over days; a polished demo cannot answer that.
7. **The signature demonstration?** In a real call, silently articulate → review the actual result → explicitly Speak → listener repeats what they heard. Then Hold My Turn while composing, and send a customized expression without losing the draft. If recognition fails, show correction/typed recovery honestly. Offline lab fixtures are labeled and never used as recognition or audio evidence.
8. **What remains unvalidated?** New UI's end-to-end physical call, speed relative to the person's existing AAC, effort/fatigue, turn retention, cognition, camera acceptability, motor access, VoiceOver/switch/eye-gaze use, supported languages and field reliability. Recruit AAC users with varied access needs, compensate them, co-design outcomes and include communication partners. No blanket claims for nonspeaking people.

## Future additive contracts — proposals only

None is required for the implemented Hold, phrase or local-starter flows. True visual activity/processing needs generation/utterance-scoped camera/recognition events, distinct from a connected socket. Optional AI needs a consent/source/revision-scoped context input and an explicitly requested draft response (no speech command), cancellation/revocation, no default retention, and no inferred user opinion. Native live capture would additionally require a selected-source permission flow, participant consent policy, visible revocation, echo exclusion and real hardware tests. Meeting privacy/legal requirements vary; no capture is implemented or represented as compliant.

Repeating recognized speech is deferred: the reviewed utterance authorization is single-use, and recognized text must never be reclassified as typed text. Any repeat contract belongs to Claude and must retain provenance and explicit fresh approval. Rate/expressive voice controls are deferred because this client contract does not report such supported settings. Existing selected voice remains visible in diagnostics.
