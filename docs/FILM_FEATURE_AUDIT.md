# TACIT — product feature audit for the demo film

Audited 2026-11-15 ~05:55 UTC against the deployed integrated build `cbb1612` (Living Notch in the notch band + Help Me Respond).
**Rule for the film:** show only what is listed as verified. Anything marked *physical pending* may appear only as a
clearly staged re-enactment and must not be narrated as a measured result.

## Verified features (what the film may show)

| # | Feature | Why it matters (accessibility) | Evidence | Visual strength |
|---|---|---|---|---|
| 1 | **Living Notch, Compact** — "tacit" in the notch band beside the camera cutout, state glyph + Stop on the other side | Always visible and never in the way; the state is readable at a glance | Real deployed capture `01-compact.png`, `01-compact-in-notch-context.png` | ★★★ opening shot |
| 2 | **Workspace on click** (460×350) with *Review first / Real-time* switch and *Start communicating* | One entry point; no browser, token or terminal | Real capture `03-expanded-home.png` | ★★★ |
| 3 | **Silent speech → words in the notch** (recorded silent clip → live Auto-AVSR → native Peek) | The core promise: mouth words, see them | `--analyze-video --send` exact on 2 clips; Peek capture `04-review-first*.png` (recorded input, not live camera) | ★★★ hero |
| 4 | **Review first — one tap Speak** of exactly the shown words; Edit for corrections | The user stays the author; nothing is spoken without a tap | `reviewed:check` 13/13 (tamper/hash/stale refused, double Speak refused) | ★★★ |
| 5 | **Speaking Peek with direct Stop** | Immediate control; Stop interrupts in ~20 ms | Real capture `05-speaking*.png`, `06-speech-complete.png`; stop→interrupted 22 ms | ★★★ |
| 6 | **Help Me Respond** — paste what they said → choose a move → *your* point → editable Gemini wording → Speak | Faster turn-taking for people who type slowly; opinions stay the user's own | Real Gemini via the native client on the live server: 11/11, ~0.8–0.9 s; offline renders of every step | ★★★ |
| 7 | **My Voice** — choose and preview a voice privately (listener hears nothing), then speak in it | Identity: the voice is chosen by the user | `myvoice:check --preview` 10/10 | ★★ |
| 8 | **Hold my turn** — one tap says a hold phrase while the user keeps typing | Keeps a place in fast conversations | Unit tests + earlier release evidence; not re-captured in this build | ★★ |
| 9 | **Real-time mode** (opt-in, confirmation, orange REAL-TIME label) | "Human realism" pace for practised phrases | Recorded clips → automatic speech at BlackHole (earlier release); offline renders | ★★ (label must stay visible) |
| 10 | **Recovery** — recognizer killed → restarts in ~8 s; pause drops stale results | Reliability you can trust in a call | `live:stress --kill-recognizer` OK | ★ (B-roll) |

## Claims to keep OUT of the film

- No live meeting listening: Help Me Respond uses text the user pastes or types (or a labelled SAMPLE).
- No recognition accuracy numbers, and no "works for everyone". The recognizer is an unmodified research model
  (non-commercial licence) and the reliability gate is UNVALIDATED.
- No "the other person heard it" unless a real Meet listener is filmed hearing it. Every check above stops at the
  virtual microphone.
- No automatic speaking in Review first. Real-time only with its on-screen warning.
- Do not present the TEST/OFFLINE lab images as live product. Use them only as design reference.

## Shot list by cut (authentic captures first; Higgsfield only for atmosphere/B-roll)

- **60–90 s judging cut:** 1 Compact → 3 mouth a sentence (person, staged) + words appear → 4 one tap Speak → 5 Speaking
  + Stop → 6 Help Me Respond draft → Speak → end card "Your voice. Beyond speech."
- **2:48 Devpost cut:** the judging cut, plus 2 workspace tour, 7 My Voice private preview, 8 Hold my turn, 9 Real-time
  with its warning, architecture card (camera → on-device lips → Auto-AVSR → your review → your voice → call mic).
- **3:40 director's cut:** the Devpost cut, plus the user's story, 10 recovery, the safety rules on screen (nothing
  spoken without you; Stop anytime; AI never rewrites your recognised words), and the credits/licences.

## Capture status (`macos/TacitCompanion/.build/film-evidence/`, git-ignored)

Real, from the deployed app (`cbb1612`): window-only captures `01-compact`, `03-expanded-home`, `04-review-first`,
`05-speaking`, `06-speech-complete`; `*-in-context` captures also show the menu bar and the editor behind (crop
before use). Words come from a recorded silent clip through the live recognizer. Speech in 05/06 was started by a
local QA client over the same authenticated protocol and rendered at BlackHole with no listener. It was not started
by a tap in the notch.

**Still needs a human pass** (pointer/clicks; the agent has no Accessibility permission): hover Peek, Help Me
Respond inside the real notch, My Voice panel, Real-time confirmation, a Speak tap, plus screen recordings. Earlier
native-window recordings returned stale frames. Record with QuickTime (File → New Screen Recording, select the notch
area) at 2× and check every clip frame by frame before you edit.
