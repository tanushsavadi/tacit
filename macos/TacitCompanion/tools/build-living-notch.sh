#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d /Applications/Xcode.app ] && export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
swift build -c release --scratch-path .build/living-notch-build
BIN="$(swift build -c release --scratch-path .build/living-notch-build --show-bin-path)/TacitCompanion"
APP=".build/TACIT Living Notch.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/TacitCompanion"
cp THIRD_PARTY_NOTICES.md "$APP/Contents/Resources/THIRD_PARTY_NOTICES.md"
# Copy the current release's non-secret configuration and camera usage description for optional connected QA.
cp .build/TACIT.app/Contents/Info.plist "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier edu.hackumass.tacit-living-notch' "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleName TACIT Living Notch' "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName TACIT Living Notch' "$APP/Contents/Info.plist"
codesign --force --sign - --identifier edu.hackumass.tacit-living-notch "$APP"
codesign --verify --strict "$APP"
printf '%s\n' "$PWD/$APP/Contents/MacOS/TacitCompanion --experience-lab"
