# TACIT — 3-minute main pitch (primary)

**Deck:** slides 00–06 (`TACIT_HackUMass_Judging_Pitch.pdf` / Figma Slides / `.pptx`). Appendix A1–A8 only for questions.
**Pace:** ~150 words per minute. Times are cumulative targets, checked by word count (see the end of this file).
**Roles:** *Presenter* (speaks and runs the Mac). *Listener device*: a phone in the Google Meet call, handed to a judge.
**The rule that matters most:** while the camera is live, TACIT reads *any* lip movement, including you talking.
**Stay silent from the moment you mouth the sentence until you've tapped Speak, then press Pause before you talk.**

`[PAUSE]` = one full breath. `[BEAT]` = half a second. *Italics* = stage direction, don't say it.

---

### 0:00–0:06 · Slide 00 (black, one mint dot) · COLD OPEN

*Stand facing the judges. Say nothing. Turn to the Mac camera and silently mouth, at a normal pace:*
**"How are you doing?"**
*Hold still for about 3 seconds of silence. Turn back to the judges. Advance.*

### 0:06–0:20 · Slide 01 · THE SILENCE

> You just watched me say something. [BEAT] You didn't hear a word. [PAUSE]
> For people who lose their voice, after throat-cancer surgery or on a breathing tube, that isn't a trick.
> It's every conversation.

*Let the headline sit for one breath. Don't read it out.*

### 0:20–0:45 · Slide 02 · THE HUMAN NEED

> The words are still there. You can think them and shape them with your lips. What's lost is the sound.
> Electrolarynxes and voice prostheses help, but they take hands, training and time to heal.
> *(point to the card)* In a 2026 study, most patients just after laryngectomy preferred a lip-reading app to writing,
> even at 43% first-try accuracy. Someone else's app, a small study. [BEAT] But people want this.

### 0:45–1:10 · Slide 03 · INTRODUCING TACIT

> So we built TACIT, a Mac app that lives in the notch.
> I mouth the words, and TACIT reads my lips on the Mac, with no microphone.
> I check the words, fix them if I need to, and tap Speak.
> They're spoken in a voice I chose, into a normal Google Meet call.
> *(tile 3)* Lip reading gets words wrong, so nothing goes out until I say so. Let me show you.

### 1:10–2:05 · Slide 04 · LIVE DEMO (eyes on the Mac, not the screen)

*Hand the phone to a judge.*
> This phone is the other person on the call. Just listen.

*Click the notch, then* **Start communicating**. *Face the camera.*
> Watch my lips.

*From here on, say NOTHING.* Mouth **"How are you doing?"**. *Wait for the words (about 1–3 s). Point at them silently.*
*If they're exact: tap* **Speak**. *If one word is wrong: tap* **Edit**, *fix it, tap* **Speak**.
*The phone plays the sentence. Now press* **Pause** *(camera off). Only now talk:*

> That came from my lips, through my review, into a real call. *(to the judge)* What did you hear?

*If you had to fix a word, add:*
> It misread one word. That's exactly why nothing is spoken until I approve it.

*If anything fails, switch calmly to the fallback ladder in `TACIT_Live_Demo_Runbook.md` (Level 2 = recorded clip
through the real recognizer, said out loud as "recorded").* **Never claim the phone heard it unless the judge says so.**

### 2:05–2:30 · Slide 05 · HOW IT'S BUILT

> Under the hood, Apple's on-device lip tracking feeds an open-source lip-reading model, running locally.
> Gemini has a different job: when typing a reply is too slow, it turns my own point into a sentence I can edit.
> *(point at the mint box)* Both paths stop with me. AI never rewrites my words, Gemini won't guess my opinion,
> and Stop cuts speech in about twenty milliseconds.

### 2:30–2:55 · Slide 06 · THE TAKEAWAY

> Today it works end to end on one Mac. What's not proven yet: lip reading across different faces and rooms,
> and testing with people who've actually lost their voice. That's next, with speech-language pathologists.
> [PAUSE] *(look at the judges, slower)*
> We aren't trying to decide what someone should say.
> We're trying to give them another way to be heard.

*Stop. Smile. Wait.* Then: "Happy to show anything again, or answer questions."

---

## If you're running long

- Slide 02: drop the electrolarynx sentence (it's on the slide). Keep the caveat that the study wasn't TACIT.
- Slide 05: drop the Gemini sentence and point instead: "Gemini helps draft replies too. Ask us about it."
- Never cut the closing two sentences or the caveat that the study wasn't TACIT.

## If you have spare time (judge is engaged)

- Offer the Gemini mini-demo (35 s, see `TACIT_Gemini_Judge_Pitch.md`): "Want to see how Gemini helps without
  deciding what I think?"

## Timing check (word counts at ~150 wpm, measured with `build/count.py`)

| Section | Spoken words | Speaking | Silence / actions | Target end |
|---|---|---|---|---|
| 00 cold open | 0 | 0 s | ~6 s (mouthing + hold) | 0:06 |
| 01 silence | 32 | ~13 s | ~1 s pause | 0:20 |
| 02 need | 64 | ~26 s | — | 0:45 |
| 03 TACIT | 70 | ~28 s | — | 1:10 |
| 04 demo | 44 | ~18 s | ~37 s: phone handoff, Start, mouthing, ~1.4 s recognition, Speak, audio, judge's reply | 2:05 |
| 05 built | 60 | ~24 s | — | 2:30 |
| 06 takeaway | 53 | ~21 s | ~3 s pauses | 2:55 |

Total: 323 spoken words ≈ 2:09 of speech, plus ~47 s of silence and actions ≈ 2:56. Rehearse once with a timer. If the demo needs a correction (Edit), it adds about 10 s, so use
the cuts above.
