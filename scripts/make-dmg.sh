#!/usr/bin/env bash
# Packages "dist/IP SHIFT.app" into dist/IP-SHIFT-1.0.0.dmg.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/dist/IP SHIFT.app"
DMG="$ROOT/dist/IP-SHIFT-1.0.0.dmg"
[[ -d "$APP" ]] || { echo "error: $APP not found — run scripts/build-app.sh first" >&2; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
rm -f "$DMG"
hdiutil create -volname "IP SHIFT" -srcfolder "$STAGE" -ov -format UDZO "$DMG"
echo "==> done: $DMG"
