# TACIT — Judge Q&A

Each answer: **Say** (≈15 s, conversational) · *Deeper* (if they lean in) · **Evidence** · **Disclose**.
Appendix slide pointers in brackets. Rule of thumb: answer, give one number, then stop talking.

---

### 1. Isn't this just lip-reading plus text-to-speech?
**Say:** "The pieces exist, yes. What we built is the part between them: getting someone's silent words into a real
call, safely. That means reviewing exact text, authorizing every word, Stop that actually stops, and a virtual mic
that works with Meet or Zoom. The lip-reading model is open source. The product is everything around it."
*Deeper:* Native notch app (SwiftUI), authenticated local server with per-utterance authorization (Live generation,
utterance id, candidate index, text hash), stale-result dropping, `tacit-route` playing into exactly one virtual
device with a loopback check, plus the Gemini turn-taking assistant. [A4, 05]
**Evidence:** `reviewed:check` 13/13; Stop → 22 ms; 419 automated tests. **Disclose:** we didn't train the base model.

### 2. How accurate is the recognition?
**Say:** "Honestly, not accurate enough to trust on its own. On twenty of my own silent sentences the model had never
seen, the word error rate is about 74%. Short, clear sentences often come out exact, and in an earlier live test 2 of
5 were exact. That's exactly why review is the default."
*Deeper:* The stock Auto-AVSR model reports 19.1% WER on LRS3, which is voiced TV talks, not silent speech by one
person on a laptop camera. Silent articulation is harder (less lip motion). [A1]
**Evidence:** adaptVal base 84/114 = 73.7%; held-out live v1 44% WER (11/25), 2/5 exact; bright-test 7/10 exact.
**Disclose:** hand-picked wins in A1 are not an accuracy rate. The reliability gate is UNVALIDATED.

### 3. What happens when it misreads someone?
**Say:** "Nothing gets said. The words show up in the notch first. You tap Speak only if they're right, or tap Edit
and fix them. A new sentence invalidates the old one, so a stale guess can never slip out."
*Deeper:* `speak_reviewed` refuses tampered text, a changed voice, paused/stale sessions, and a second Speak.
**Evidence:** `reviewed:check` 13/13. **Disclose:** the opt-in Real-time mode *does* speak unreviewed, behind an
explicit per-session warning, labelled REAL-TIME. It's off by default.

### 4. What if the AI says the opposite of what the user meant?
**Say:** "For lip reading, AI never rewrites anything, and you approve the exact text. For Gemini, it can't invent an
opinion: the opinion moves are refused unless you type your own point, and our code strips any fact you didn't give.
You still read and edit the draft before Speak."
**Evidence:** respond:eval 20/20 (stance kept, baited personal facts not invented); 0/58 drafts needed removal.
**Disclose:** synthetic agent-written tests, not user studies. Deterministic filters catch facts, not tone.

### 5. Who exactly would use TACIT?
**Say:** "People who can still shape words with their lips but can't make sound: for example after a total
laryngectomy, especially in the weeks before other voice options are ready, or on a tracheostomy. And people who need
to join ordinary video calls. But we haven't validated it with anyone in those groups yet."
**Evidence:** SRAVI studies show interest in exactly these settings (laryngectomy 2026; tracheostomy ICU 2023).
**Disclose:** no TACIT user testing. ACS's 12,290 new US laryngeal cancer cases per year isn't our user count.

### 6. Why not just use an electrolarynx or a voice prosthesis?
**Say:** "For many people those are the right answer, and we'd never tell anyone to replace them. TACIT is an extra
path: it's hands-free, it works in silence, and it goes straight into a call. That may help when healing,
dexterity or training makes the usual options hard, at least for a while."
**Evidence:** ASHA: electrolarynx needs manual dexterity and sounds electronic; esophageal speech needs a long
learning period; TEP needs occlusion, maintenance, candidacy. [A5]
**Disclose:** TACIT isn't clinically tested; we don't know yet where it actually fits clinically.

### 7. Doesn't Apple already have Live Speech?
**Say:** "Yes, and it's great: you type and it speaks in calls, even in your Personal Voice. TACIT removes the
typing. You mouth the sentence. And Help Me Respond helps when typing is the bottleneck."
**Disclose:** Apple's Personal Voice can't be used by third-party apps for call audio, so TACIT uses macOS voices (or a
consented ElevenLabs clone path in code).

### 8. What's innovative about the Gemini integration?
**Say:** "It's built to *not* decide for you. You give the move and your point, Gemini phrases it and finds the actual
question, and our code removes anything you didn't say. It refuses to guess opinions, every draft is labelled, and it
has no way to speak by itself." [A3, `TACIT_Gemini_Judge_Pitch.md`]
**Evidence:** 20/20 eval, p50 872 ms; live probe median 1.10 s; 0 speech events. **Disclose:** no meeting listening.

