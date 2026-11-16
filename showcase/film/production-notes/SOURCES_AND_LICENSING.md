# Sources and licensing

| Element | Source | Licence / permission |
|---|---|---|
| Founder silent clips | Founder's own recordings (`recognition/data/webcam/`) | Founder's consent, given in this production request; kept local |
| TACIT UI captures and renders | TACIT app (own project) | Own work |
| TACIT brand (mark, wordmark, reveal MP4) | `docs/brand/` on `feat/brand-orb` | Own work; custom vectors, no font licence needed |
| Typography in the films | Apple system font (SF Pro) via the local renderer | Used on macOS for the project's own film; swap for Inter if the film is distributed commercially |
| Narration | ElevenLabs stock voice "Will" (free tier) | Non-commercial with attribution; credited on end cards. A paid plan is needed for commercial use |
| TACIT voice phrases | macOS `say` voice "Daniel" | Apple system voice, used to show the app's own output voice |
| Score and SFX | Synthesized locally with ffmpeg | Original, no third-party samples |
| Recognition model named on screen | Auto-AVSR (LRS3 visual-only weights) | Research/non-commercial licence (`recognition/tacit_vsr/config.py`) — stated in credits |
| Remotion 4.0.539 | npm | Remotion licence: free for individuals and small teams (≤3 people); company licence needed above that |
| Higgsfield | — | Not used (no generations) |

## AI-content disclosure

Narration is synthetic and credited. No AI-generated video, faces or product footage appears in any cut. If Higgsfield
shots are added later, each must carry an on-screen "AI-generated" label, and the Devpost description should say so.
