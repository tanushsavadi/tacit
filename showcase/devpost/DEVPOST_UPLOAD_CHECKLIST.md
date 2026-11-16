# TACIT — Devpost upload checklist

Prepared 2026-11-15 ~11:00 UTC. Deadline per the hackumass.com schedule: **9:00 AM EST (14:00 UTC), Sun Nov 15.**
Folder: `showcase/devpost/`

## ✅ Blockers resolved (2026-11-15 ~11:05 UTC)
1. GitHub repo **PUBLIC**: https://github.com/tanushsavadi/tacit (verified signed out: HTTP 200, API `visibility: public`).
2. YouTube link **VERIFIED**: https://youtu.be/GeV55H-ozqw (embeddable via oEmbed; 168 s = the 2:48 cut).

## 1–4. Gallery: exact upload order
All files are PNG, RGB, 1800×1200 (exactly 3:2), each between 0.9 and 1.5 MB (limit 5 MB). Decoded with Pillow and checked visually.

| # | File (absolute path) | Size | What it shows |
|---|---|---|---|
| 1 | `showcase/devpost/gallery/01_TACIT_Hero.png` | 1800×1200 · 979 KB | Living Signal lockup and "Your words. Your voice. Beyond speech." beside real notch captures: words waiting for review, then Speaking after Speak. |
| 2 | `showcase/devpost/gallery/02_Silent_To_Voice.png` | 1800×1200 · 1.48 MB | Four steps (silent articulation → visual recognition → review → chosen voice), built on the founder's real silent clip "please turn on the lights" and its verbatim, exact output. |
| 3 | `showcase/devpost/gallery/03_Review_First.png` | 1800×1200 · 996 KB | "Your words. Your decision.": the real Words ready card and the real correction editor, with numbered guarantees. |
| 4 | `showcase/devpost/gallery/04_Living_Notch.png` | 1800×1200 · 1.21 MB | Real captures of the Compact notch band, the hover Peek and the expanded workspace. |
| 5 | `showcase/devpost/gallery/05_My_Voice.png` | 1800×1200 · 908 KB | The app's own My Voice screen (offline render, the UI says OFFLINE): choose, preview and tune an installed macOS voice. |
| 6 | `showcase/devpost/gallery/06_Hold_My_Turn.png` | 1800×1200 · 1.08 MB | The real Hold my turn button, the default hold phrase "One moment, I'm responding." and the saved-phrases panel (offline render). |
| 7 | `showcase/devpost/gallery/07_Help_Me_Respond.png` | 1800×1200 · 1.03 MB | Help Me Respond in three steps (they said → your point → editable wording → Speak). These are the app's own views, rendered offline with SAMPLE context and fixture wording, labelled as not live AI output. |
| 8 | `showcase/devpost/gallery/08_Technical_Architecture.png` | 1800×1200 · 1.30 MB | Architecture: Mac camera → Apple Vision lip tracking → Auto-AVSR → you approve → voice → BlackHole virtual mic. Every element was checked against the repo; no metrics are shown. |
| 9 | `showcase/devpost/gallery/09_Real_Recognition_Results.png` | 1800×1200 · 1.37 MB | Five verbatim outputs on real silent clips: four exact and one miss (HOW ARE YOU GOING), labelled as hand-picked and not an accuracy rate. |
| 10 | `showcase/devpost/gallery/10_Review_vs_Realtime.png` | 1800×1200 · 971 KB | Review first (the default, real capture) next to the opt-in Real-time warning (offline render, amber). |

8 required images and 2 optional ones. 09 and 10 earn their place because they show honesty and user control. If you want exactly 8, drop 10, then 09.
Contact sheet: `showcase/devpost/submission-notes/CONTACT_SHEET_Gallery.png`

## 5. Video thumbnail
`showcase/devpost/thumbnail/TACIT_Video_Thumbnail_1280x720.png`: 1280×720 (16:9), 938 KB (YouTube's limit is 2 MB).
It shows a real frame of the founder silently mouthing, the real recognized output "PLEASE TURN ON THE LIGHTS" from that same clip, and the lockup with "Turning silent articulation into speech."
Social preview: `showcase/devpost/social/TACIT_Social_Preview_1200x630.png` (1200×630, 418 KB).
Preview sheet: `submission-notes/CONTACT_SHEET_Thumbnail_Social.png`.

## 6. Official video
`~/Documents/TACIT-Film-Production/renders/TACIT_Devpost_Demo_2m48s.mp4`: 168.0 s, 1920×1080, H.264/AAC, 41.8 MB. Captions are in `captions/TACIT_Devpost_Demo_2m48s.srt`.

## 7. YouTube link
https://youtu.be/GeV55H-ozqw — verified: embeddable (oEmbed OK), title "tacit", length 168 s (matches the 2:48 Devpost cut). Optional: set the custom thumbnail and upload the .srt captions in YouTube Studio (`submission-notes/YOUTUBE_UPLOAD.md`).

## 8. GitHub
`https://github.com/tanushsavadi/tacit`: **PUBLIC** (made public and verified 2026-11-15 ~11:05 UTC).

## Authenticity and privacy record
- **Real captures:** real-review, real-speaking, real-edit, compact-in-notch, expanded-home. These are native macOS app captures (build `cbb1612` / Living Notch subtle revision). The recognized words came from a genuine silent recording through the live recognizer. Speech went to BlackHole with no listener.
- **Interface renders:** My Voice, saved phrases, Real-time confirmation and Help Me Respond. These are the app's own SwiftUI views with fixture data, and each image says so in its caption. The UI itself also reads OFFLINE, SAMPLE or OFFLINE FIXTURE. The Help Me Respond renders came from the shipped binary's `--render-presence` mode, run offline from a copy. The running app and server were not touched.
- **Recognition text** is verbatim from `recognition/data/eval/paired/*/results.json`. Each face frame comes from the same clip as the words it sits next to.
- **Not shown:** the Living Signal mark on the right side of the notch. It lives only on the unmerged `feat/brand-orb` branch and isn't in the shipped build, so it wasn't shown as product UI. The brand appears as the lockup and graphics only.
- **Faces:** only the founder's own face, already used in the public film. No other people, no stock photos, no AI-generated imagery. No Higgsfield credits were spent.
- **Private data:** captures were cropped to avoid terminal text. The only visible system UI is a menu-bar strip (the "Help" menu and status icons). No tokens, keys, emails or file paths appear.
- **Claims avoided:** accuracy rates, latency figures, "the other person heard it", live meeting listening, and recreating a natural voice.

## Remaining manual steps (in order)
1. Devpost: paste `https://youtu.be/GeV55H-ozqw` as the Video demo link; add `https://github.com/tanushsavadi/tacit` under "Try it out".
2. Upload gallery images 01→10 in the order above.
3. Optional (YouTube Studio): custom thumbnail `thumbnail/TACIT_Video_Thumbnail_1280x720.png`, captions `captions/TACIT_Devpost_Demo_2m48s.srt`, and replace "[GitHub link once public]" in the description with the repo URL.
4. Preview the Devpost page logged out — video embeds, gallery order correct — then submit before 9:00 AM EST.

Sources for these images are in `source/` (Remotion stills; `npx remotion still src/index.ts g01 out.png --public-dir=public`).
