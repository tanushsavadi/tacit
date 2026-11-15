# Silent, isolated QA harness

Read [the independent handoff](../QA_HANDOFF_CODEX.md) for defects, evidence and the recovery card.

```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH" # this Mac's project Node 22
(cd server && npm ci --ignore-scripts --no-audit --no-fund)
node docs/qa/acceptance.mjs --native-root "../HackUMass 26'" --runtime-root "../HackUMass 26'"
```

Use the QA worktree as cwd. `--native-root` supplies source to copy, never a build destination. `--runtime-root` enables the existing passive preflight and a redacted HTTP-only health observation. Omit it for no live-service access. No dependency installation happens inside the harness. It requires macOS/Xcode for native tests. Output defaults to a new git-ignored `server/data/independent-qa/TIMESTAMP/`; an existing `--output` directory is refused to preserve evidence.

Use Node 22 for the existing permission-restricted passive wrapper. On this Mac, the isolated QA directory otherwise resolves Node 26, whose network permission rules block tsx's temporary IPC socket. That produces a wrapper failure, even when authenticated health is ready. Do not loosen filesystem protections to work around it.

Exit 1 = failure (currently expected for documented regression cases); 2 = automated checks passed, human checks remain. Original logs are retained, including failed/flaky runs. Source hashes and working-change metadata identify uncommitted snapshots. Backend/source divergence from the supplied release is a failing gate, not silently ignored.

The fake recognizer never decodes an image, fake synthesis never emits sound, and the fake route only records play requests. Native wire replay translates fixture session IDs/generations explicitly. Hidden-window timer measurements are not rendered frame rates. The existing `--offline-selftest` is safe; the different `--selftest`, `live:*`, `speech:check`, `reviewed:check`, `myvoice:check` and `route:check` are deliberately not launched here.

For targeted backend cases after a full run, set `TACIT_QA_WIRE_PATH` to that run's `native-wire.json` and run `server/node_modules/.bin/vitest run --config docs/qa/vitest.config.mjs`. For native cases, run `swift test --package-path OUTPUT/native --filter ConversationAuditTests` with that same environment variable, preserving the source snapshot.

`node docs/qa/propose-fixes.mjs OUTPUT` tests the proposed native reliability patch in another source copy under that evidence directory. It never applies anything to a runtime checkout. The resulting patch is in `docs/qa/proposed-native-reliability.patch`; baseline acceptance remains separate. A green proposed patch still needs owner review, integration and physical rehearsal.

## Implemented P1 fixes

Both defects are implemented in the QA source on filesystem baseline `4920946`. Run `PATH=/opt/homebrew/opt/node@22/bin:$PATH node docs/qa/verify-p1.mjs` for the 14-gate silent verification suite. It uses the native tests in `macos/TacitCompanion/Tests`, replays their wire captures into the backend, and runs the real security script on a separate ephemeral server with audio disabled. It never accesses the demo runtime. A checkout containing `server/.env` is refused.

See [the stable implementation handoff](../P1_RELIABILITY_HANDOFF_CODEX.md) for exact results and Claude integration instructions. Integrate `implemented-p1-reliability.patch`, not the historical `proposed-native-reliability.patch`. `propose-fixes.mjs` remains a historical source-copy experiment; do not run it against source that already contains the fixes.
