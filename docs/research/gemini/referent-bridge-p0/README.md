# Referent Bridge P0

External, executable TypeScript research prototype. **No native integration recommended on this evidence.** See [RESULTS.md](RESULTS.md). No audio, speech, Meet capture, app controls, servers or production WebSockets exist here.

The normal commands are offline. Gemini extraction proposes exact source quotations; the user explicitly chooses one and authors their own point. Local constrained rendering keeps that entire point verbatim. Approval produces a text-only object. It cannot transmit or speak anything.

## Run

Node 22+, TypeScript 5.9, `@google/genai` 3.3.0 and Zod (see `package.json`; run `npm i` here first). During the hackathon the dependencies were reused from the TACIT server via a symlink; that link is not part of the repository. `GEMINI_API_KEY` is only needed for `npm run probe`, and the call budget in `evidence/call-budget.json` is already spent, so reruns use the recorded responses.

```sh
cd docs/research/gemini/referent-bridge-p0
npm run typecheck
npm test
npm run evaluate
npm run demo
npm run interactive
```

Mock modes say MOCK. To use the **actual saved Gemini extraction** without spending quota:

```sh
npm run interactive -- --replay-real
npm run demo -- --replay-real
```

Interactive example: enter `condition`, then `1`, then `yes, but I need to leave by five.`, inspect the full output, then enter `APPROVE` or anything else to cancel. Replay is prominently labeled RECORDED / NOT LIVE. The automated demo uses scripted user choices, not real user-performance measurements. Unknown case IDs fail rather than substituting a scenario.

For offline network-blocked verification:

```sh
node --experimental-strip-types --import ./src/offline-guard.ts --test test/*.test.ts
node --experimental-strip-types --import ./src/offline-guard.ts src/evaluate.ts
node --experimental-strip-types --import ./src/offline-guard.ts src/cli.ts demo --replay-real
```

## Real API budget is already spent

Exactly two synthetic batched Gemini requests ran on 2026-11-15 at 11:57:56 and 11:57:59 UTC, well before scheduled judging. One Bridge batch and one Help Me Respond batch, six cases each. No retries, warmups, fallback or model-list calls. `evidence/call-budget.json` records both reservations. The probe refuses reruns and evidence overwrite. No further inference is part of P0.

The `probe` entry point requires `--run-two-synthetic-calls`; it reads `GEMINI_API_KEY` from the process or, if specified, an existing env file through `TACIT_ENV_FILE`. The key is used only in memory and never printed/copied into this directory. Do not delete the budget/evidence to bypass the approved limit. No shell credentials, private recordings or personal conversations are needed for offline use.

## Layout and evidence

| Path | Contents |
|---|---|
| `src/contracts.ts` | Strict model schema, separation from user position, Gemini instruction |
| `src/references.ts` | Exact quote/turn validation, correction barrier, deterministic chips |
| `src/bridge.ts` | User choice, point, constrained composition, hash approval, cancellation/epochs |
| `src/cases.ts` | 30 synthetic author-labeled cases; gold never enters a real prompt |
| `src/evaluation.ts` | Source-coverage checks, narrow wording diagnostics, scripted action counts |
| `src/evaluate.ts` | Offline evaluation, model/mock separation, artifact creation |
| `src/cli.ts` | Mock or recorded-response executable text interaction |
| `src/probe.ts`, `src/budget.ts` | Isolated pinned API adapter and persistent two-call guard |
| `vendor/hmr-pure.ts` | Actual production pure prompt/parser/validator snapshot, no service execution |
| `evidence/baseline-manifest.json` | Original source SHA-256 and snapshot boundary |
| `evidence/real-bridge.json`, `real-hmr.json` | Actual synthetic requests, exact raw responses, model/usage/wall time |
| `evidence/mock-traces.json`, `real-traces.json` | Explicit scripted selection/point/review/approval events |
| `evidence/evaluation.json` | Full scores and action/character inventories |
| `evidence/tests.txt` | Fresh deterministic/replay test output |
| `EXPERIMENT_PLAN.md` | Criteria, baselines and budget set before real inference |

## What the guarantee means

It guarantees source membership/quotation, version freshness, no model-authored position, and preservation of the exact user point in the locally assembled text. It does **not** prove a quote is the right antecedent, that all antecedents were returned, that a date/time is fully specified, that a user's point is factually/temporally consistent, or that a human selected correctly. Tests intentionally demonstrate wrong-but-exact and collapsed-ambiguity responses that pass citation validation.

The correction barrier uses lexical cues and conservatively rejects every older turn. It does not implement a complete conversational state model; implicit corrections can be missed and unrelated facts can be over-invalidated. Those limits preclude a production safety claim.

The composition is intentionally restricted (`Regarding <exact reference>: <verbatim user point>` or point-first). Gemini supplies the reference proposal/layout, not freely rewritten prose. This is a stronger preservation boundary but gives up the fluency/short-input expansion promised by a fuller design. Natural wording benefits remain untested.

The HMR comparison runs its actual pure production system prompt/buildPrompt and validator, with an explicit batch envelope and no service/TTS execution. Batching means its latency is not the deployed per-turn latency, and these six cases do not establish broad quality. Human reading/effort, clinical outcomes, AAC-user accessibility, Meet delivery and recognition accuracy were not evaluated.
