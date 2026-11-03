#!/usr/bin/env bash
# Builds and signs "dist/IP SHIFT.app". Usage: scripts/build-app.sh [--web]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/dist/IP SHIFT.app"
BUILD_WEB=0
for arg in "$@"; do
  case "$arg" in
    --web) BUILD_WEB=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# 1. web build
if [[ "$BUILD_WEB" == 1 || ! -f "$ROOT/web/dist/index.html" ]]; then
  if [[ -f "$ROOT/web/package.json" ]] && command -v pnpm >/dev/null 2>&1; then
    echo "==> pnpm --dir web build"
    if ! pnpm --dir "$ROOT/web" build; then
      if [[ "$BUILD_WEB" == 1 ]]; then echo "error: web build failed" >&2; exit 1; fi
      echo "warning: web build failed — continuing with whatever web/dist contains" >&2
    fi
  else
    echo "warning: web/package.json or pnpm missing — skipping web build" >&2
  fi
fi

# 2. native build
echo "==> swift build -c release"
# IPSHIFT_UNIVERSAL=1 builds a universal (arm64 + x86_64) binary for public releases.
ARCH_FLAGS=()
if [[ "${IPSHIFT_UNIVERSAL:-0}" == "1" ]]; then ARCH_FLAGS=(--arch arm64 --arch x86_64); fi
# -file-prefix-map keeps local absolute paths out of the shipped binary.
swift build -c release --package-path "$ROOT/native" "${ARCH_FLAGS[@]+"${ARCH_FLAGS[@]}"}" -Xswiftc -file-prefix-map -Xswiftc "$ROOT=."
BIN_DIR="$(swift build -c release --package-path "$ROOT/native" "${ARCH_FLAGS[@]+"${ARCH_FLAGS[@]}"}" --show-bin-path)"

# 3. assemble bundle
echo "==> assembling $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN_DIR/IPShift" "$APP/Contents/MacOS/IPShift"
cp "$ROOT/scripts/Info.plist" "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"
if [[ -f "$ROOT/web/dist/index.html" ]]; then
  mkdir -p "$APP/Contents/Resources/web"
  cp -R "$ROOT/web/dist/." "$APP/Contents/Resources/web/"
else
  echo "warning: web/dist/index.html not found — bundle has NO web resources" >&2
fi

# 4. icon
ICON_SRC="$ROOT/web/public/assets/icon/icon_1024.png"
if [[ -f "$ICON_SRC" ]]; then
  echo "==> building AppIcon.icns"
  TMP="$(mktemp -d)"
  ICONSET="$TMP/AppIcon.iconset"
  mkdir -p "$ICONSET"
  for s in 16 32 128 256 512; do
    sips -z "$s" "$s" "$ICON_SRC" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
    d=$((s * 2))
    sips -z "$d" "$d" "$ICON_SRC" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
  rm -rf "$TMP"
else
  echo "warning: $ICON_SRC not found — skipping app icon" >&2
fi

# 5. sign
SIGN="${IPSHIFT_SIGN_IDENTITY:-}"
if [[ -z "$SIGN" ]]; then
  SIGN="$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Apple Development:[^"]*\)".*/\1/p' | head -n 1 || true)"
fi
if [[ -z "$SIGN" ]]; then
  echo "warning: no Apple Development identity found — using ad-hoc signature" >&2
  SIGN="-"
fi
echo "==> codesign ($SIGN)"
codesign --force --deep --timestamp=none --sign "$SIGN" "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
echo "==> done: $APP"
