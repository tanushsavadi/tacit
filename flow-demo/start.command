#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ -f data/processes.json ]]; then
  if python3 -c 'import json,os; os.kill(json.load(open("data/processes.json"))["supervisor"],0)' 2>/dev/null; then
    echo "Flow Demo is already running. Use its Control Center. No process was changed."
    exit 0
  fi
fi
./check.command
if [[ ! -x 'candidate/macos/TacitCompanion/.build/TACIT Flow Demo.app/Contents/MacOS/TacitCompanion' ]]; then
  candidate/macos/TacitCompanion/tools/build-flow.sh
fi
mkdir -p data
if [[ $# -eq 0 ]]; then set -- --local-output; fi
nohup node_modules/.bin/tsx runtime/launch.ts "$@" > data/runtime.log 2>&1 < /dev/null &
for ((i=0;i<120;i++)); do
  if curl -fsS http://127.0.0.1:19892/health >/dev/null 2>&1; then
    node_modules/.bin/tsx runtime/readiness.ts
    echo "✓ Isolated server connected · :19890 / :19892"
    echo "✓ Scenario A loaded · manual advance · Control Center opening"
    echo "✓ Simulated input labelled · Review First · no automatic speech"
    echo "Voice route: local rehearsal by default; --with-output requires no competing BlackHole router."
    echo "Meet listener: optional, UNVERIFIED until a human confirms sound."
    exit 0
  fi
  sleep 0.2
done
echo "Launch failed; inspect data/runtime.log. No stable process was stopped."
exit 1
