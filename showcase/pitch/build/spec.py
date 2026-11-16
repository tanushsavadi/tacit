"""Single source of truth for the TACIT judging deck.

Emits build/deck.json, consumed by (a) the Figma Slides renderer (use_figma) and (b) build_pptx.py.
Canvas 1920x1080. All coordinates are absolute slide pixels.
"""
import json, pathlib

INK, GRAPH, PANEL, LINE = "0A0D0C", "16201D", "111816", "24312D"
PAPER, TEXT, MUTED, DIM = "F4F7F6", "EEF3F1", "A3B0AB", "66736F"
MINT, TEAL, AMBER, BLACK, MINTBG = "62E3C4", "0B7D6B", "FFB547", "000000", "0E211C"


def T(x, y, w, txt, s=28, f="Regular", c=TEXT, lh=1.3, ls=0, al="LEFT", spans=None, strike=False, name=None):
    d = dict(t="text", x=x, y=y, w=w, txt=txt, s=s, f=f, c=c, lh=lh, ls=ls, al=al)
    if spans:
        d["spans"] = spans  # list of [text, colorHex|None, style|None]; concatenation must equal txt
        assert "".join(sp[0] for sp in spans) == txt, txt
    if strike:
        d["strike"] = True
    if name:
        d["name"] = name
    return d


def R(x, y, w, h, fill=None, r=0, op=1, stroke=None, sw=1, dash=False, name=None):
    d = dict(t="rect", x=x, y=y, w=w, h=h, fill=fill, r=r, op=op, stroke=stroke, sw=sw)
    if dash:
        d["dash"] = True
    if name:
        d["name"] = name
    return d


def E(x, y, w, h, fill=None, stroke=None, sw=2):
    return dict(t="ell", x=x, y=y, w=w, h=h, fill=fill, stroke=stroke, sw=sw)


def I(x, y, w, h, src, r=0):
    return dict(t="img", x=x, y=y, w=w, h=h, src=src, r=r)


def eyebrow(txt, y=176, x=120, c=MINT, w=1200):
    return T(x, y, w, txt, s=20, f="Semi Bold", c=c, ls=16)


LOCKUP_W, LOCKUP_H = 149, 40  # a_lockup.png is 1600x430


def chrome(n, total="06", appendix=False):
    lab = f"A{n}" if appendix else f"{n:02d} / {total}"
    return [I(120, 64, LOCKUP_W, LOCKUP_H, "a_lockup.png"), T(1500, 74, 300, lab, s=18, f="Semi Bold", c=DIM, al="RIGHT", ls=10)]


def footer(txt, y=1012):
    return T(120, y, 1680, txt, s=15, c=DIM, lh=1.35)


slides = []

# ---------------------------------------------------------------- 00 COLD OPEN
slides.append(dict(name="00 · Cold open", bg=BLACK, section="Pitch", els=[
    E(951, 531, 18, 18, fill=MINT),
], notes="""- **Stage cue — say nothing.** Face the judges, then turn to the Mac camera.
- **Silently mouth:** "How are you doing?" — normal pace, lips clear. Hold ~3 s of silence.
- Turn back. Pause one beat. Then advance and say: **"You just watched me say something. You didn't hear a word."**
- Do NOT pretend to have a disability. You are showing the gap, not playing a patient."""))

# ---------------------------------------------------------------- 01 HOOK
slides.append(dict(name="01 · The silence", bg=INK, section="Pitch", els=[
    eyebrow("YOU SAW ME SAY SOMETHING. YOU DIDN'T HEAR A WORD.", y=300),
    T(120, 352, 1560, "Losing your voice shouldn't mean losing your place in the conversation.", s=96, f="Bold", lh=1.06,
      spans=[["Losing your voice shouldn't mean losing ", None, None], ["your place in the conversation.", MINT, None]]),
    I(120, 940, 186, 50, "a_lockup.png"),
    T(1300, 954, 500, "HackUMass XIV · Accessibility", s=18, f="Semi Bold", c=DIM, al="RIGHT", ls=10),
], notes="""- (0:08) "You just watched me say something. You didn't hear a word."
- "For people who lose their voice — after throat cancer surgery, or with a breathing tube — that's not a trick. It's every conversation."
- **Land the headline. Pause.** Don't read it aloud word for word; let them read it while you breathe.
- Transition: "And here's the thing most people miss —" → next slide."""))

