#!/bin/bash
set -e

echo "=== Actual Budget Production Build ==="

rm -f node_modules/desktop-electron 2>/dev/null || true

echo "Installing dependencies..."
yarn install --inline-builds
echo "Dependencies installed."

echo "Building plugin service worker..."
yarn workspace plugins-service build-dev
echo "Plugin service worker built."

echo "Building browser backend..."
rm -f packages/loot-core/lib-dist/browser/kcab.worker.*.js 2>/dev/null || true
rm -f packages/loot-core/lib-dist/browser/kcab.worker.*.js.map 2>/dev/null || true
IS_GENERIC_BROWSER=1 yarn workspace @actual-app/core build:browser
echo "Browser backend built."

WORKER_FILES=(packages/loot-core/lib-dist/browser/kcab.worker.*.js)
WORKER_FILES=("${WORKER_FILES[@]%.map}")
WORKER_FILE=""
for f in "${WORKER_FILES[@]}"; do
  [[ "$f" == *.map ]] && continue
  [[ -f "$f" ]] || continue
  WORKER_FILE="$f"
  break
done

if [[ -z "$WORKER_FILE" ]]; then
  echo "ERROR: No kcab.worker.*.js found after build!" >&2
  exit 1
fi

WORKER_HASH=$(echo "$WORKER_FILE" | sed 's/.*kcab\.worker\.\(.*\)\.js/\1/')

if [[ -z "$WORKER_HASH" ]]; then
  echo "ERROR: Could not extract worker hash from $WORKER_FILE" >&2
  exit 1
fi

echo "Backend worker hash: $WORKER_HASH"

echo "Building frontend..."
cd packages/desktop-client
IS_GENERIC_BROWSER=1 REACT_APP_BACKEND_WORKER_HASH="$WORKER_HASH" \
  ../../node_modules/.bin/vite build
echo "Frontend built."

if [[ ! -f "build/kcab/kcab.worker.${WORKER_HASH}.js" ]]; then
  echo "ERROR: Built frontend missing kcab.worker.${WORKER_HASH}.js!" >&2
  exit 1
fi

echo "=== Build complete ==="
echo "Output in packages/desktop-client/build/"
