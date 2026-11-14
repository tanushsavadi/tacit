# TACIT — progress

> **Superseded:** current state lives in `docs/HANDOFF.md`; standing rules in `AGENTS.md`. Kept for history.

Last updated: 2026-11-13 (session 1, cut short by a usage limit).
Rule: **no git commits, pushes, tags or `git init`** until the user authorizes them. The project directory is not a git repository.

## Layout and ownership

| Path | What | State |
|---|---|---|
| `shared/protocol.ts` | Types shared by server and web: phases, snapshot, turn timestamps, client/server messages | Written |
| `server/` | Node + TS controller (state machine), Gemini candidates, telemetry, WS to web | Controller + tests only |
| `web/` | React/Vite UI, MediaPipe mouth-activity, clip recording | Not started (empty dir) |
| `recognition/` | Python service on 127.0.0.1:8765 (`/health`, `/rank`, `/distinguishability`) + live trial harness | Subagent work in progress — see `docs/research/visual.md` |
| `voice/` | Node + TS call gateway library (Twilio Media Streams, browser fallback, STT, TTS) | Subagent work in progress — see `docs/research/voice.md` |
| `airpods/` | Swift CLI `tacit-airpods` emitting NDJSON status/motion/gesture events | Subagent work in progress — see `docs/research/airpods.md` |
| `docs/research/landscape.md` | AAC prior art, HackUMass XIV prizes/rules, hackathon-repo practices | Subagent work in progress |

Planned ports: web 5173, server 8790, voice gateway 8787, recognition 8765.

## Verified

- `server/src/controller.ts`: conversation state machine. `cd server && npx vitest run` → 22 tests pass; `npx tsc --noEmit` clean.
  Covered: no speech without confirmation of the on-screen proposal, nod time guard, stale candidate-set and stale-proposal rejection, no double speech, cancel during speech, call-end isolation, second-call rejection, timestamp ordering, no playback ack claimed unless the transport provides one.

## Not verified / not built

- Nothing has run against a real provider, a real call, the webcam, or AirPods yet.
- Subagent deliverables in `recognition/`, `voice/`, `airpods/` have not been reviewed or run by the lead. Treat their READMEs as claims until re-run.
- No credentials exist in the environment. Needed: a Gemini API key, plus whatever `docs/research/voice.md` / `.env.example` lists (expected: ElevenLabs and Twilio).

## Next steps, in order

1. Read the four `docs/research/*.md` files and re-run each subagent's own verification commands.
2. `server/src/candidates/gemini.ts`: one structured-output call returning 3 intents × 3 phrasings (`responseMimeType: 'application/json'` + `responseJsonSchema`, SDK `@google/genai` 3.3.0). Model id from `GEMINI_MODEL`, else pick the newest flash-lite via `ai.models.list()` — current model ids were not confirmed.
3. `server/src/candidates/select.ts`: choose one phrasing per intent maximizing the minimum pairwise distance from the recognition service's `/distinguishability`; baseline = first phrasing of each intent. This is the baseline-vs-viseme-aware experiment.
4. `server/src/index.ts`: HTTP + WS, proxy `/api/rank` to the recognition service, import `../voice/src/index.ts`, spawn the AirPods helper, write turn records to `server/data/turns.jsonl`. Include a clearly labelled simulated call for development.
5. `web/`: main UI and diagnostics panel; mouth onset/offset detection with MediaPipe; send the clip with `startMs`/`endMs`.
6. Gates with the human: live silent-mouthing trials (Gate A), a real remote call (Gate B), AirPods calibration (Gate D).
7. Remaining docs: `CLAUDE.md`, `README.md`, `DECISIONS.md`, `EXPERIMENTS.md`, `BENCHMARKS.md`, `DEMO.md`, `THIRD_PARTY_NOTICES.md`.