# ---------------------------------------------------------------- 02 NEED
cards = []
for i, (title, sub, ok) in enumerate([("Think it", "the message", True), ("Shape it", "lips, tongue, jaw", True),
                                      ("Sound it", "voice from the larynx", False)]):
    x = 120 + i * 330
    if ok:
        cards += [R(x, 450, 300, 210, fill=GRAPH, r=22), E(x + 30, 482, 16, 16, fill=MINT),
                  T(x + 30, 518, 250, title, s=40, f="Semi Bold"), T(x + 30, 576, 250, sub, s=22, c=MUTED)]
    else:
        cards += [R(x, 450, 300, 210, fill=None, r=22, stroke=DIM, sw=2, dash=True), E(x + 30, 482, 16, 16, stroke=DIM, sw=2),
                  T(x + 30, 518, 250, title, s=40, f="Semi Bold", c=DIM, strike=True), T(x + 30, 576, 250, sub, s=22, c=DIM),
                  T(x + 30, 608, 260, "can be lost", s=20, f="Semi Bold", c=AMBER)]
slides.append(dict(name="02 · The human need", bg=INK, section="Pitch", els=chrome(2) + [
    eyebrow("THE HUMAN NEED"),
    T(120, 222, 1060, "The words are still there.\nThe sound may not be.", s=68, f="Bold", lh=1.08,
      spans=[["The words are still there.\n", None, None], ["The sound may not be.", MUTED, None]]),
    *cards,
    T(120, 712, 990, "“Limited options for speech rehabilitation in the immediate postoperative period, resulting in communication difficulties and patient frustration.”",
      s=28, f="Medium", lh=1.35),
    T(120, 832, 990, "— Fassler et al., 2026, on the weeks after total laryngectomy ¹", s=20, c=MUTED),
    T(120, 884, 990, "Electrolarynx, voice prosthesis, esophageal speech, writing and AAC all help — each asks for hands, training, healing time or typing speed. ²",
      s=22, c=MUTED, lh=1.4),
    R(1220, 176, 580, 780, fill=GRAPH, r=28),
    T(1268, 224, 480, "EARLY CLINICAL SIGNAL", s=18, f="Semi Bold", c=MINT, ls=16),
    T(1262, 262, 540, "69.7%", s=156, f="Bold", c=MINT, lh=1.0),
    T(1268, 470, 484, "of patients after total laryngectomy preferred a lip-reading app to writing things down.", s=32, f="Semi Bold", lh=1.25),
    R(1268, 662, 484, 2, fill=LINE),
    T(1268, 690, 484, "That app is SRAVI — a fixed-phrase research app, not TACIT. 16 patients, 652 uses. Right phrase on the first try 43%, overall 67%. Small and imperfect — and still preferred. ¹",
      s=21, c=MUTED, lh=1.42),
    footer("¹ Fassler CA et al. Otolaryngol Head Neck Surg. 2026;174(2):582–586. PMID 41485241.     ² ASHA Practice Portal: Communication After Total Laryngectomy."),
], notes="""- (0:20) "Your mind still forms the words. Your lips still shape them. What can be lost is the sound."
- "After a total laryngectomy, people do relearn to speak — electrolarynx, voice prosthesis — and those tools are real and good. But they need hands, training, healing time."
- Point to the card: "In a 2026 clinical study, most patients right after surgery preferred a **lip-reading app** to writing — even at 43% first-try accuracy."
- **Say the caveat yourself:** "That's someone else's app, a fixed phrase list, 16 patients. It tells us people want this — not that we've solved it."
- Transition: "So we asked: what if your lips could speak in any conversation — in your own words?\""""))

# ---------------------------------------------------------------- 03 INTRODUCING
tiles = []
cols = [
    ("01", "Mouth it", "You shape the words silently toward your Mac's camera."),
    ("02", "TACIT reads it", "Visual speech recognition, running locally. Lips only — no microphone."),
    ("03", "You review", "Words appear in the notch. Edit, or tap Speak. Nothing is sent before you do."),
    ("04", "Your voice", "The approved words are spoken in the voice you chose."),
    ("05", "Into the call", "A virtual microphone carries them into Google Meet, Zoom, any call app."),
]
for i, (num, title, sub) in enumerate(cols):
    x = 120 + i * 340
    tiles.append(R(x, 440, 320, 240, fill=BLACK, r=20, stroke=LINE, sw=1))
    if i == 0:
        tiles += [I(x, 440, 320, 240, "a_mouth.jpg", r=20), R(x + 14, 640, 200, 26, fill=BLACK, r=13, op=0.7),
                  T(x + 26, 645, 190, "VIDEO ONLY · NO AUDIO", s=12, f="Semi Bold", c=MINT, ls=8)]
    elif i == 1:
        tiles += [T(x + 20, 500, 280, "RECOGNIZED", s=15, f="Semi Bold", c=MINT, ls=16, al="CENTER"),
                  T(x + 20, 532, 280, "HOW ARE YOU DOING", s=28, f="Bold", al="CENTER", lh=1.15),
                  T(x + 20, 616, 280, "from lip movement alone", s=16, c=DIM, al="CENTER")]
    elif i == 2:
        tiles.append(I(x + 10, 481, 300, 158, "a_review.png"))
    elif i == 3:
        tiles.append(I(x + 10, 481, 300, 158, "a_speaking.png"))
    else:
        tiles += [T(x + 20, 506, 280, "MICROPHONE", s=15, f="Semi Bold", c=DIM, ls=16, al="CENTER"),
                  T(x + 20, 536, 280, "BlackHole 16ch", s=32, f="Semi Bold", al="CENTER"),
                  T(x + 20, 590, 280, "→  Meet · Zoom · any call", s=19, c=MINT, al="CENTER")]
    tiles += [E(x - 6 + 6, 703, 12, 12, fill=MINT),
              T(x, 734, 320, num, s=20, f="Semi Bold", c=MINT, ls=10),
              T(x, 764, 320, title, s=32, f="Semi Bold"),
              T(x, 816, 310, sub, s=21, c=MUTED, lh=1.4)]
