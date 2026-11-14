#!/bin/bash
# Builds airpods/.build/TacitAirPods.app (stable bundle id, NSMotionUsageDescription, ad-hoc signed for local dev).
set -euo pipefail
cd "$(dirname "$0")/.."
swift build -c release >/dev/null
BIN="$(swift build -c release --show-bin-path)/tacit-airpods"
APP=".build/TacitAirPods.app"
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS"
cp "$BIN" "$APP/Contents/MacOS/tacit-airpods"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>edu.hackumass.tacit-airpods</string>
  <key>CFBundleName</key><string>TacitAirPods</string>
  <key>CFBundleDisplayName</key><string>TacitAirPods</string>
  <key>CFBundleExecutable</key><string>tacit-airpods</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>0.1</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSUIElement</key><true/>
  <key>NSMotionUsageDescription</key><string>TACIT reads AirPods head and jaw motion to test camera-free reply selection. Motion data stays on this Mac.</string>
</dict></plist>
PLIST
codesign --force --sign - --identifier edu.hackumass.tacit-airpods "$APP"
codesign --verify --strict "$APP"
echo "$PWD/$APP"
