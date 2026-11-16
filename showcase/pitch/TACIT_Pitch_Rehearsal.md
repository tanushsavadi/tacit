# TACIT — rehearsal & acceptance checklist

Judging starts **12:30 PM EST**. Work backwards: rehearsal block 11:15–12:15, setup locked by 12:20.

## Exact phrases
| Use | Phrase | Why |
|---|---|---|
| Cold open (no recognition needed) | **"How are you doing?"** (mouthed, silent) | Ordinary, conversational; paid off in the demo |
| Live demo | **"How are you doing?"** | Exact in the release gate (`--analyze-video --send`, bright-test clip01) |
| Backup demo phrase | **"Please turn on the lights"** | Exact in the gate and in the offline evaluator |
| Judge's card (pick one) | how are you doing · please turn on the lights · can you call my mother · I don't understand · what time is the appointment · I need help with this · thank you for coming | All exact on recorded clips (bright-test) |
| Gemini context (clipboard) | `Hi, this is Dr. Lee's office calling about your follow-up. We can do Friday at 3, or keep you on Monday at 9. Which works better for you?` | Proven in the live probe |
| Gemini point (type) | `friday, monday mornings are hard for me` | Proven; avoid "I need an afternoon slot" (Friday at 3 *is* afternoon) |

## Expected product state at 12:25
- [ ] Notch shows **tacit** in the notch band; not "Connecting…"
- [ ] Meet open on the TACIT Mac, mic = **BlackHole 16ch**; phone joined, phone mic muted, volume up
- [ ] Notch status: *"Voice on · a calling app is using BlackHole 16ch"*
- [ ] **Paused** (camera off) until the demo starts. Review first selected (not Real-time)
- [ ] Voice = the one you rehearsed with (don't change voices during judging)
- [ ] Clipboard holds the Gemini context; Gemini **not** called in the last 2 minutes
- [ ] Terminal tab ready with the Level 2 command (not run); QuickTime has `TACIT_Judging_Cut.mp4` paused at 0:00
- [ ] Slides on the second screen, on slide 00 (black). Presenter view or printed script nearby
- [ ] Do Not Disturb on; other apps closed; Mac charging; phone charging

## Audio readiness (each must pass in the last 30 minutes)
1. Typed "Testing one two" → Speak → **phone plays it**. ☐
2. Mouth "How are you doing?" ×3 → record: ☐ exact ☐ exact ☐ exact (or one-word misses you can Edit)
3. Long typed sentence → Speak → ⌃⇧⌘. mid-sentence → **phone goes silent**. ☐
4. Help Me Respond once → draft appears → don't Speak it. ☐
5. Level 2 command once → words appear in the notch. ☐ (If it fails, Level 2 is struck; go straight to Level 3)
6. QuickTime plays the film with sound through the speakers you'll use. ☐

**If check 1 fails, don't claim call audio.** Fix the routing (runbook §6) or present the voice locally and say so.

## Physical presentation setup
- TACIT Mac angled toward the judges; you sit centred in the camera with a lamp in front, no window behind you.
- Second screen with slides beside it, at the judges' eye line.
- Phone on the table next to the judges, ready to hand over.
- A handwritten phrase card for the judge-pick moment.
- Optional macOS Zoom (⌥⌘8) rehearsed once to magnify the notch. If it's fiddly, skip it.

## Duration of each section (3-minute version)
| Section | Target | Hard cap |
|---|---|---|
| 00 Cold open | 0:00–0:06 | 0:08 |
| 01 Silence | –0:20 | 0:22 |
| 02 Need | –0:45 | 0:50 |
| 03 TACIT | –1:10 | 1:15 |
| 04 Demo | –2:05 | 2:15 |
| 05 How it's built | –2:30 | 2:40 |
| 06 Takeaway | –2:55 | 3:05 |

Rehearse three full runs with a timer: (1) everything goes right; (2) the demo needs an Edit; (3) the camera fails
→ Level 2 or 3. Time each.

## Recovery after a failed recognition
1. Stay silent. Mouth it once more, slower, lips fuller.
2. Still wrong but close → **Edit**, fix it, **Speak**, then: "It misread a word. That's exactly why I approve
   everything."
3. Nothing at all twice → **Pause**, then: "The light here is fighting the camera. Let me show the same recognizer on a
   recorded clip, and I'll tell you it's recorded." → Level 2, or Level 3 (film 0:00–0:40).
4. Always offer the no-camera proof: typed text or a saved phrase → Speak → the phone plays it.

## Recovery after Gemini 429 / failure
1. Press **Try again** once. It falls back to the second model.
2. Still failing: "The API quota is busy. Here's the fallback: TACIT tells you no AI is connected and you write it
   yourself." Type a short reply → Speak. Move on. Don't retry repeatedly.
3. Show slide A3's metrics instead.

## Switching to backup media
- ⌘-Tab to QuickTime → Space to play → stop at 0:40 → ⌘-Tab back. Say "recording" *before* pressing play.
- Never let the film run unannounced, and never call it live.

## Best closing statement (memorise exactly)
> We aren't trying to decide what someone should say. We're trying to give them another way to be heard.

Then stop talking. Count to two. "Happy to show anything again."

## Presentation handoff
- If a teammate presents: they own this file, the runbook and the 3-minute script. The Mac operator stays silent while
  the camera is live.
- Leave on the table: phone (in the call), phrase card, and the PDF open at slide 06 for judges walking up mid-way.
- After each judge: **Pause**, check the notch is still connected, wait 2 minutes before the next Gemini call, and reset
  slides to 00.
- Between judges, every ~20 minutes: re-run audio check 1 (typed → phone).