slides.append(dict(name="03 · Introducing TACIT", bg=INK, section="Pitch", els=chrome(3) + [
    eyebrow("INTRODUCING TACIT"),
    T(120, 222, 1680, "TACIT turns silent articulation into a way to speak.", s=64, f="Bold", lh=1.08),
    R(126, 708, 1660, 2, fill=LINE),
    *tiles,
    footer("Real captures from the deployed native macOS app. The review step is the safety design: lip reading can be wrong, so you always see the words first.", y=990),
], notes="""- (0:45) "This is TACIT. A native Mac app that lives in the notch."
- Walk left → right, one breath each: "I mouth the words. TACIT reads my lips — on the Mac, no microphone. The words show up in the notch. I fix them or tap Speak. They're spoken in the voice I chose, into the microphone of a normal Google Meet call."
- **Emphasise tile 3:** "That review step is on purpose. Lip reading gets words wrong. So nothing reaches the call until I say so."
- Transition: "Let me show you instead of telling you." → walk to the Mac."""))

# ---------------------------------------------------------------- 04 LIVE DEMO
steps = ["Start communicating", "I mouth “How are you doing?” — silently", "TACIT shows exactly what it read",
         "I fix a word if needed, then tap Speak", "You hear it from the other side of the call"]
step_els = []
for i, s in enumerate(steps):
    y = 590 + i * 54
    step_els += [T(120, y, 40, str(i + 1), s=26, f="Bold", c=MINT), T(168, y, 640, s, s=26)]
slides.append(dict(name="04 · Live demo", bg=BLACK, section="Pitch", els=chrome(4) + [
    E(120, 205, 14, 14, fill=MINT), T(146, 198, 400, "LIVE DEMO", s=20, f="Semi Bold", c=MINT, ls=16),
    T(120, 250, 700, "Mouth.\nReview.\nSpeak.", s=92, f="Bold", lh=1.02,
      spans=[["Mouth.\nReview.\n", None, None], ["Speak.", MINT, None]]),
    *step_els,
    T(120, 930, 720, "Backup if the room beats the camera: the same live recognizer on a recorded silent clip — and we'll say it's recorded.", s=18, c=DIM, lh=1.4),
    R(860, 232, 960, 524, fill="0C1210", r=40),
    I(880, 251, 920, 486, "a_review.png"),
    T(880, 782, 920, "Real capture · Review first — only Speak sends these words", s=20, c=DIM, al="CENTER"),
], notes="""- (1:10) **Leave this slide up only as a cue.** Stay silent from mouthing until Speak, then press **Pause** before talking (TACIT reads any lip movement). Eyes go to the Mac, not the screen.
- Click the notch → **Start communicating**. Mouth **"How are you doing?"** at the camera.
- Words appear. If exact → "That's what it read. Nothing has been said yet." Tap **Speak**.
- If one word is wrong → **this is the best moment of the pitch**: "It misread one word. That's exactly why I review." Tap **Edit**, fix, **Speak**.
- Judge holds the phone on the Meet call: "You're the other person on this call — tell us what you heard."
- **Only say 'Meet heard it' if the judge actually heard it.**
- Fallback ladder: see TACIT_Live_Demo_Runbook.md (Level 2 recorded clip → Level 3 film excerpt). Always announce recorded input."""))

# ---------------------------------------------------------------- 05 ARCHITECTURE
colx = [120 + i * 286 for i in range(6)]


def box(x, y, title, sub, w=250, h=130):
    return [R(x, y, w, h, fill=GRAPH, r=18), T(x + 24, y + 28, w - 44, title, s=25, f="Semi Bold", lh=1.15),
            T(x + 24, y + 70, w - 40, sub, s=18, c=MUTED, lh=1.3)]


def arrow(x, y):
    return T(x, y, 36, "→", s=28, f="Semi Bold", c=MINT, al="CENTER")


