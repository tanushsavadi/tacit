# TACIT — HackUMass XIV judging pitch

The pitch as presented to the judges: deck, scripts, Q&A prep and the evidence behind every number. Slide 03 shows a
crop of the founder's own silent-speech frame; all other images are real product captures. The Inter font files used by
the PPTX are not included (install Inter from Google Fonts).

## Files
| File | What |
|---|---|
| **Figma Slides (master, editable):** https://www.figma.com/slides/jf8CzZjdqJfhMHhcb9lCrT | 7 main slides (row "Pitch") + 8 appendix (row "Appendix"), speaker notes on every slide. Present from here, or export to .pptx/PDF from Figma's menu |
| `TACIT_HackUMass_Judging_Pitch.pdf` | Offline fallback: 15 pages, rendered from the Figma slides at 1920×1080 |
| `TACIT_HackUMass_Judging_Pitch.pptx` | Native editable PowerPoint built from the same spec (text boxes, shapes, real images, notes). Uses **Inter** (installed in `~/Library/Fonts` for this Mac; TTFs in `fonts/`) |
| `TACIT_Pitch_Overview.png` | Contact sheet of all 15 slides |
| `TACIT_Pitch_3min.md` | **Primary script**, word for word, timed |
| `TACIT_Pitch_90s.md` · `TACIT_Pitch_5min.md` | Lightning and extended versions |
| `TACIT_Live_Demo_Runbook.md` | Setup, Meet/BlackHole routing, click path, judge-pick card, fallback ladder, recovery |
| `TACIT_Gemini_Judge_Pitch.md` | 55-second Best Use of Gemini pitch + why it isn't decorative + evidence |
| `TACIT_Judge_QA.md` | 20 hard questions: 15-second answer, depth, evidence, what to disclose |
| `TACIT_Pitch_Sources.md` | Evidence sheet: every number, its population, denominator and caveat |
| `TACIT_Pitch_Rehearsal.md` | Phrases, expected state, audio checks, timings, recovery, closing, handoff |
| `build/` | `spec.py` (single source of truth) → `deck.json` → Figma renderer (`renderer.js`) and `build_pptx.py` |
| `assets/`, `renders/` | Slide images (real captures, logo) and the per-slide Figma renders |

Rebuild the PPTX after editing `build/spec.py`:
`python3 build/spec.py && <venv>/bin/python build/build_pptx.py` (needs `python-pptx`, `Pillow`). Figma edits made
directly in Figma won't flow back into the spec.

## The opening: options compared

| | A · Silent sentence | B · Conversation moves on | C · Voice you didn't hear | **D · "Say it back" (chosen)** |
|---|---|---|---|---|
| What happens | Presenter mouths a sentence; "You saw me say something…" | "Does Friday work for you?" … awkward pause | Black screen → words → synthetic voice | A's silent sentence as the cold open (no tech), and **the same sentence becomes the live demo 60 s later**, through the real app into a real call |
| Emotional impact | High: the room feels the silence | Medium: needs setup | Medium: watched, not felt | High, and the payoff lands twice |
| Dignity | Good if framed as "showing the gap", not playing a patient | Good | Good | Good (the notes say so explicitly) |
| Clarity in 15–20 s | Very clear | Slower | Clear but abstract | Very clear |
| Authenticity | Fully real | Real | Risks feeling produced | Fully real; nothing faked |
| Tech wow | None by itself | None | Low (it's a video) | Comes at 1:10, when the promise is paid |
| Time | 6 s | 15–20 s | 10 s | 6 s |
| Live-demo risk | Zero | Zero | Zero | Zero for the hook; the demo has a fallback ladder |
| Memorability | High | Medium | Medium | Highest: one sentence ties the whole pitch together |

**Why D:** it costs 6 seconds, can't fail (no recognition in the hook), makes judges *feel* the barrier before any
explanation, and sets up a promise ("you didn't hear it") that the live demo keeps with the very same words. B's
"Does Friday work for you?" moment returns later where it belongs: as the Gemini Help Me Respond scenario, which is
built for free-form questions, unlike lip reading.

## Strategy notes
- **Category:** Devpost lets you pick one [HACKUMASS]-tagged category (MedTech, AI and Best Pitch are separate tags);
  Gemini is an opt-in sponsor prize. Lead with whichever category you selected on Devpost. The deck is framed for
  Accessibility first, with Gemini in its own appendix slide and mini-pitch. MedTech: TACIT isn't clinically tested;
  only lean on it with the "research prototype" caveat.
- **The three impressions** map to the arc: *need* (00–02) → *it actually works* (03–04) → *they understand the risks*
  (05–06, A1, A2, A4).
- **The demo rule nobody should forget:** while the camera is live, talking is read as lip movement. Mouth, stay silent,
  Speak, then **Pause**, then talk.
- **What's still unverified** and must be checked in rehearsal before it's said: a Meet listener hearing reviewed
  speech from the current build; live-camera recognition in the judging room's light; the Level 2 command by a human.
- Nothing here changed the TACIT repo's code, the running server or the app. The recognition-adaptation recording
  session (adaptC, started ~11:34 UTC) was not touched.
