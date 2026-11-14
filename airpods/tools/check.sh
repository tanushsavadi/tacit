#!/bin/bash
# Launches the app through LaunchServices (so it, not the terminal, asks for Motion permission) and reports status.
# Usage: airpods/tools/check.sh [seconds]   — exit code as documented in Sources/tacit-airpods/main.swift
cd "$(dirname "$0")/.."
APP=".build/TacitAirPods.app"; [ -d "$APP" ] || tools/build-app.sh >/dev/null
OUT=$(mktemp -t tacit-airpods-out); ERR=$(mktemp -t tacit-airpods-err)
open -n -W --stdout "$OUT" --stderr "$ERR" "$APP" --args --check --seconds "${1:-12}"
cat "$ERR"
echo "samples: $(($(wc -l < "$OUT") - 1 < 0 ? 0 : $(wc -l < "$OUT") - 1))"
sed -n 2,4p "$OUT"
code=$(sed -n 's/^result: \([0-9]*\).*/\1/p' "$ERR" | tail -1)
rm -f "$OUT" "$ERR"; exit "${code:-1}"