arch = []
arch += [T(120, 368, 600, "SILENT SPEECH", s=16, f="Semi Bold", c=MINT, ls=16)]
arch += box(colx[0], 400, "Camera", "video only, no audio")
arch += box(colx[1], 400, "Lip tracking", "Apple Vision · on device")
arch += box(colx[2], 400, "Speech from lips", "Auto-AVSR · runs locally")
arch += [T(120, 568, 700, "HELP ME RESPOND · GEMINI", s=16, f="Semi Bold", c=MINT, ls=16)]
arch += box(colx[0], 600, "What they said", "you paste or type it")
arch += box(colx[1], 600, "Your move", "+ your point, in a few words")
arch += box(colx[2], 600, "Gemini drafts", "JSON schema · grounding checks")
arch += [R(colx[3], 400, 250, 330, fill=MINTBG, r=22, stroke=MINT, sw=2),
         T(colx[3] + 28, 430, 200, "You", s=48, f="Bold", c=MINT),
         T(colx[3] + 28, 500, 200, "see the words\nedit anything\ntap Speak", s=24, lh=1.55)]
arch += box(colx[4], 500, "Your voice", "macOS voice or your consented clone")
arch += box(colx[5], 500, "Call microphone", "BlackHole → Meet · Zoom")
for c in range(3):
    if c < 2:
        arch += [arrow(colx[c] + 250, 444), arrow(colx[c] + 250, 644)]
    else:
        arch += [arrow(colx[c] + 250, 444), arrow(colx[c] + 250, 644)]
arch += [arrow(colx[3] + 250, 544), arrow(colx[4] + 250, 544)]
chips = [("Never rewritten", "AI never edits the words TACIT read from your lips."),
         ("Never automatic", "Nothing reaches the call until you tap Speak."),
         ("Never guesses", "Gemini needs your own point before it drafts an opinion."),
         ("Stop means stop", "Queued and playing speech cancelled — 22 ms in our checks.")]
for i, (a, b) in enumerate(chips):
    x = 120 + i * 425
    arch += [R(x, 790, 405, 150, fill=PANEL, r=20, stroke=LINE, sw=1), E(x + 28, 822, 12, 12, fill=MINT),
             T(x + 52, 812, 330, a, s=25, f="Semi Bold"), T(x + 28, 856, 350, b, s=19, c=MUTED, lh=1.35)]
slides.append(dict(name="05 · What makes it different", bg=INK, section="Pitch", els=chrome(5) + [
    eyebrow("HOW IT'S BUILT"),
    T(120, 222, 1680, "AI does the reading. You do the deciding.", s=64, f="Bold", lh=1.08),
    *arch,
    footer("Real-time (unreviewed) mode exists for practised phrases: off by default, opt-in per session behind an explicit warning, always labelled REAL-TIME."),
], notes="""- (2:05) "Under the hood: the camera feeds Apple's on-device lip tracking, then an open-source visual speech model running locally on the Mac."
- "Gemini does something different. When typing a reply is too slow, I paste what they said, choose a move — like *share my view* — and type my point in a few words. Gemini turns that into a natural sentence."
- **Point at the mint box:** "Both paths stop here. With me."
- "AI never rewrites what it read from my lips. Gemini can't invent my opinion — it refuses if I haven't given one. And Stop cancels speech in about 20 milliseconds."
- Transition: "So where does that leave us?\""""))

# ---------------------------------------------------------------- 06 VISION
status = [("WORKS TODAY", MINT, "Silent words → your review → your chosen voice → a call's microphone, on one Mac."),
          ("NOT PROVEN YET", AMBER, "Accuracy across people, faces and rooms. Any testing with people who have lost their voice."),
          ("NEXT", PAPER, "Personal models that don't forget other speakers. Co-design with speech-language pathologists. Real speed and error rates in real calls.")]
st = []
for i, (lab, col, txt) in enumerate(status):
    y = 186 + i * 160
    st += [R(1040, y, 4, 128, fill=col), T(1072, y + 2, 700, lab, s=18, f="Semi Bold", c=col, ls=16),
           T(1072, y + 36, 728, txt, s=25, lh=1.35)]
slides.append(dict(name="06 · The takeaway", bg=INK, section="Pitch", els=chrome(6) + [
    T(120, 180, 880, "Your words.\nYour voice.\nBeyond speech.", s=104, f="Bold", lh=1.02,
      spans=[["Your words.\nYour voice.\n", None, None], ["Beyond speech.", MINT, None]]),
    *st,
    R(120, 728, 1680, 2, fill=LINE),
    T(120, 776, 1600, "We aren't trying to decide what someone should say.\nWe're trying to give them another way to be heard.", s=44, f="Medium", lh=1.3,
      spans=[["We aren't trying to decide what someone should say.\n", None, None], ["We're trying to give them another way to be heard.", MINT, None]]),
    T(120, 990, 1200, "github.com/tanushsavadi/tacit  ·  demo film youtu.be/GeV55H-ozqw", s=18, c=DIM),
], notes="""- (2:30) "Today it works end to end on one Mac. It is not proven: lip reading across different people and rooms is still hard, and we haven't tested with people who've lost their voice. That's next — with speech-language pathologists, not around them."
- **Slow down. Final line, look at the judges, not the screen:**
- "We aren't trying to decide what someone should say. We're trying to give them another way to be heard."
- Stop talking. Smile. "Happy to show anything again." (Appendix A1–A8 for questions.)"""))

