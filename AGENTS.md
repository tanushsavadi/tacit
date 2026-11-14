# TACIT — agent instructions (canonical, all models)

TACIT ("Your voice. Beyond speech.") is a HackUMass XIV project: an AAC calling assistant for people who
cannot speak aloud. Core loop:

**caller speaks → transcription → 3 contextual reply candidates → user selects (mouth/webcam, head, tap)
→ user explicitly confirms → TTS (personal voice when authorized) → remote caller hears it.**

**Direction (user, 2026-11-14): Mode 2 only — silent speech → the user's own voice, not an AI-reply selector.** The
candidate loop above is existing infrastructure; see docs/HANDOFF.md for the sensing experiments.

## Non-negotiable product rules
- Nothing is ever spoken without an explicit confirmation of the proposal currently on screen
  (enforced in `server/src/controller.ts`, covered by `controller.test.ts`). Never bypass the controller.
- Stale results (old candidate set / old proposal / ended call) are dropped, never spoken.
- Personal-voice cloning only with the user's own, consented voice sample (`ELEVENLABS_VOICE_CONSENT=self`).
- Never substitute another voice for the personal voice, or pre-generate personal-voice audio before confirmation,
  without the user's explicit session choice (`set_voice_policy`). Substituted audio must be labelled.
- Never label mocked/simulated/heuristic output as real. Simulated calls and non-LLM candidates must be
  visibly labelled in the UI and in `model`/`transport` fields.
- No claims that a live call works unless the remote participant actually heard audio; no claims of
  visual phrase recognition without real facial-motion evidence.

## Layout
| Path | Role |
|---|---|
| `shared/protocol.ts` | Types shared by server + web (Snapshot, ClientMessage, ServerMessage). Keep stable; change both sides together. |
| `server/` | Node/TS. `controller.ts` state machine (authoritative); `index.ts` HTTP+WS :8790; `candidates.ts` Gemini/local; `tts.ts` ElevenLabs/`say`; `stt.ts` segmenter + whisper.cpp; `calls.ts` browser-ws + simulated; `twilio.ts` PSTN Media Streams. |
| `web/` | Vite + React UI on :5173 (proxies `/ws`, `/api` to :8790). `/` = TACIT user, `/#caller` = remote caller page. |
| `voice/` | Previous session's gateway attempt. Only `src/audio/*` (μ-law/PCM/WAV) is used, imported by `server/`. Rest abandoned. |
| `recognition/` | Python Auto-AVSR scorer (`tacit_vsr/engine.py`). **Not wired / not verified.** |
| `airpods/` | Swift `TacitAirPods.app` motion probe (research). Silent-word recognition was NO-GO — `docs/research/AIRPODS_SILENT_SPEECH.md`. |
| `third_party/` | Cloned reference repos. Read-only; do not edit. |
| `docs/HANDOFF.md` | Current state — read first, update last. |

## Commands (verified — see docs/HANDOFF.md for evidence)
```
cd server && npm install && npm run typecheck && npm test   # vitest (controller, segmenter, signature)
cd server && npm start                                       # :8790
cd server && npm run smoke        # e2e browser-ws call (server running, no active call)
cd server && npm run twilio:sim   # e2e Twilio Media Streams protocol simulator (real audio + whisper)
cd server && npm run links        # private user/caller URLs (auth is required on /ws and /ws/caller)
cd server && npm run security:check  # live auth checks — must pass before any public exposure
cd server && npm run gemini:probe # real Gemini latency/errors per model
cd server && npm run twilio:preflight / voice:check / bench:stt   # real-call readiness, ElevenLabs check, STT benchmark
airpods/tools/build-app.sh && airpods/tools/check.sh; cd server && npm run airpods:record|analyze|gate2   # AirPods research
cd server && npm run tunnel       # PUBLIC exposure — only with explicit user authorization (see HANDOFF preflight)
cd web && npm install && npm run dev                         # :5173 (frontend owner)
```
Env: `server/.env` (git-ignored; template `server/.env.example`). Never print or commit keys.
STT model: `server/models/ggml-base.en.bin` (git-ignored, 141 MB; re-download from huggingface ggerganov/whisper.cpp).

## Conventions
- TypeScript strict, ESM, `.ts` import extensions, relative imports into `shared/`.
- Add a test for any controller behaviour change. Prefer small files; no new frameworks without need.
- Record real timestamps (epoch ms) in `TurnTimestamps`; never synthesize timings.
- Secrets only via env / `server/data/secrets.json` (0600); never log tokens, keys or request URLs.
- Persistent logging is opt-in (default off); never add new on-disk storage of conversation content without consent.

## Git (user authorization, 2026-11-14)
- Authorized: atomic commits and a **private** GitHub remote. **Claude is the sole Git writer** while Sol edits
  `web/`; other agents (Sol/Codex/Gemini) do not run git write commands.
- Never commit files another agent is actively editing: `web/**` is committed only at a checkpoint Sol records as
  stable in `docs/WORKSTREAM_SOL.md`.
- Atomic = one logical change per commit, message `area: what changed` (+ why when not obvious). Typecheck/tests for the
  touched area pass before committing.
- Before every commit: `git status` + `git diff --cached --stat`; never stage secrets (`.env`, `server/data/secrets.json`),
  recorded personal data (`*/data/`), model weights, `third_party/` or `node_modules/` (see root `.gitignore`).
- Forbidden without new explicit permission: force-push, history rewrite (rebase/amend of pushed commits, reset
  --hard, filter-branch), deleting branches/tags, making the repository public, adding collaborators.
- Never delete or overwrite existing work without inspecting it.

## Session protocol (every model)
1. Start: read `AGENTS.md`, then `docs/HANDOFF.md`; inspect relevant source; run typecheck/tests.
2. Work one milestone at a time; test real behaviour; keep shared interfaces stable; avoid subagents
   unless narrowly scoped with explicit file ownership and these git rules.
3. Before ending/switching: update `docs/HANDOFF.md` (what changed, files, tests run + results, failures,
   blockers, next exact task). No transcripts or internal reasoning in project files.
4. Respect the file-ownership table below; never edit, format or regenerate files you do not own.

## Current two-agent ownership (since 2026-11-14)
| Owner | Files |
|---|---|
| **Claude (backend + integration lead)** | `server/**`, `shared/protocol.ts`, `voice/**`, root manifests, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `docs/HANDOFF.md` |
| **GPT-6 Sol / Codex (frontend + webcam/vision)** | `web/**` (UI, caller page, MediaPipe/webcam), `docs/WORKSTREAM_SOL.md` |
| Unassigned (ask first) | `recognition/**` (`airpods/**`: Claude, research, concluded) |
- Protocol changes: only the backend owner edits `shared/protocol.ts`; changes stay additive/backward compatible and are
  announced in `docs/HANDOFF.md` → "Interface contract" before anyone depends on them. Frontend requests go there too.
- No broad formatting/cleanup runs. No worktrees/branches (git is forbidden).
