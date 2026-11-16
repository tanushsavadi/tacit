#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
./stop.command
for ((i=0;i<50;i++)); do
  if ! curl -fsS http://127.0.0.1:19892/health >/dev/null 2>&1; then break; fi
  sleep 0.1
done
MODE="${1:-mock}"
ARGS=(--mock-speech --no-app)
NATIVE=(--demo-test-audio)
if [[ "$MODE" == live ]]; then ARGS=(--no-app); NATIVE=(--demo-live); fi
if [[ "$MODE" == audio ]]; then ARGS=(--local-output --no-app); NATIVE=(--demo-real-audio); fi
mkdir -p "evidence/rehearsal-$MODE"
node_modules/.bin/tsx runtime/launch.ts "${ARGS[@]}" > "data/rehearsal-$MODE.log" 2>&1 &
trap './stop.command' EXIT
for ((i=0;i<120;i++)); do
  if curl -fsS http://127.0.0.1:19892/health >/dev/null 2>&1; then break; fi
  sleep 0.2
done
'candidate/macos/TacitCompanion/.build/TACIT Flow Demo.app/Contents/MacOS/TacitCompanion' --demo-rehearsal "$PWD/evidence/rehearsal-$MODE" "${NATIVE[@]}"
