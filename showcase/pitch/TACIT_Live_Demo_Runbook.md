# TACIT — Live demo runbook (Google Meet)

Built from `docs/RELEASE_RUNBOOK.md`, `docs/HANDOFF.md` and the Gemini readiness report, against the deployed build
(server pid 38791, companion built 05:51 UTC, main `cbb1612` + docs). **This runbook changes nothing in the app.** Don't
rebuild, restart or redeploy before judging unless the app is broken. If you must, see "Recovery" below.

## 0. What has and hasn't been verified (say only what's true)

| Claim | Status | Source |
|---|---|---|
| A real Meet participant heard TACIT through BlackHole | **Verified once, earlier build** (14 Nov ~20:50 UTC: Meet mic = BlackHole 16ch; the user's iPhone heard TACIT's typed speech) | HANDOFF "Verified status" |
| Reviewed silent speech from the current notch heard by a Meet listener | **Not verified yet.** Rendered at BlackHole locally with no listener | RELEASE_RUNBOOK "Physical checks still owed" |
| Live camera recognition with a person, current build | **Not re-verified.** Earlier held-out live test: 44% WER, 2/5 exact, ~1.4 s from end of mouthing to words shown | HANDOFF |
| Recorded silent clip → live recognizer → notch | **Verified**: "HOW ARE YOU DOING", "PLEASE TURN ON THE LIGHTS" exact | RELEASE_RUNBOOK |
| Stop cancels speech | **Verified**: 22 ms during reviewed speech | reviewed:check |

**→ Do the listener test (section 3) before judging. If it passes, you may say "the person on the call heard it."**

## 1. Physical setup

| Item | Setup |
|---|---|
| **TACIT Mac** (MacBook with notch) | Runs TACIT (notch app + local server + recognizer) **and** Google Meet in Chrome. Meet mic = **BlackHole 16ch**. Meet speaker = Mac speakers at low volume, or headphones. |
| **Listener device** (phone, ideally the iPhone used before) | Joins the same Meet as a guest. **Its mic is muted.** Speaker volume high. A judge holds it during the demo. This is the "other person on the call". |
| **Slides** | A second screen (iPad, second laptop or monitor) shows the PDF or Figma deck. Keep slides off the TACIT Mac so the notch and camera stay free and nothing full-screen covers the notch. |
| **Who talks** | Presenter only. A teammate, if present, advances slides and narrates during the silent part. |
| **Feedback** | TACIT's speech goes only into BlackHole, not the Mac speakers, so the room hears it from the phone. That's the proof. Keep the phone's mic muted so the Mac doesn't play it back. |
| **Light** | Face lit from the front: a lamp or a bright screen behind the camera, no window behind you. An earlier preflight failed on a dim mouth (brightness 74, needs ≥ 90). |
| **Position** | Sit centred, alone in frame, about the distance you used when recording (eyes ~60 cm from the camera). "Only one face, please" appears if a judge leans into frame. |
| **Making the notch visible** | The notch is small. Turn the Mac toward the judges and point at it. Optional: **System Settings → Accessibility → Zoom** (⌥⌘8 toggles it) to magnify the top of the screen. This is a macOS setting, not an app change. Rehearse it once first, or skip it. |
| **Mouse** | Keep the pointer parked near the notch. Close every other app window except Meet. Turn on Do Not Disturb. |

## 2. Product facts you'll use

- **Notch:** "tacit" on the left of the camera cutout; state glyph plus Pause/Stop on the right. Hover → 360×190 Peek.
  Click (or **⌃⇧⌘T**) → 460×350 workspace.
