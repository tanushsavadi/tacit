# TACIT — 5-minute extended pitch

**For:** technical or sponsor judges who want depth. **Slides:** 00–06, then A2 (what we tried), a live Gemini
demo with A3 on screen, then A4 or A7, back to 06 to close.
**Base:** sections 00–05 are word-for-word the 3-minute script (`TACIT_Pitch_3min.md`). Only the added sections are
written in full here.

| Time | Slide | Content |
|---|---|---|
| 0:00–2:30 | 00–05 | Exactly the 3-minute script up to the end of slide 05. |
| 2:30–3:15 | A2 | The engineering story (below). |
| 3:15–4:00 | A3 + Mac | Live Gemini Help Me Respond (below). |
| 4:00–4:30 | A7 | What we'd validate before anyone relies on it (below). |
| 4:30–5:00 | 06 | The 3-minute closing, unchanged. |

---

### 2:30–3:15 · Slide A2 · WHAT WE TRIED, WHAT FAILED

> HackUMass asks what failed. Here's our favourite failure.
> On sentences it had never seen, the stock model got about 74% of my words wrong.
> So I recorded a hundred and one silent sentences and fine-tuned it on me. My error dropped to 42%.
> But we'd written a rule down first: other speakers may get at most one point worse.
> On other people's faces it went from 6.2 to 10.1. [BEAT] So we didn't ship it. The demo runs the unmodified model.
> We also dropped AirPods jaw sensing, which couldn't tell words apart, and an early design where you mouthed to
> pick one of three AI replies, because those weren't the user's own words.

### 3:15–4:00 · Slide A3 on screen + the Mac · GEMINI, LIVE

*Before the pitch: copy the context below to the clipboard (switching apps collapses the notch). Voice output on.*
`Hi, this is Dr. Lee's office calling about your follow-up. We can do Friday at 3, or keep you on Monday at 9. Which works better for you?`

> Lip reading isn't always the fastest way to answer. Say a clinic calls.

*Click the notch → speech-bubble icon (Help Me Respond) → ⌘V → Return.*
> I paste what they said.

*Click* **Share my view** *(⌘2). Type:* `friday, monday mornings are hard for me` *→ Return.*
> I pick what I want to do and type my point in my own words. If I leave the point empty, it refuses. It never
> guesses what I think.

*Draft appears in about a second ("Suggested by Gemini · 1.1 s").*
> Gemini found the actual question in that message and turned my notes into a sentence.
> It's checked in code: any number, date or name I didn't give is removed.

*Click at the end of the draft and type* ` Thank you!` *The label changes to "Your edit of an AI suggestion".*
> I can edit it, and TACIT records that these are now my words.

*Tap* **Speak** *(⌘↩).*
> Only now does it go into the call.

*If Gemini fails (429 / network): press* **Try again** *once. If it still fails:* "The quota's busy. This is the
fallback: TACIT says no AI is connected and lets me write it myself." *Move on.*

### 4:00–4:30 · Slide A7 · WHAT WE'D VALIDATE NEXT

> Before anyone relies on this: a measured reliability gate on held-out recordings (error rate, how often it
> abstains, how often a wrong word would go out). Then co-design with people who use alaryngeal speech and with
> speech-language pathologists, then an approved usability study. And a licensed model: the weights we use are
> research-only.

### 4:30–5:00 · Slide 06 · CLOSE
Use the 3-minute closing word for word, ending on:
> We aren't trying to decide what someone should say. We're trying to give them another way to be heard.

---

**Timing (measured with `build/count.py`):** the 3-minute base runs about 2:30 to the end of slide 05. Added: A2 ≈ 46 s,
Gemini ≈ 39 s of speech + ~12 s of typing and waiting, A7 ≈ 21 s, close ≈ 22 s. Total ≈ 5:00. If short on time, drop A7 and say "Validation plan's in the appendix."
**Gemini quota:** don't run Help Me Respond more than about 3 times a minute. A 429 was seen during evaluation bursts.
