#!/bin/bash

echo "=== Actual Budget Dev Startup ==="

# Fix conflicting symlinks from partial installs
rm -f node_modules/desktop-electron 2>/dev/null || true

# Run yarn install to link all packages
echo "Installing dependencies..."
yarn install
echo "Dependencies installed."

# Build the plugin service worker (required for browser mode)
echo "Building plugin service worker..."
yarn workspace plugins-service build-dev
echo "Plugin service worker built."

# Start loot-core browser backend in background (watch mode)
echo "Starting browser backend..."
IS_GENERIC_BROWSER=1 REACT_APP_BACKEND_WORKER_HASH="dev" \
  yarn workspace @actual-app/core watch:browser &
BACKEND_PID=$!

# Give backend a moment to start its initial build
sleep 8

# Start the Vite frontend on port 5000
# Use vite directly with the correct port (bypasses watch-browser script which hardcodes 3001)
echo "Starting frontend on port 5000..."
cd packages/desktop-client
IS_GENERIC_BROWSER=1 PORT=5000 REACT_APP_BACKEND_WORKER_HASH="dev" \
  ../../node_modules/.bin/vite --port 5000 --host 0.0.0.0

wait $BACKEND_PID
