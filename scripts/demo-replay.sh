#!/bin/bash
# PRERECORDED fallback for a demo: replays the user's own recorded silent clips through the native TACIT pipeline
# (Vision lip tracking + endpointing → running server → recognizer, Live display-only). Results appear in the notch for
# review exactly like camera utterances; nothing is spoken unless the presenter presses Speak.
# This is RECORDED input, not live camera recognition — say so when presenting it.
#   ./scripts/demo-replay.sh [CLIP.mp4 ...]     default: clips listed in recognition/data/demo_replay.txt (git-ignored)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/macos/TacitCompanion/.build/TACIT.app/Contents/MacOS/TacitCompanion"
LIST="$ROOT/recognition/data/demo_replay.txt"
[ -x "$APP" ] || { echo "FAIL: TACIT app not built (./scripts/tacit.sh build)"; exit 1; }
clips=("$@")
if [ ${#clips[@]} -eq 0 ]; then
  [ -f "$LIST" ] || { echo "FAIL: no clips given and $LIST missing"; exit 1; }
  while IFS= read -r l; do [[ -z "$l" || "$l" == \#* ]] || clips+=("$ROOT/$l"); done <"$LIST"
fi
echo "=== PRERECORDED REPLAY — recorded clips, NOT live camera recognition (${#clips[@]} clips) ==="
"$APP" --analyze-video --send "${clips[@]}" 2>&1 | grep -E "^RESULT|^REPLAY DONE|^NOT SENT|^FAIL|^TIMEOUT|REFUSED"
echo "=== end of PRERECORDED replay — results are in the notch; review, then Speak only what you choose ==="
