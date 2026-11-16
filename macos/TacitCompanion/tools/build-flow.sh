#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
swift build -c release --scratch-path .build/flow
BIN="$(swift build -c release --scratch-path .build/flow --show-bin-path)/TacitCompanion"
APP="$PWD/.build/TACIT Flow Demo.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/TacitCompanion"
cp THIRD_PARTY_NOTICES.md "$APP/Contents/Resources/THIRD_PARTY_NOTICES.md"
export TACIT_FLOW_BUILD_ROOT="$(cd ../.. && pwd)"
export TACIT_FLOW_APP="$APP"
python3 - <<'PY'
import os,plistlib
from pathlib import Path
app=Path(os.environ['TACIT_FLOW_APP'])
with (app/'Contents/Info.plist').open('wb') as f:
 plistlib.dump({'CFBundleIdentifier':'edu.hackumass.tacit-flow-demo','CFBundleName':'TACIT Flow Demo','CFBundleDisplayName':'TACIT Flow Demo','CFBundleExecutable':'TacitCompanion','CFBundlePackageType':'APPL','CFBundleVersion':'1','CFBundleShortVersionString':'0.1.0-flow','LSMinimumSystemVersion':'14.0','LSUIElement':True,'TACITFlowCandidate':True,'TACITFlowDemo':True,'TACITFlowPort':19892,'TACITServerPort':19890,'TACITRepoRoot':os.environ['TACIT_FLOW_BUILD_ROOT'],'NSCameraUsageDescription':'TACIT Flow Demo uses local camera frames for your reviewed silent speech. Meeting audio comes only from the separately selected Chrome tab.'},f)
PY
codesign --force --sign - --identifier edu.hackumass.tacit-flow-demo "$APP"
codesign --verify --strict "$APP"
printf '%s\n' "$APP"