# ================================================================ APPENDIX
# A1 recognition
rows = [("“please turn on the lights”", "PLEASE TURN ON THE LIGHTS", None, True),
        ("“I would like some water please”", "I WOULD LIKE SOME WATER PLEASE", None, True),
        ("“I don't understand”", "I DONT UNDERSTAND", None, True),
        ("“can you call my mother”", "CAN YOU CALL MY MOTHER", None, True),
        ("“how are you doing”", "HOW ARE YOU GOING", [["HOW ARE YOU ", None, None], ["GOING", AMBER, None]], False)]
tbl = [T(120, 352, 500, "MOUTHED SILENTLY", s=16, f="Semi Bold", c=DIM, ls=16),
       T(760, 352, 600, "RECOGNIZED (VERBATIM)", s=16, f="Semi Bold", c=DIM, ls=16),
       T(1560, 352, 240, "RESULT", s=16, f="Semi Bold", c=DIM, ls=16)]
for i, (m, rec, spans, ok) in enumerate(rows):
    y = 392 + i * 92
    tbl += [R(120, y, 1680, 1, fill=LINE), T(120, y + 28, 600, m, s=27, c=MUTED),
            T(760, y + 27, 780, rec, s=29, f="Bold", spans=spans),
            R(1560, y + 22, 170 if not ok else 110, 46, fill=None, r=23, stroke=(MINT if ok else AMBER), sw=1.5),
            T(1560, y + 32, 170 if not ok else 110, "Exact" if ok else "1 word wrong", s=19, f="Semi Bold", c=(MINT if ok else AMBER), al="CENTER")]
tbl.append(R(120, 392 + 5 * 92, 1680, 1, fill=LINE))
slides.append(dict(name="A1 · Recognition, unedited", bg=INK, section="Appendix", els=chrome(1, appendix=True) + [
    eyebrow("APPENDIX · RECOGNITION"),
    T(120, 222, 1680, "What TACIT read from silent lips — unedited.", s=56, f="Bold", lh=1.1),
    *tbl,
    R(120, 872, 1680, 116, fill=GRAPH, r=20),
    T(156, 890, 230, "73.7%", s=60, f="Bold", c=AMBER, lh=1.0),
    T(420, 896, 1350, "Word error rate of the shipped model on 20 held-back sentences of the founder's own silent speech. The wins above are hand-picked — not an accuracy rate. That's why every word is reviewed before it's spoken.",
      s=21, lh=1.38),
    footer("Founder's own silent clips, video only · unmodified Auto-AVSR (LRS3 visual weights, research licence) · offline evaluator output, verbatim.", y=1020),
], notes="""- Use when asked "how accurate is it?" Lead with the honest number: **73.7% word error on my own held-back silent sentences** with the stock model.
- "Short, clear sentences often come out exact. Others don't. That's why review is the default and automatic speech is off."
- The 'GOING' row is a real miss — use it to show why the Edit step exists."""))

# A2 engineering journey
slides.append(dict(name="A2 · What we tried", bg=INK, section="Appendix", els=chrome(2, appendix=True) + [
    eyebrow("APPENDIX · WHAT WE TRIED, WHAT FAILED"),
    T(120, 222, 1640, "We made it better for one person — and chose not to ship it.", s=56, f="Bold", lh=1.1),
    T(120, 420, 900, "FOUNDER'S SILENT SPEECH · 20 VALIDATION SENTENCES", s=17, f="Semi Bold", c=MUTED, ls=14),
    T(120, 452, 900, "73.7% → 42.1%", s=76, f="Bold", lh=1.05, spans=[["73.7%", None, None], [" → ", DIM, None], ["42.1%", MINT, None]]),
    T(120, 548, 900, "word error rate (lower is better) after fine-tuning on 101 of my silent clips", s=20, c=MUTED),
    R(120, 594, 590, 12, fill=DIM, r=6), R(120, 614, 337, 12, fill=MINT, r=6),
    T(120, 684, 900, "OTHER SPEAKERS · CREMA-D, 96 CLIPS", s=17, f="Semi Bold", c=MUTED, ls=14),
    T(120, 716, 900, "6.2% → 10.1%", s=76, f="Bold", lh=1.05, spans=[["6.2%", None, None], [" → ", DIM, None], ["10.1%", AMBER, None]]),
    T(120, 812, 900, "the same model got worse for everyone else", s=20, c=MUTED),
    R(120, 858, 50, 12, fill=DIM, r=6), R(120, 878, 81, 12, fill=AMBER, r=6),
    T(120, 908, 900, "bars share one scale", s=15, c=DIM),
    R(1100, 404, 700, 560, fill=GRAPH, r=26),
    T(1144, 444, 600, "DECISION", s=17, f="Semi Bold", c=MINT, ls=16),
    T(1144, 480, 620, "Our rule, written before the results: other speakers may get at most 1 point worse. It got 3.9 points worse.", s=28, f="Semi Bold", lh=1.3),
    T(1144, 636, 620, "Not deployed. The demo runs the unmodified model.", s=22, c=MINT),
    R(1144, 690, 612, 2, fill=LINE),
    T(1144, 714, 600, "ALSO TRIED", s=16, f="Semi Bold", c=DIM, ls=16),
    T(1144, 748, 620, "• AirPods jaw-motion sensing — couldn't reliably tell words apart; parked as research.\n• Mouthing to pick 1 of 3 AI replies — not the user's own words; replaced by open vocabulary + review.\n• Blending back toward the base model — kept only 56% of the gain.",
      s=19, lh=1.42),
    footer("Rules pre-registered 15 Nov 2026 00:30 UTC, before any result · experimental development data, not a guarantee for the deployed model · logs in recognition/data/eval."),
], notes="""- HackUMass asks what you tried, what failed, what you learned. This is the answer.
- "Fine-tuning on my own silent speech cut my error rate from 74% to 42%. But it got worse for other speakers. We'd written the rule down before seeing results, it failed, so we didn't ship it."
- Lesson: personal adaptation needs more data and rehearsal of other voices — that experiment is running now (prompts recorded separately; not in the demo)."""))