### 9. Does Google Meet actually receive the audio?
**Say (only what's true *today*):** "Yes. TACIT speaks into a virtual microphone, BlackHole, and Meet uses it as the
mic. *(If the judge heard it from the phone:)* You just heard it on the other end." *(If not verified today:)* "We
verified a real Meet participant hearing it yesterday. Here's the status line showing Meet reading the mic right now."
**Evidence:** HANDOFF 14 Nov 20:50 UTC: iPhone in Meet heard TACIT via BlackHole 16ch (typed speech, earlier build).
**Disclose:** reviewed speech from the *current* notch build to a Meet listener: verify in rehearsal.

### 10. Does this run in real time?
**Say:** "Close. The lip-reading model takes about 0.3 seconds per sentence. From when you stop mouthing to seeing the
words was about 1.4 seconds in our live test. After you tap Speak, the first audio reaches the mic in about 0.15
seconds."
**Evidence:** model p50 283 ms (val); end→shown p50 1385 ms (live v1); Speak→first audio 152 ms (My Voice).
**Disclose:** measured on this Mac. Recognition time depends on hardware.

### 11. What makes this a real accessibility solution rather than a tech demo?
**Say:** "Two things: the control design and the honesty. Every safety rule is enforced in code: review, Stop, no
stale speech, consented voice. And we know exactly what isn't proven yet. The next step isn't more features, it's
co-design with people who use alaryngeal speech and with speech-language pathologists."
**Disclose:** right now it *is* a prototype. We'd say so.

### 12. Have you tested it with people who have lost their voice?
**Say:** "No. Everything so far is on the founder's own silent speech and public data. Testing with real users,
properly and with consent, is the first thing on our list." [A7]
**Disclose:** say "no" plainly. Don't soften it.

### 13. What did you actually build during the hackathon?
**Say:** "Everything in the repo. 171 commits since the first one Saturday at 3:21 AM: the native notch app, the local
server and safety logic, the recognition service and evaluation tools, the audio routing helper, the Gemini
integration, and the fine-tuning experiments. What we didn't build: the pretrained lip-reading model, Apple Vision,
BlackHole, the macOS voices and Gemini itself."
**Evidence:** `git log` (first commit 2026-11-14 03:21 EST; hacking began Fri 8:30 PM); THIRD_PARTY_NOTICES.md.

### 14. What was your hardest engineering problem?
**Say:** "Making 'stop' and 'review' actually mean something in a live, streaming system. Lip movement keeps
arriving, results come back late, audio is already playing. We had to guarantee an old or changed result can never be
spoken, and that Stop cancels queued *and* playing audio. Second hardest: personal fine-tuning, where better for me
made it worse for everyone else." [A2]
**Evidence:** review-race fixes (`review_invalidated`), `reviewed:check` 13/13, Stop 22 ms; adaptation 73.7→42.1% vs
CREMA-D 6.2→10.1%.

### 15. Why native macOS?
**Say:** "Calls happen on laptops, and the controls have to be always visible and one tap away without covering the
call. The notch is perfect for that. Native also gives us the camera, Apple's on-device face tracking, and system audio
routing into a virtual mic. A browser tab can't do that reliably."
**Disclose:** Mac-only, ad-hoc signed, not notarized. Runs on this Mac only for now.

### 16. How is privacy handled?
**Say:** "Lip tracking and recognition run locally, and silent speech never uses your microphone. Gemini only sees text
you paste, and it isn't logged. Persistent logging is off by default. Voice cloning only from your own consented
sample." [A4]
**Disclose:** Gemini calls go to Google's API when you use Help Me Respond.

### 17. Is the model commercially usable?
**Say:** "No, not as it stands. The Auto-AVSR code is open source (Apache-2.0), but the LRS3 weights we use are research
and non-commercial only. A product would need licensed or self-trained weights. That's on our roadmap." [A7]
**Evidence:** `recognition/tacit_vsr/config.py` WEIGHTS_LICENSE; THIRD_PARTY_NOTICES.md.

### 18. What would you need to validate before releasing it?
**Say:** "A measured reliability gate on held-out silent recordings: word error, how often it abstains, how often a
wrong word would go out, and false triggers from non-speech. Then co-design with users and speech-language
pathologists, an approved usability study, and a licensed model." [A7]

### 19. Can it support more than one speaker?
**Say:** "The base model is speaker-independent. It was trained on thousands of public speakers, so it works for new
faces, though not well enough to skip review. Personal adaptation helps one person, but we showed it can hurt
everyone else, so it has to be per-user and checked. The app expects one face in frame at a time."
**Evidence:** CREMA-D (other speakers' recorded sentences, a narrow 12-sentence benchmark) 6.2% WER base;
"Only one face, please" guard.

### 20. How could TACIT become a sustainable product?
**Say:** "Too early to promise a business, and we won't pretend. If validation goes well, plausible paths are clinical
partnerships for the post-surgery window, where hospitals already trial apps like SRAVI, or free for individuals,
funded by assistive-tech grants. First it needs a licensed model and real user evidence."
**Disclose:** no pricing, no partners, no market sizing claimed.

---

## Questions to avoid answering beyond the evidence
- "What's the accuracy for people after laryngectomy?" → "Unknown. Not tested."
- "Is it HIPAA / FDA…?" → "It's a research prototype, not a medical device."
- "Can it read anyone's lips from far away?" → "No, it's designed for the user in front of their own camera. One face,
  close up, by choice."
