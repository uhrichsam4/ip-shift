#!/usr/bin/env bash
# Runs the Vite dev server and the debug app pointed at it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_URL="http://localhost:5173"

pnpm --dir "$ROOT/web" dev --port 5173 --strictPort &
VITE_PID=$!
trap 'kill "$VITE_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  curl -sf "$DEV_URL" >/dev/null 2>&1 && break
  sleep 0.5
done

swift build --package-path "$ROOT/native" --product IPShift
BIN_DIR="$(swift build --package-path "$ROOT/native" --show-bin-path)"
IPSHIFT_DEV_URL="$DEV_URL" "$BIN_DIR/IPShift"
