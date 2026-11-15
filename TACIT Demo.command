#!/bin/bash
# Double-click to start TACIT for a demo (same as ./scripts/tacit.sh demo). Safe to run again: running parts are left alone.
cd "$(dirname "$0")" || exit 1
./scripts/tacit.sh demo
echo
read -r -n 1 -s -p "Press any key to close this window."
