#!/usr/bin/env bash
# Builds IP SHIFT for Windows from macOS: web UI, Electron shell (tsc), then NSIS x64/arm64 + portable x64.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pnpm --dir "$ROOT/web" build
cd "$ROOT/windows"
npx tsc -p tsconfig.json || echo "warning: tsc reported errors (output still emitted)"
test -f "$ROOT/windows/dist/main.js"
npx electron-builder --win nsis --x64
if [ "${IPSHIFT_X64_ONLY:-0}" != "1" ]; then
  npx electron-builder --win nsis --arm64
  npx electron-builder --win portable --x64
fi
ls -lh "$ROOT/windows/release/"*.exe
