#!/bin/bash
# Builds macos/TacitCompanion/.build/TACIT.app (menu-bar only, ad-hoc signed for local use). The repository root is
# recorded in the bundle so the app can find the server's token file and launcher; no secret is embedded.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"
# SwiftUI macros (@State) need the full Xcode toolchain; the Command Line Tools lack the SwiftUIMacros plugin.
[ -d /Applications/Xcode.app ] && export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
swift build -c release >/dev/null
BIN="$(swift build -c release --show-bin-path)/TacitCompanion"
APP=".build/TACIT.app"
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS"
cp "$BIN" "$APP/Contents/MacOS/TacitCompanion"
ROOT_XML="$(printf '%s' "$ROOT" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g')"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>edu.hackumass.tacit-companion</string>
  <key>CFBundleName</key><string>TACIT</string>
  <key>CFBundleDisplayName</key><string>TACIT</string>
  <key>CFBundleExecutable</key><string>TacitCompanion</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>0.1</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSUIElement</key><true/>
  <key>TACITRepoRoot</key><string>$ROOT_XML</string>
</dict></plist>
PLIST
codesign --force --sign - --identifier edu.hackumass.tacit-companion "$APP"
codesign --verify --strict "$APP"
echo "$PWD/$APP"
