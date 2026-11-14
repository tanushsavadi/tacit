# TACIT — agent instructions (canonical, all models)

TACIT ("Your voice. Beyond speech.") is a HackUMass XIV project: assistive communication for people who cannot
speak aloud. **TACIT is Mode 2 only: silent speech → voice.**

**User silently articulates their own words → visual speech recognition transcribes them → TACIT speaks the
recognized words in an authorized synthesized voice → the remote caller hears them.**

- Not an AI-reply selector: the Gemini three-candidate loop in `server/` is legacy infrastructure, not the product.
- Intended interaction: continuous **Live Silent Speech** mode. The user enables Live once per session and always has
  immediate pause / mute / stop. No mandatory per-utterance confirmation in that experience.
- **Automatic transmission of recognized speech stays disabled until a recognition reliability gate is supported by
  real measurements** (held-out silent recordings: WER, abstention, incorrect-transmission rate, non-speech false
  triggers). Until then recognized text is shown to the user only.
- Camera-based visual speech recognition (`recognition/`) is the current priority. AirPods jaw-motion sensing is
  experimental and has **not** demonstrated reliable word recognition (`docs/research/AIRPODS_SILENT_SPEECH.md`).

## Non-negotiable product rules
- Nothing reaches the remote caller unless the user has authorized speech for this session (Live enabled, not
  paused/stopped) and, for recognized speech, the measured reliability gate passes. Pause/stop must cancel queued and
  playing audio. The legacy candidate flow keeps its explicit per-proposal confirmation (`server/src/controller.ts`).
- Stale results (old utterance / ended call / paused session) are dropped, never spoken.
- Recognized words are the user's words: never let an LLM rewrite, complete or "correct" them before speaking.
- Personal-voice cloning only with the user's own, consented voice sample (`ELEVENLABS_VOICE_CONSENT=self`).
- Never substitute another voice for the personal voice, or pre-generate personal-voice audio, without the user's
  explicit session choice (`set_voice_policy`). Substituted audio must be labelled.
- Never label mocked/simulated/heuristic output as real. No claims that a live call works unless the remote participant
  actually heard audio; no claims of silent-speech recognition without measured results on real silent recordings.

## Layout
| Path | Role |
|---|---|
| `shared/protocol.ts` | Types shared by server + web. Keep stable; additive changes announced in HANDOFF. |
| `server/` | Node/TS. HTTP+WS :8790, auth, opt-in logging, call transports (`calls.ts` browser, `twilio.ts` PSTN), STT (`stt.ts` whisper.cpp), TTS (`tts.ts` ElevenLabs/`say`, `VoiceRouter`), legacy `controller.ts`/`candidates.ts`. AirPods analysis in `src/airpods/`, `scripts/airpods-*`. |
| `web/` | Vite + React on :5173 (proxies `/ws`, `/api`). Silent workspace, caller page, MediaPipe webcam capture. |
| `recognition/` | Python 3.12 Auto-AVSR visual-only VSR (`tacit_vsr/`): open-vocabulary `transcribe`, webcam recorder, session evaluator. Weights in `third_party/` (not in Git). |
| `airpods/` | Swift `TacitAirPods.app` motion probe (research). |
| `voice/` | Only `src/audio/*` (μ-law/PCM/WAV) is used, imported by `server/`. |
| `third_party/` | Cloned reference repos + model weights. Git-ignored; read-only. |
| `docs/HANDOFF.md` | Current state — read first, update last. |

## Commands (verified — evidence in docs/HANDOFF.md)
```
cd server && npm ci && npm run typecheck && npm test        # backend checks (also in CI)
cd server && npm start                                      # :8790
cd server && npm run links | security:check | smoke | twilio:sim | twilio:preflight | voice:check | bench:stt
cd server && npm run tunnel       # PUBLIC exposure — only with explicit user authorization
cd web && npm ci && npm run typecheck && npm test && npm run build   # frontend checks (also in CI)
cd recognition && .venv/bin/python -m tacit_vsr.transcribe CLIP --ref "TEXT"   # visual-only VSR, audio never read
cd recognition && .venv/bin/python record_webcam.py --name s1 && .venv/bin/python -m tacit_vsr.eval_session <dir>
airpods/tools/build-app.sh && airpods/tools/check.sh; cd server && npm run airpods:record|analyze|gate2|heldout
```
Env: `server/.env` (git-ignored; template `server/.env.example`). Never print or commit keys.
Models (git-ignored): `server/models/ggml-base.en.bin` (whisper.cpp), `third_party/visual/weights/LRS3_V_WER19.1/`
(Auto-AVSR, research/non-commercial licence — see `recognition/tacit_vsr/config.py`).

