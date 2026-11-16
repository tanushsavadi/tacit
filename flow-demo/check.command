#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null
command -v swift >/dev/null
[[ -x node_modules/.bin/tsx ]] || { echo "Missing local Node dependencies"; exit 1; }
node_modules/.bin/tsx runtime/check.ts
