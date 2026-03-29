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
IS_GENERIC_BROWSER=1 yarn workspace @actual-app/core build:browser
echo "Browser backend built."

echo "Building frontend..."
cd packages/desktop-client
IS_GENERIC_BROWSER=1 REACT_APP_BACKEND_WORKER_HASH="prod" \
  ../../node_modules/.bin/vite build
echo "Frontend built."

echo "=== Build complete ==="
echo "Output in packages/desktop-client/build/"
