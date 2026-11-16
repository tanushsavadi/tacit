# TACIT — demo film ("The Sound of Being Heard")

The Devpost demo film was built as code: a [Remotion](https://www.remotion.dev/) (React) project that composes real
product captures, the founder's real silent-speech recordings, synthetic narration and a locally synthesized score,
then renders and loudness-masters three cuts.

| Cut | Length | Where |
|---|---|---|
| Devpost demo (official) | 2:48 | https://youtu.be/GeV55H-ozqw |
| Director's cut | 3:40 | rendered locally, not uploaded |
| Judging cut | 1:15 | rendered locally, not uploaded |

## What's here
| Path | What |
|---|---|
| `remotion/src/` | Compositions for each cut (`devpost.tsx`, `director.tsx`, `judging.tsx`) and shared scenes |
| `remotion/scripts-*.ts` | Generate captions, narration requests and storyboards from the same spec |
| `render-all.sh`, `master.sh` | Render every cut, then master to −16 LUFS / −1.5 dBTP with ffmpeg |
| `captions/` | `.srt` / `.vtt` captions for all three cuts (same cues as the burned-in subtitles) |
| `production-notes/` | Storyboards, narration scripts, feature audit, asset inventory, render verification, sources and licensing |

## Not included
The media in `remotion/public/` (founder face recordings, narration WAVs, score, product captures) and the rendered
MP4s are not in the repository: they are large, and the recordings are personal. To render again, put the assets back
in `remotion/public/` (see `production-notes/ASSET_INVENTORY.md`), then `npm ci && npm run studio`.

Credits and licences: `production-notes/SOURCES_AND_LICENSING.md` (narration: ElevenLabs stock voice, non-commercial
with attribution; score and SFX synthesized with ffmpeg; no AI-generated video or faces).
