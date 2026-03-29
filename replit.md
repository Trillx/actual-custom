# Actual Budget - Replit Setup

## Overview

Actual Budget is a local-first personal finance application. This is the monorepo containing the web frontend, sync server, core budgeting engine, and related packages.

## Architecture

- **Frontend**: React 19 + Vite (packages/desktop-client) — the main web UI
- **Core Engine**: loot-core (packages/loot-core) — budgeting logic, local SQLite database via sql.js/absurd-sql
- **Sync Server**: Express (packages/sync-server) — optional server for multi-device sync
- **Plugin Service**: Service worker (packages/plugins-service) — browser plugin support
- **Package Manager**: Yarn 4.10.3 with Workspaces (monorepo)
- **Node**: v22 (required, project uses `engines: { node: ">=22" }`)

## Running the App

The workflow starts the browser version of Actual Budget. It runs:
1. `yarn install` — installs/links all workspace dependencies
2. Build plugins-service — creates the service worker for browser plugins
3. Start loot-core watch:browser — builds the WebWorker backend (runs in background)
4. Start Vite frontend — serves the React app on port 5000

**Startup script**: `start-dev.sh`

**Workflow command**: `bash start-dev.sh`

## Port Configuration

- **Frontend**: Port 5000 (Vite dev server, 0.0.0.0 host, all hosts allowed)
- **Sync server** (optional): Would run on a different port (5006 in upstream docs)

## Key Files

- `start-dev.sh` — Dev startup script
- `packages/desktop-client/vite.config.ts` — Vite config (host: 0.0.0.0, allowedHosts: all)
- `packages/desktop-client/src/` — Main React app source
- `packages/loot-core/src/` — Core budgeting engine
- `packages/sync-server/src/` — Optional sync server

## AI Chat Assistant

The app includes an AI-powered budget chat assistant that lets users ask questions about their finances in natural language.

### Architecture
- **Chat Panel**: `packages/desktop-client/src/components/chat/` — sliding panel on the right side of the app
- **AI Service**: `aiService.ts` — calls OpenAI API (gpt-4o-mini) directly from the browser
- **Budget Context**: `useBudgetContext.ts` — gathers accounts, categories, budget month data, and recent transactions via the `send()` API bridge
- **Settings**: `packages/desktop-client/src/components/settings/AISettings.tsx` — OpenAI API key configuration stored in `LocalPrefs`

### How It Works
1. User clicks "AI Chat" button in the sidebar (uses `SvgChatBubbleDots` icon)
2. Chat panel opens on the right side of FinancesApp
3. On each message, the system gathers current budget context (accounts, categories, budget for current month, last 30 transactions)
4. Context + conversation history is sent to OpenAI's API
5. Response is displayed in the chat panel

### Configuration
- API key is stored in `LocalPrefs['ai.apiKey']` (device-local, not synced)
- Set via Settings > AI Assistant section
- No backend proxy needed — calls go directly to OpenAI from the browser

## Notes

- The app is fully local-first — data is stored in the browser's IndexedDB
- The sync server is optional and not started by default in this setup
- First startup takes ~30 seconds for the loot-core build and initial Vite compilation
- The yarn link step (during `yarn install`) takes a few seconds on first cold-boot but is instant on subsequent runs due to caching