## Conventions
- TypeScript strict, ESM, `.ts` import extensions, relative imports into `shared/`.
- Add tests for behaviour changes. Prefer small files; no new frameworks without need.
- Record real timestamps; never synthesize timings or results.
- Secrets only via env / `server/data/secrets.json` (0600); never log tokens, keys or request URLs.
- Persistent logging is opt-in (default off). Recordings of faces, voices or motion stay in git-ignored `*/data/`.

## Git (authorized by the user on 2026-11-14; supersedes all earlier no-commit rules)
Repository: `github.com/tanushsavadi/tacit` (**private**), branch `main`.

**Single Git writer.** All agents share one working tree, so exactly one agent performs Git writes (stage, commit,
push, branch, checkout, reset, stash). **Current owner: Claude.** Other agents (Sol/Codex, Gemini) edit only their
owned files, never run Git write commands, and report finished milestones + test results in their workstream notes.
The owner commits another agent's files only after confirming they are not being edited (a stable checkpoint recorded
in that agent's notes, or an explicit yield). Never stage a file another agent is mid-edit on.

Transferring ownership: (1) current owner finishes its Git operation; (2) working-tree state is inspected and
recorded in HANDOFF; (3) the user or current owner states the transfer explicitly in HANDOFF; (4) the new owner
follows the same rules. Two agents never write Git simultaneously. Branches/worktrees only if proposed and agreed later.

Workflow for every change:
1. Inspect state (`git status --short`) before editing; preserve unrelated uncommitted work.
2. Work within your file ownership; implement one cohesive change.
3. Run the relevant checks (typecheck/tests/build for touched areas).
4. Stage only that change by explicit path or `git add -p` — no blanket `git add .` in the shared tree.
5. `git diff --cached --check`, `git diff --cached --stat`, `git diff --cached` — staged content must be exactly the change.
6. Commit with a Conventional Commit message; verify `git status`; push when the change is coherent.
7. Update `docs/HANDOFF.md` when state changes (do not amend commits just to record their own SHA).

**Atomic commits are mandatory**: one coherent, independently understandable change; tests that validate a feature
belong with it; no bundling unrelated work, no artificial micro-commits. Never commit failing code without a
documented reason.

Conventional Commits: `feat(scope): …`, `fix(scope): …`, `test(scope): …`, `refactor(scope): …`, `docs(scope): …`,
`chore(scope): …`, `perf(scope): …`. Subjects describe what the code actually does; never claim unimplemented function.

Never commit: secrets (`.env`, `server/data/secrets.json`, tokens, invite links), recordings of faces/voices/motion,
conversation/transcription logs, model checkpoints/weights, `third_party/`, build output, `node_modules/`, private
screenshots/reports (`web/evidence/`, `web/artifacts/`). See root `.gitignore`.

Prohibited unless the user separately authorizes it: force push; destructive reset; discarding others' changes;
stashing another agent's work; rewriting published history; amending another agent's commits; automatic rebases;
deleting branches with unsaved work; making the repository public; adding collaborators.

## Session protocol (every model)
1. Start: read `AGENTS.md`, then `docs/HANDOFF.md`; `git status --short`; inspect relevant source; run checks.
2. Work one milestone at a time; test real behaviour; avoid subagents unless narrowly scoped with explicit ownership.
3. Before ending/switching: update `docs/HANDOFF.md` (what changed, checks + results, failures, blockers, next task).
   No transcripts or internal reasoning in project files.
4. Respect the ownership table; never edit, format or regenerate files you do not own.

## Ownership (since 2026-11-14)
| Owner | Files |
|---|---|
| **Claude (backend, native, recognition, Git owner)** | `server/**`, `shared/**`, `recognition/**`, `airpods/**`, `voice/**`, `.github/**`, root manifests, `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `docs/HANDOFF.md`, `docs/research/**` |
| **GPT-6 Sol / Codex (frontend)** | `web/**`, `docs/WORKSTREAM_SOL.md` |
- Protocol changes: only the backend owner edits `shared/`; changes stay additive and are announced in
  `docs/HANDOFF.md` → "Interface contract" before anyone depends on them. Frontend requests go there too.
- No broad formatting/cleanup runs.
