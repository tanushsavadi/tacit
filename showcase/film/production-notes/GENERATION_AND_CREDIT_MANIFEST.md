# Generation and credit manifest

## Higgsfield (MCP: connected, authenticated)

| Check | Result (2026-11-15 ~08:06 UTC) |
|---|---|
| `balance` | **10 credits**, plan `ultra` |
| `models_explore unlim:true` (video) | Seedance 2.0 and 2.5 support free-trial unlimited, but `unlim.available: false` for this account via MCP |
| Generations submitted | **None** |
| Credits spent | **0** |
| Uploads | **None** — 3 face stills prepared locally in `face-references/`, upload approved by the user but not performed because nothing could be generated |

The founder cinematic shots (entrance, desk, MacBook hero, introduction, over-the-shoulder, closing) are **not in any cut**.
The films use the founder's real silent-articulation recordings instead. Ready-to-run generation plan once credits exist:
`production-notes/HIGGSFIELD_SHOT_PLAN.md`.

## ElevenLabs (narration)

| Item | Value |
|---|---|
| Account | free tier; 1,930 / 10,000 characters used before this production |
| Voice | "Will – Relaxed Optimist" (`bIHbv24MWmeRgasZH58o`, premade stock voice) |
| Model | `eleven_multilingual_v2`, stability 0.55–0.6 |
| Lines | A01–A13, A06b, D01–D06, J01 (21 requests) |
| Characters | ≈ 3,250 |
| Licensing | Free tier: non-commercial use with attribution — credited on every end card ("Narration: synthetic voice (ElevenLabs)") |

## Local generation (no cost)

- TACIT voice phrases: macOS `say -v Daniel`.
- Score + SFX: ffmpeg `aevalsrc` sine synthesis.
- Motion graphics, typography, diagram, end card: Remotion 4.0.539 (React), rendered locally.