# A3 Gemini
flow = [("THEY SAID · pasted or typed by you", "“…We can do Friday at 3, or keep you on Monday at 9. Which works better for you?”"),
        ("YOUR MOVE", "Ask a question · Share my view · Disagree kindly · Buy a moment · Phrase it for me"),
        ("YOUR POINT · required for opinions", "friday, monday mornings are hard for me"),
        ("GEMINI'S DRAFT · editable, then Speak", "“Friday works better for me since Monday mornings are hard.”")]
fl = []
for i, (a, b) in enumerate(flow):
    y = 400 + i * 128
    fl += [R(120, y + 6, 3, 96, fill=(MINT if i != 2 else AMBER)),
           T(146, y, 760, a, s=16, f="Semi Bold", c=(MINT if i != 2 else AMBER), ls=14),
           T(146, y + 30, 760, b, s=23, lh=1.32, f=("Medium" if i == 2 else "Regular"))]
stats = [("20/20", "synthetic safety cases passed"), ("0.87 s", "median (p95 2.6 s)"),
         ("0/58", "drafts needed a removal"), ("2/2", "prompt injections ignored")]
sts = []
for i, (a, b) in enumerate(stats):
    x = 1000 + i * 205
    sts += [T(x, 830, 190, a, s=40, f="Bold", c=MINT), T(x, 884, 185, b, s=16, c=MUTED, lh=1.3)]
slides.append(dict(name="A3 · Gemini Help Me Respond", bg=INK, section="Appendix", els=chrome(3, appendix=True) + [
    eyebrow("APPENDIX · BEST USE OF GEMINI API"),
    T(120, 222, 1680, "Gemini helps people take their turn — without deciding what they think.", s=56, f="Bold", lh=1.1),
    *fl,
    R(1000, 400, 800, 354, fill=BLACK, r=24),
    I(1000, 400, 800, 353, "a_presence.png"),
    T(1000, 770, 800, "Interface render of the shipped build · SAMPLE context · label flips to “Your edit of an AI suggestion”", s=16, c=DIM),
    *sts,
    footer("@google/genai · gemini-3.5-flash-lite → flash fallback · JSON schema · numbers, dates, names or experiences you didn't supply are removed · agent-written cases vs the real API, 15 Nov 2026 — not a user study."),
], notes="""- 45-second Gemini pitch lives in TACIT_Gemini_Judge_Pitch.md.
- Key line: "Gemini helps people participate without deciding what they think."
- Metrics are synthetic, agent-written test cases against the real API — say so.
- Avoid running live Gemini more than ~3 times a minute (429 quota seen during evals)."""))

# A4 Safety
cards6 = [("On your Mac", "Lip tracking and recognition run locally. Silent speech never uses your microphone."),
          ("You authorise every word", "Speech needs Live on for this session and your tap on Speak. The exact text is hash-checked: what you saw is what's spoken."),
          ("Stale is dropped", "Results from an old utterance, a paused session or an ended call are discarded — never spoken."),
          ("Stop wins", "Stop and Pause cancel queued and playing audio — 22 ms in our checks."),
          ("Gemini sees only what you give it", "Text you paste or type, fenced as untrusted. Content is never logged or stored."),
          ("Your voice, with consent", "Cloning only from your own consented sample. Substituted voices are labelled. Logging is opt-in, off by default.")]
