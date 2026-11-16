#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
./stop.command
for ((i=0;i<50;i++)); do
  if ! curl -fsS http://127.0.0.1:19892/health >/dev/null 2>&1; then break; fi
  sleep 0.1
done
./start.command "$@"
