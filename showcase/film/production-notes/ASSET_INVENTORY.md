# Asset inventory

Measured 2026-11-15T08:22Z with ffprobe/sips. Originals were **copied**, never modified. Nothing here was uploaded to any external service.

## Founder silent-articulation recordings used in the films

Source: `recognition/data/webcam/` (git-ignored, local only). All are video-only files: **no audio track exists**. Face and lips visible in every clip. Consent: the founder's own recordings, used in the founder's own film at their request.

| Film file | Original | Duration | Resolution | fps | Reference sentence | Recognition evidence | Use |
|---|---|---|---|---|---|---|---|
| silent_lights.mp4 | `20261114T191005Z-bright-test/free03-silent.mp4` | 5.50s | 1280×720 | 29.97 | please turn on the lights | Offline evaluator: PLEASE TURN ON THE LIGHTS, 0/5 errors | hero recognition shot (all cuts) |
| silent_water.mp4 | `20261114T191005Z-bright-test/free02-silent.mp4` | 5.50s | 1280×720 | 29.97 | I would like some water please | Offline evaluator: exact, 0/6 | question / fail-safely backgrounds; results board |
| silent_understand.mp4 | `20261114T191005Z-bright-test/free01-silent.mp4` | 5.50s | 1280×720 | 29.97 | I don't understand | Offline evaluator: exact, 0/3 | honesty scene background; results board |
| silent_howareyou.mp4 | `20261114T185152Z-s1/clip07-silent.mp4` | 5.50s | 1280×720 | 29.97 | how are you doing | Offline evaluator: HOW ARE YOU GOING, 1/4 errors | correction example (all cuts) |
| silent_mother.mp4 | `20261114T185152Z-s1/clip20-silent.mp4` | 5.50s | 1280×720 | 29.97 | can you call my mother | Offline evaluator: exact, 0/5 | context background; mouth push-in |
| silent_cake.mp4 | `20261115T000409Z-adaptVal/clip01-silent.mp4` | 6.00s | 1280×720 | 29.97 | I would love a slice of cake | none used | cold open; origin scene |

Other sessions inventoried but not used: adaptA (50 silent), adaptB (31 silent), adaptBretake, diag1 (5 silent/5 voiced pairs), s1 18:45 (3 silent/9 voiced), heldout1 (manifest only). Voiced clips were deliberately excluded so nothing voiced is shown as silent.

## Real TACIT product captures

| File | Size (px) | Source | Provenance |
|---|---|---|---|
| `subtle/real-compact.jpg` | 528×76 | `macos/TacitCompanion/.build/{film-evidence,living-notch-evidence}` | Real native capture (build cbb1612 / Living Notch subtle revision). Recognition from a genuine silent recording via the live recognizer; speech after explicit Speak, rendered at BlackHole with zero listeners. |
| `subtle/real-review.jpg` | 720×380 | `macos/TacitCompanion/.build/{film-evidence,living-notch-evidence}` | Real native capture (build cbb1612 / Living Notch subtle revision). Recognition from a genuine silent recording via the live recognizer; speech after explicit Speak, rendered at BlackHole with zero listeners. |
| `subtle/real-speaking.jpg` | 720×380 | `macos/TacitCompanion/.build/{film-evidence,living-notch-evidence}` | Real native capture (build cbb1612 / Living Notch subtle revision). Recognition from a genuine silent recording via the live recognizer; speech after explicit Speak, rendered at BlackHole with zero listeners. |
| `lab-and-real-notch/real-edit.png` | 920×736 | `macos/TacitCompanion/.build/{film-evidence,living-notch-evidence}` | Real native capture (build cbb1612 / Living Notch subtle revision). Recognition from a genuine silent recording via the live recognizer; speech after explicit Speak, rendered at BlackHole with zero listeners. |
| `03-expanded-home.png` | 920×700 | `macos/TacitCompanion/.build/{film-evidence,living-notch-evidence}` | Real native capture (build cbb1612 / Living Notch subtle revision). Recognition from a genuine silent recording via the live recognizer; speech after explicit Speak, rendered at BlackHole with zero listeners. |
| `01-compact-in-notch-context.png` | 1024×80 | `macos/TacitCompanion/.build/{film-evidence,living-notch-evidence}` | Real native capture (build cbb1612 / Living Notch subtle revision). Recognition from a genuine silent recording via the live recognizer; speech after explicit Speak, rendered at BlackHole with zero listeners. |
| `06-speech-complete.png` | 720×380 | `macos/TacitCompanion/.build/{film-evidence,living-notch-evidence}` | Real native capture (build cbb1612 / Living Notch subtle revision). Recognition from a genuine silent recording via the live recognizer; speech after explicit Speak, rendered at BlackHole with zero listeners. |
| `lab-and-real-notch/phrases.png` | 920×736 | ExperienceLab offline render | **INTERFACE RENDER** — app's own SwiftUI view with fixture data, visibly labelled OFFLINE; no camera/server/audio. Labelled as such on screen. |
| `lab-and-real-notch/voice.png` | 920×736 | ExperienceLab offline render | **INTERFACE RENDER** — app's own SwiftUI view with fixture data, visibly labelled OFFLINE; no camera/server/audio. Labelled as such on screen. |
| `lab-and-real-notch/assistance.png` | 920×736 | ExperienceLab offline render | **INTERFACE RENDER** — app's own SwiftUI view with fixture data, visibly labelled OFFLINE; no camera/server/audio. Labelled as such on screen. |
| `lab-and-real-notch/realtime-confirm.png` | 920×736 | ExperienceLab offline render | **INTERFACE RENDER** — app's own SwiftUI view with fixture data, visibly labelled OFFLINE; no camera/server/audio. Labelled as such on screen. |

## Brand assets (branch `feat/brand-orb`, worktree `../tacit-brand`, commit 88c49a3 — NOT merged/deployed)

- `tacit-logo-reveal-1080p.mp4` — 1920,1080 4.500000
- `tacit-notch-states-offline.mp4` — 920,720 15.000000
- `tacit-speaking-loop-720.mp4` — 720,720 10.400000
- `svg/tacit-wordmark.svg`, `svg/tacit-mark.svg`, `svg/tacit-lockup.svg`, title cards, state stills. The end-card mark is re-drawn in code from the same 24-unit geometry (r 7.25, stroke 2.2, gaps 2×24°, dot r 2.45).

## Audio

- Narration: `voiceover/A01–A13, A06b, D01–D06, J01` (.mp3 originals + 48 kHz .wav), ElevenLabs stock voice “Will – Relaxed Optimist”, model eleven_multilingual_v2. A06 (the “water → work” line) was generated but **not used**: that example came from a clip paired as voiced.
- TACIT voice phrases: `music-sfx/tv_*.wav` rendered locally with macOS `say -v Daniel` — the system voice TACIT routes by default (`server/src/tts.ts`, My Voice check restored Daniel). Re-rendered for the film, not recorded from a call.
- Score: `music-sfx/score_pad.wav`, original, synthesized with ffmpeg sine oscillators (no samples). SFX `sfx_tick.wav`, `sfx_speak.wav` also synthesized.

## Face references for Higgsfield (prepared, NOT uploaded)

- `face-references/ref1_denim_front.png` — 1280×720 frame, neutral expression, own face only
- `face-references/ref2_white_tee_bright.png` — 1280×720 frame, neutral expression, own face only
- `face-references/ref3_white_tee_bright_b.png` — 1280×720 frame, neutral expression, own face only
