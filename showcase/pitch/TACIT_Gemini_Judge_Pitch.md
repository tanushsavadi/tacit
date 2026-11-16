# TACIT — Best Use of Gemini API: judge mini-pitch (45–60 s)

**One line:** *Gemini helps people take part in a conversation without deciding what they think.*
**Show:** appendix slide A3, and the live Help Me Respond flow if the judge wants it (35 s, script in
`TACIT_Pitch_5min.md` → "GEMINI, LIVE").

---

## The pitch (word for word, ~55 s)

> People who communicate by typing or silent speech lose their turn constantly. By the time a sentence is typed, the
> conversation has moved on.
> So I paste what the other person said, choose my move, like *share my view*, and type my point in a few words:
> "friday, monday mornings are hard for me."
> Gemini, with a strict JSON schema, finds the question actually being asked and drafts a speakable reply:
> "Friday works better for me since Monday mornings are hard."
> Then our code checks it. Any number, date or name I didn't give is removed. And if I ask it to share my view without
> giving one, it refuses. It never guesses what I think.
> I can edit the draft, and nothing is spoken until I press Speak.
> Twenty synthetic test cases against the real API, including two prompt injections: twenty passed, median
> 0.87 seconds.
> Gemini helps people take part in a conversation without deciding what they think.

*(159 words ≈ 60 s at 160 wpm. For a strict 45 s, drop the edit sentence and the test-case sentence: ≈ 125 words.)*

## Why this isn't a decorative API call

| What Gemini does | Why it needs a model |
|---|---|
| Finds the real question in a multi-speaker, messy snippet; returns it as `focus` (kept only if it's a **verbatim** quote) | Understanding the conversation, not keyword matching |
| Turns rough notes into natural, tone-matched spoken language (brief / warm / direct) | Fluency in under a second is what makes taking a turn possible |
| Works for 5 explicit intents with different rules (neutral vs opinion) | Structured, intent-conditioned generation |

| What our code does around it | Why |
|---|---|
| `responseJsonSchema` `{focus, drafts[1..3]}`, `systemInstruction`, minimal thinking, 8 s timeout per attempt | Predictable, fast, parseable |
| Model chain `gemini-3.5-flash-lite` → `gemini-3.5-flash` on failure | Survives a 429 or timeout |
| Deterministic grounding filter: removes new numbers, weekdays, months, times, capitalised names, links, "in my experience" claims | The model may phrase, never invent facts about the user |
| Opinion intents refused without the user's point | Autonomy: Gemini never decides what you think |
| Context fenced as untrusted data | Prompt injection in "what they said" is ignored (2/2 in eval) |
| Cancel / Stop / newer request / disconnect abort the call (`AbortSignal`); replies go only to the requesting client | Control and privacy |
| Content never logged; only intent, counts, model and ms | Privacy |
| No path to audio: Speak → `speak_typed {assisted:true}` → the same authorization as typed speech | AI can't speak by itself |
| UI provenance: "Suggested by Gemini · 0.9 s" → "Your edit of an AI suggestion" → "Written by you" | The listener-facing words stay attributable |

## Evidence (and what it measures)

Measured 15 Nov 2026 11:05–11:08 UTC against the real Gemini API, on the deployed server's code (`server/src/respond.ts`).
I did **not** re-run it for this deck, to avoid burning the per-minute quota before judging.

| Metric | Value | What it is | What it isn't |
|---|---|---|---|
| `npm run respond:eval` | **20/20** pass | 20 synthetic, agent-written scenarios: stance kept, 2 prompt injections ignored, no invented personal facts when baited | Not real users, not AAC users, not clinical |
| Latency | **p50 872 ms**, p95 2.6 s (n = 20) | Model round trip per request | Not end-to-end speech latency |
| Grounding removals | **0 of 58** drafts needed a removal | How often the filter had to strip invented facts | Not proof the filter is never needed |
| Focus | verbatim in **4/4** | `focus` quote matched the supplied text | — |
| Live probe on the deployed server | Share my view median **1.10 s** (n = 5); refusal, cancel, supersede, injection OK; **0 speech events** | Scripted client over the app's real WebSocket protocol | — |
| Native end to end | `--presence-check` **11/11** (edited draft spoken once via typed path → BlackHole) | App → server → Gemini → app | No remote listener |

## Honest limits to volunteer if asked
- Context is pasted or typed by the user (or a clearly labelled SAMPLE). **TACIT does not listen to the meeting.**
- Gemini is not the lip-reading model. Recognised silent-speech words are never sent to Gemini or rewritten.
- A 429 per-minute quota was hit when the eval and probe ran together (~35 calls in 20 s). A demo uses 1–3 calls a minute.
- The test cases are agent-written. No study with AAC users has been done.
