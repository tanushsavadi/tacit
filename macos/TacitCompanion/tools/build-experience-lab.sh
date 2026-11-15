#!/bin/bash
# A distinct bundle and an offline-only launch command; never replaces or launches TACIT.app.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d /Applications/Xcode.app ] && export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
swift build -c release
BIN="$(swift build -c release --show-bin-path)/TacitCompanion"
APP=".build/TACIT Experience Lab.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/TacitCompanion"
cp THIRD_PARTY_NOTICES.md "$APP/Contents/Resources/THIRD_PARTY_NOTICES.md"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>edu.hackumass.tacit-experience-lab</string>
<key>CFBundleName</key><string>TACIT Experience Lab</string>
<key>CFBundleExecutable</key><string>TacitCompanion</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LSUIElement</key><true/>
</dict></plist>
PLIST
codesign --force --sign - --identifier edu.hackumass.tacit-experience-lab "$APP"
codesign --verify --strict "$APP"
printf '%s\n' "$PWD/$APP/Contents/MacOS/TacitCompanion --experience-lab"