c6 = []
for i, (a, b) in enumerate(cards6):
    x = 120 + (i % 3) * 567
    y = 360 + (i // 3) * 300
    c6 += [R(x, y, 546, 276, fill=GRAPH, r=22), E(x + 36, y + 42, 14, 14, fill=MINT),
           T(x + 36, y + 76, 474, a, s=29, f="Semi Bold", lh=1.2), T(x + 36, y + 128, 474, b, s=21, c=MUTED, lh=1.42)]
slides.append(dict(name="A4 · Consent, privacy, control", bg=INK, section="Appendix", els=chrome(4, appendix=True) + [
    eyebrow("APPENDIX · CONSENT, PRIVACY, CONTROL"),
    T(120, 222, 1680, "Built so nothing speaks for you.", s=56, f="Bold", lh=1.1),
    *c6,
    footer("Enforced in server code (speak_reviewed authorization: Live generation + utterance id + candidate index + text hash) and covered by reviewed:check 13/13."),
], notes="""- Use for privacy / safety questions. Everything here is enforced in code and tested; nothing here is a clinical claim."""))

# A5 Landscape
land = [("Electrolarynx", "A handheld device makes the sound", "Electronic tone; needs a hand and dexterity ²", False),
        ("Voice prosthesis (TEP)", "Surgical valve; closest to natural voice", "Stoma occlusion, upkeep, candidacy ²", False),
        ("Esophageal speech", "No device; air from the esophagus", "Long learning period; short, quiet phrases ²", False),
        ("Writing · AAC · Apple Live Speech", "Type, then it's shown or spoken", "As fast as you can type", False),
        ("SRAVI (research app)", "Mouth one phrase from a fixed list", "Closed phrase set; phone app; clinical pilots ¹ ³", False),
        ("TACIT (prototype)", "Mouth any sentence → review → any call", "Accuracy unvalidated; not clinically tested", True)]
ld = [T(120, 352, 400, "OPTION", s=16, f="Semi Bold", c=DIM, ls=16), T(620, 352, 500, "HOW YOU COMMUNICATE", s=16, f="Semi Bold", c=DIM, ls=16),
      T(1200, 352, 500, "TRADE-OFF", s=16, f="Semi Bold", c=DIM, ls=16)]
for i, (a, b, c, me) in enumerate(land):
    y = 390 + i * 96
    if me:
        ld.append(R(104, y + 4, 1712, 88, fill=MINTBG, r=16))
    else:
        ld.append(R(120, y, 1680, 1, fill=LINE))
    ld += [T(120 + (16 if me else 0), y + 30, 480, a, s=25, f="Semi Bold", c=(MINT if me else TEXT)),
           T(620, y + 31, 540, b, s=22, c=(TEXT if me else MUTED)), T(1200, y + 31, 600, c, s=22, c=(TEXT if me else MUTED))]
slides.append(dict(name="A5 · Where TACIT fits", bg=INK, section="Appendix", els=chrome(5, appendix=True) + [
    eyebrow("APPENDIX · WHERE TACIT FITS"),
    T(120, 222, 1680, "Another path — not a replacement.", s=56, f="Bold", lh=1.1),
    *ld,
    footer("We didn't find this combination elsewhere in our search — that's not a claim to be first.   ¹ Fassler 2026   ² ASHA Practice Portal   ³ Musalia 2023 (14 tracheostomy patients: 75% rank-1, 86% top-3, fixed phrases)."),
], notes="""- "Electrolarynx and voice prostheses are the standard of care and work well for many people. TACIT is an extra path for situations where those don't fit — like the weeks after surgery, or when hands are busy."
- Apple Live Speech: typing → speech in calls. TACIT's difference: no typing — you mouth the sentence."""))

# A6 Evidence
ev = [("419", "automated tests passing · Swift 103 · server 196 · web 80 · recognition 40"),
      ("13/13", "reviewed-speech safety checks · tampered, stale and double Speak refused"),
      ("22 ms", "from Stop to speech interrupted"),
      ("8 s", "recognizer killed → back online by itself"),
      ("283 ms", "lip-reading model time per utterance (median, Apple GPU)"),
      ("11/11", "native app → server → Gemini → app end-to-end checks")]
evs = []
for i, (a, b) in enumerate(ev):
    x = 120 + (i % 3) * 360
    y = 360 + (i // 3) * 270
    evs += [R(x, y, 340, 250, fill=GRAPH, r=22), T(x + 32, y + 34, 290, a, s=56, f="Bold", c=MINT, lh=1.0),
            T(x + 32, y + 116, 280, b, s=19, c=MUTED, lh=1.38)]
slides.append(dict(name="A6 · Testing & reliability", bg=INK, section="Appendix", els=chrome(6, appendix=True) + [
    eyebrow("APPENDIX · TESTING & RELIABILITY"),
    T(120, 222, 1680, "What we measured — and what we haven't.", s=56, f="Bold", lh=1.1),
    *evs,
    R(1220, 360, 580, 520, fill=None, r=22, stroke=AMBER, sw=1.5),
    T(1260, 396, 500, "NOT VERIFIED YET", s=17, f="Semi Bold", c=AMBER, ls=16),
    T(1260, 436, 510, "A remote Meet listener hearing TACIT — checked in rehearsal before we claim it\n\nLive-camera recognition for a new person in a new room\n\nAny testing with people who have lost their voice\n\nA full VoiceOver pass",
      s=22, lh=1.35),
    footer("Release gate on the deployed build, 15 Nov 2026 05:31–05:56 UTC (docs/RELEASE_RUNBOOK.md). 283 ms = model compute only, not end-to-end latency."),
], notes="""- If rehearsal confirms the Meet listener heard TACIT, you may say so — and only then.
- 'Real time?' → model ~0.3 s per utterance; Real-time mode speaks roughly 1–1.5 s after you finish mouthing (runbook observation, not a benchmark)."""))

# A7 Roadmap
road = [("A measured reliability gate", "Held-out silent recordings: word error, abstention, wrong-word transmissions, false triggers from non-speech. Today: not validated — so automatic speech stays off by default."),
        ("Co-design with the people it's for", "People who use alaryngeal speech or AAC, and speech-language pathologists, shape the flow before we add features."),
        ("An approved usability study", "Communication speed, errors and preference versus writing — the questions the SRAVI studies asked."),
        ("A model we're allowed to ship", "Auto-AVSR's LRS3 weights are research / non-commercial only. A product needs licensed or self-trained weights."),
        ("Personal, without forgetting", "More personal data plus rehearsal of other speakers, judged by the same pre-registered rule.")]
rd = []
for i, (a, b) in enumerate(road):
    y = 356 + i * 124
    rd += [R(120, y, 1680, 1, fill=LINE), T(120, y + 28, 70, str(i + 1), s=44, f="Bold", c=MINT, lh=1.0),
           T(210, y + 34, 600, a, s=28, f="Semi Bold"), T(860, y + 30, 940, b, s=21, c=MUTED, lh=1.38)]
slides.append(dict(name="A7 · Before anyone relies on it", bg=INK, section="Appendix", els=chrome(7, appendix=True) + [
    eyebrow("APPENDIX · BEFORE ANYONE RELIES ON IT"),
    T(120, 222, 1680, "What we'd validate next.", s=56, f="Bold", lh=1.1),
    *rd,
], notes="""- For 'what would you need before real users?' and 'is the model commercially usable?' (No — research licence.)"""))

# A8 Sources
src = ("1  Fassler CA, Krishnapura SG, Sharbel D, et al. Utility of a Novel Mobile Lip-Reading Application for Patients After Total Laryngectomy. "
       "Otolaryngol Head Neck Surg. 2026;174(2):582–586. doi:10.1002/ohn.70098 · PMID 41485241. 16 patients; 652 valid transactions; 43% first-attempt, 67% total accuracy; 69.7% preferred SRAVI to written communication.\n\n"
       "2  American Speech-Language-Hearing Association. Practice Portal: Communication After Total Laryngectomy. asha.org/practice-portal/clinical-topics/head-and-neck-cancer/communication-after-total-laryngectomy\n\n"
       "3  Musalia M, Laha S, Cazalilla-Chica J, et al. A user evaluation of speech/phrase recognition software in critically ill patients: a DECIDE-AI feasibility study. "
       "Crit Care. 2023;27:277. doi:10.1186/s13054-023-04420-x · PMC10332046. 14 tracheostomy patients; 516 phrase-identifiable recordings; DNN 75% rank-1, 86% top-3 (fixed phrases).\n\n"
       "4  American Cancer Society. Key Statistics for Laryngeal and Hypopharyngeal Cancers (rev. 28 May 2026): about 12,290 new U.S. laryngeal cancer cases estimated for 2026. Not all lose their voice; not TACIT's user count.\n\n"
       "5  TACIT measurements: README, docs/HANDOFF.md, docs/RELEASE_RUNBOOK.md — github.com/tanushsavadi/tacit. Third-party results above are other systems, not TACIT.")
slides.append(dict(name="A8 · Sources", bg=INK, section="Appendix", els=chrome(8, appendix=True) + [
    eyebrow("APPENDIX · SOURCES"),
    T(120, 222, 1680, "Sources.", s=56, f="Bold", lh=1.1),
    T(120, 340, 1680, src, s=21, c=MUTED, lh=1.42),
], notes="- Every number in the deck traces to one of these. TACIT has not been clinically tested."))

out = pathlib.Path(__file__).with_name("deck.json")
out.write_text(json.dumps(slides, indent=1, ensure_ascii=False))
print(len(slides), "slides ->", out, out.stat().st_size, "bytes")
