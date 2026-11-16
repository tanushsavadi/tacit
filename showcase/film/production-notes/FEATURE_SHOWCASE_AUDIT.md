# TACIT — feature showcase audit (for the films)

Audited 2026-11-15 08:05–08:20 UTC. Sources: `AGENTS.md`, `docs/HANDOFF.md`, `docs/FILM_FEATURE_AUDIT.md`, `docs/RELEASE_RUNBOOK.md`,
`docs/brand/README.md` (on `feat/brand-orb`), companion and server source, `recognition/data/eval/paired/*/results.json`.
Nothing in the TACIT repo, the running app or any branch was modified, merged, rebuilt or redeployed.

## Git state at audit time

| Workstream | Where | State |
|---|---|---|
| Living Notch (subtle compact, hover Peek, click workspace, Stop) | `main` @ `cbb1612` (`302bc0c` + notch-band placement) | **Merged + deployed** (05:29–05:56 UTC) |
| Presence / Help Me Respond (Gemini) | `feat/presence` merged into main via `ae5fb91` | **Merged + deployed** in `cbb1612` |
| Living Signal brand + Living Mark in the notch | `feat/brand-orb` @ `88c49a3` (worktree `../tacit-brand`) | **Not merged, not deployed.** Brand assets used as graphics only |
| Review first / Real-time / Hold my turn / phrases / My Voice / routing | `main` | Merged + deployed |

**Build shown in the films:** `cbb1612` captures (`film-evidence/`) and the Living Notch subtle-revision captures
(`living-notch-evidence/subtle/real-*.jpg`). The Living Mark animation from `feat/brand-orb` is **not** shown as product UI:
it is not in the deployed build. The brand reveal is shown as a brand graphic.

## Ranked showcase (what got airtime)

| Rank | Experience | Access. impact | Credibility (evidence) | Visual | Footage used | Airtime (Devpost) |
|---|---|---|---|---|---|---|
| 1 | **Silent lips → recognized words** | Core promise | Offline evaluator on founder's silent clips: exact on "please turn on the lights", "I would like some water please", "can you call my mother", "I don't understand" (`results.json`); native `--analyze-video --send` exact end to end on recorded clips (HANDOFF) | ★★★ | silent clips + verbatim hypotheses | ~20 s |
| 2 | **Review first → Edit → one-tap Speak** | User stays author | `reviewed:check` 13/13; real captures of Words ready, correction editor, Speaking | ★★★ | `real-review`, `real-edit`, `real-speaking` | ~25 s |
| 3 | **Speaking + Stop + local delivery status** | Immediate control | stop→interrupted 22 ms; delivery stops at BlackHole, no listener | ★★★ | `real-speaking` + Voice → Call mic → Done graphic | ~14 s |
| 4 | **Hold my turn** | Keeps your place | Default phrase "One moment, I'm responding." (`CommunicationSession.swift:38`); unit tests | ★★ | real workspace capture | ~11 s |
| 5 | **Saved phrases + Real-time with warning** | Speed, with explicit consent | SpeakingModeTests; real-time E2E on recorded clips (HANDOFF) | ★★ | offline interface renders (labelled) | ~13 s |
| 6 | **My Voice + Help Me Respond** | Identity; faster turn-taking | `myvoice:check --preview` 10/10; `--presence-check` real Gemini 11/11 | ★★ | offline interface renders (labelled) | ~15 s |

Not featured: recovery/stress (Director's Cut only, as a measured fact: recognizer back in 8 s), AirPods/watch research.

## Claims kept out (and why)

- No accuracy rate: the reliability gate is UNVALIDATED; only verbatim per-clip outputs are shown, including misses (Director's Cut).
- No "the other person heard it": every check stops at the virtual microphone. The delivery graphic is labelled "local output status".
- No live meeting listening: Help Me Respond is shown as working from text the user types or pastes.
- No live-camera claim: recognition shown is from recorded silent clips (labelled).
- The "water → work" native result was **dropped**: that bright-test clip was paired as voiced by the evaluator.
- The offline lab renders still show "no AI connected" for Help Me Respond; the overlay states Gemini drafts wording, which is true of the deployed build (`cbb1612`, 11/11 real Gemini), and the chip labels the render as offline with AI off.

## Missing footage (would need a human, not automatable)

Screen recordings of the live notch (pointer + clicks need Accessibility permission the agent doesn't have), live-camera
recognition with a person, Help Me Respond / My Voice inside the real deployed notch, a Meet listener hearing TACIT.
