#!/bin/bash
set -euo pipefail
P="$(cd "$(dirname "$0")" && pwd)"; cd "$P/remotion"; mkdir -p "$P/renders/raw"
r() { echo "$(date -u +%T) render $1"; npx remotion render src/index.ts "$1" "$P/renders/raw/$2" --codec=h264 --crf=17 --audio-bitrate=320k --timeout=120000 --concurrency=6 --log=error; bash "$P/master.sh" "$P/renders/raw/$2" "$P/renders/$2"; echo "$(date -u +%T) done $2"; }
for spec in "$@"; do r ${spec%%=*} ${spec##*=}; done