- **Start communicating** (big mint button) turns on the camera and voice output. The notch shows "Mouth a sentence to begin".
- **Review first** is the default. Words appear → **Speak** sends exactly those words. **Edit** lets you correct them.
- **Pause** = camera off. **Stop everything: ⌃⇧⌘.** (Control-Shift-Command-period).
- **Hold my turn:** ⌃⇧⌘H speaks "One moment, I'm responding." (needs voice on).
- **Help Me Respond:** speech-bubble icon in the dock. ⌘2 = Share my view, ⌘↩ = Speak.
- **Critical behaviour:** while Live is capturing, any lip movement that ends a window, including **you talking**, is
  read as a new sentence and replaces the pending review. A selected or edited candidate ignores new movement, but don't
  rely on it. **Stay silent from mouthing until Speak, then Pause before talking.**
- A newer utterance cuts reviewed audio that's still playing. Wait for the speech to finish.
- Changing voice between seeing the words and pressing Speak refuses the message. Press Speak again.

## 3. T-30 min: readiness checks (in order)

1. TACIT notch visible and **not** saying "Connecting…". If it is, macOS may be showing *"TACIT would like to access
   files in your Documents folder"*. Click **Allow**.
2. `cd ~/"Documents/Hackathons/HackUMass 26'" && ./scripts/tacit.sh status`. Server and recognizer should be up.
   (Read-only. Don't run `restart`.)
3. Open Meet on the TACIT Mac (start an instant meeting). **Settings → Audio → Microphone = BlackHole 16ch.**
4. Join from the phone. Mute the phone's mic.
5. Notch → **Start communicating**. Status line should read *"Voice on · a calling app is using BlackHole 16ch"*.
   If it says *"choose BlackHole 16ch"*, step 3 isn't done.
6. **Listener test, typed (5 s):** keyboard icon → type `Testing one two` → Speak. **The phone must play it.**
7. **Listener test, silent (the real thing):** mouth **"How are you doing?"** → words appear → Speak → phone plays it.
   Repeat 3 times and write down the result each time (exact / one word off / nothing). This is your live hit rate in
   *this* room's light.
8. **Stop test:** type a long sentence → Speak → **⌃⇧⌘.** mid-sentence → the phone goes silent.
9. **Gemini (once only):** Help Me Respond → paste the clinic context → Share my view → your point → draft appears.
   Don't Speak it. **Then don't call Gemini again for 2+ minutes** (per-minute quota; 429 seen during evals).
10. **Pause** (camera off). Leave Meet connected. Phone stays on the call, charging if possible.
11. Copy the clinic context to the clipboard (for the 5-minute version).
12. Have the fallback media open but hidden: `~/Documents/TACIT-Film-Production/renders/TACIT_Judging_Cut.mp4`
    (75 s) in QuickTime, paused at 0:00, volume checked.

**Decision after step 7:**
- 3/3 or 2/3 exact (or one-word misses you can Edit) → **Level 1** live demo.
- Mostly wrong, or no words → fix the light and position and retry twice. Still failing → plan **Level 2**.
- Phone heard nothing in step 6 → fix routing first (section 6). Until it's fixed, don't claim call audio.

## 4. The demo click path (Level 1, ~55 s)

| # | Action | Say |
|---|---|---|
| 1 | Hand the phone to a judge | "This phone is the other person on the call. Just listen." |
| 2 | Click notch → **Resume / Start communicating** | — |
| 3 | Face the camera | "Watch my lips." |
| 4 | **Silently** mouth "How are you doing?" | *(nothing)* |
| 5 | Wait ~1–3 s. Words appear. Point at them | *(nothing, or a teammate says "That's what it read. Nothing's been said yet.")* |
| 6a | Exact → tap **Speak** | *(nothing)* |
| 6b | Wrong word → **Edit** → fix → **Speak** | *(nothing)* |
| 7 | Phone plays the sentence. Press **Pause** | "That came from my lips, through my review, into a real call. What did you hear?" |
| 8 | If 6b happened | "It misread one word. That's exactly why nothing is spoken until I approve it." |

**Interactive moment (predictable): the judge picks the sentence.** Hold up a small card (write it by hand) with
sentences that came out exact from the founder's recorded silent clips (bright-test session, unmodified model):

> how are you doing · please turn on the lights · can you call my mother · I don't understand ·
> what time is the appointment · I need help with this · thank you for coming

"Pick one. I'll say it without a sound." → mouth it → review → Speak → the phone plays it. Only offer this if
rehearsal step 7 went well, and only with sentences from the card. Those were exact on *recorded* clips, which
doesn't guarantee live results. **Don't take arbitrary words from judges for lip reading.** For a free-form question
("Does Friday work for you?"), use Help Me Respond (Gemini): it's built for exactly that.

## 5. Fallback ladder (announce every switch, calmly)

**Level 1 → Level 2 trigger:** two silent attempts with no usable words, or the camera/recognizer shows an error.

> "The light in here is fighting the camera. Let me show you the same recognizer on a clip I recorded earlier. This
> input is recorded, not live."

**Level 2: real app, recorded input.** The deployed companion binary replays a genuine silent clip through the
running recognizer, and the words land in the notch exactly as from the camera. This is how the film's review capture
was made. Live must be on (Start communicating):

```sh
cd ~/"Documents/Hackathons/HackUMass 26'"
macos/TacitCompanion/.build/TACIT.app/Contents/MacOS/TacitCompanion --analyze-video --send \
  recognition/data/webcam/20261114T191005Z-bright-test/clip01-.mp4     # "HOW ARE YOU DOING" (exact in the gate)
# clip02-.mp4 = "PLEASE TURN ON THE LIGHTS" (also exact)
```

Prepare this in a Terminal tab before judging (cursor at the end, not run). It was run by an agent in the release gate,
**not yet by a human. Rehearse it once now.** If it doesn't show words in the notch within ~5 s, skip to Level 3. When it
works: review → Speak as normal. Everything after the input is real. Say "recorded input" out loud.

**Level 3: the film.** QuickTime → `TACIT_Judging_Cut.mp4` (75 s; real captures plus a clearly staged
re-enactment, as labelled in the film). Play 0:00–0:40.
> "Here's a recording of the same flow from last night."

**Always also available, no camera needed:** typed speech or a saved phrase → Speak → the phone plays it. This proves
the voice-into-call half live even when lip reading can't run.

## 6. Recovery

| Symptom | Fix |
|---|---|
| Notch says Connecting… | Click **Allow** on the macOS Documents prompt. Wait 5 s. |
| "Voice on · In Google Meet, choose BlackHole 16ch" | Meet → Settings → Audio → Microphone → BlackHole 16ch |
| Phone hears nothing, notch says a calling app is using BlackHole | Phone volume, phone not muted *as a speaker*, Meet tab not muted on the Mac, phone still in the call |
| "Silent speech is reconnecting" | Recognizer restarting, ~8 s. Use typed or phrases meanwhile |
| "Move into view" / "Only one face" | Re-centre, ask the judge to step back slightly |
| "That sentence is no longer available" | Mouth it again, or **Type it instead** (draft kept) |
| Words keep changing while you talk | You're talking with the camera live → **Pause** first |
| Audio going out wrongly | **⌃⇧⌘.** or mute Meet |
| Gemini "The AI request failed" (429) | Press **Try again** once (falls back to a second model). Otherwise move on: "Quota's busy. Here's the no-AI fallback." |
| Whole runtime stuck (last resort, idle only) | `./scripts/tacit.sh restart`, then voice and Live come back **off**. Re-enable deliberately. Costs ~15–30 s |

## 7. Never say

- "It works for everyone", any accuracy number other than the measured ones, "clinically tested", "medical device".
- "The Meet participant heard it", unless the judge just did.
- "Gemini reads lips" or "Gemini listens to the meeting". It does neither.
- That the voice is the user's original voice. It's a chosen macOS voice. A consented ElevenLabs clone path exists in
  code, but it isn't the demo voice.
