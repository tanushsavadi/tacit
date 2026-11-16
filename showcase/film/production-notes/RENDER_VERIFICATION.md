# Render verification report

Final renders 2026-11-15 08:36–08:42 UTC (Judging Cut 08:23). Checked on the exported MP4s, not the edit code.

| File | Duration | Video | Audio | Loudness | Black frames | Decode errors |
|---|---|---|---|---|---|---|
| `TACIT_Devpost_Demo_2m48s.mp4` (41.8 MB) | **168.000 s** (under 3:00) | H.264 High, 1920×1080, 30 fps, yuv420p | AAC-LC 48 kHz stereo 256k | −16.2 LUFS, −1.5 dBTP | 0 | 0 |
| `TACIT_Directors_Cut_3m40s.mp4` (54.3 MB) | 220.1 s | same | same | −16.1 LUFS, −1.5 dBTP | 0 | 0 |
| `TACIT_Judging_Cut.mp4` (15.1 MB) | 75.1 s | same | same | −16.2 LUFS, −1.4 dBTP | 0 | 0 |

All files: `+faststart` (web-playable), mastered by two-pass loudnorm (video stream copied untouched).

## Checks performed

- **Freeze detection** (`freezedetect`, 2.5 s): only intended holds — end-card lockups, the Director's Cut results card
  under narration (4 s) and a dim, blurred context background (2.6 s).
- **Silence detection** (−50 dB, 1.5 s): only 0–6.8 s, the intentional silent opening.
- **Frame inspection**: 30+ frames across the three films viewed as contact sheets. Defects found and fixed:
  1. a white colour-key had erased white UI text in the real captures → replaced by a border-only flood fill;
  2. a provenance label wrapped vertically and used a serif fallback → fixed width and font;
  3. labels and the Help Me Respond caption overlapped captures → backed pills, adjusted framing;
  4. overlay text on bright blinds was low-contrast → gradient backdrop;
  5. raw mix at −23.4 LUFS was too quiet for web → mastered to −16 LUFS.
- **Captions**: `captions/*.srt|vtt` are generated from the same cue function as the burned-in subtitles (51 / 69 / 25 cues);
  text is the exact narration script; timing is proportional within each measured line (±0.5 s within a line).

## Not verified / limitations

- Audio was verified by measurement (loudness, silence map, event schedule) — **no human listening pass** was possible.
  Please watch once with sound before submitting.
- Caption timing within a line is estimated by character count, not forced-aligned.
- **No Higgsfield founder footage** (10 credits; MCP unlimited unavailable). No AI-generated video in any cut.
- **No live screen recordings**: notch shots are real still captures animated with camera moves; Phrases, Real-time,
  My Voice and Help Me Respond are **offline renders** of the app's own views (labelled on screen; they show "OFFLINE").
- Recognition shown comes from **recorded** silent clips (offline evaluator + the native pipeline), not live camera.
- The TACIT voice lines were re-rendered with the same macOS voice (Daniel), not recorded from a call.
- No remote-listener (Meet) audibility is claimed or shown; delivery stops at the virtual microphone.
- Living Mark brand animation (`feat/brand-orb`) is not merged/deployed; it appears only as brand motion, never as app UI.
- HackUMass video rules (length, hosting, AI disclosure) could not be read: Devpost returned 403. The hackumass.com
  schedule lists **9:00 AM EST** final submission; the user recalls 10 AM. Treat 9:00 AM as the deadline.
- Security (from HANDOFF, not part of film work): the exposed AWS key still needs an authorized human to confirm
  deletion/rotation in IAM and review CloudTrail. Nothing in these films contains keys, tokens or env values.
