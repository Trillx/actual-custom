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
2. Chat panel opens on the right side of FinancesApp (or full-screen overlay on mobile)
3. On each message, the system gathers lightweight baseline context (accounts, categories, budget for current month, a small sample of recent transactions, scheduled transactions). Detailed data is fetched on-demand via query actions only when needed.
4. Context + conversation history is sent to OpenAI's API (or custom endpoint)
5. Response is displayed in the chat panel
6. If the AI proposes a write action (set budget, add transaction, create category/account), a confirmation card is shown
7. User must explicitly confirm or cancel before any write operation executes
8. If the AI proposes a read-only query action, it auto-executes, fetches data, and sends a follow-up request to summarize results

### Write Actions (with confirmation)
The AI can propose these actions, each requiring user confirmation:
- `set-budget-amount` — Set budget for a category in a given month
- `add-transaction` — Add a new transaction to an account
- `create-category` — Create a new budget category
- `create-account` — Create a new account

### Read-Only Query Actions (auto-execute, no confirmation)
The AI can query data using these query types:
- `search-transactions` — Filter transactions by date, payee, category, account, amount, notes
- `spending-by-category` / `spending-by-payee` / `spending-by-month` / `spending-by-week` / `spending-by-quarter` / `spending-by-account` — Spending breakdowns
- `budget-vs-actual` — Compare budgeted vs actual spending for a month
- `top-payees` / `top-categories` — Ranked spending by payee or category
- `budget-month` — Get budget data for any specific month
- `budget-trend` — Compare budget data across multiple months

Query helpers are in `queryHelpers.ts`. They use the `api/query` AQL endpoint for server-side transaction filtering and the `api/budget-month` endpoint for budget data. The flow is: AI returns a query action → ChatPanel auto-executes it → result is injected into context → AI summarizes the result for the user.

### Goal Tracking & Spending Forecasting
The AI assistant supports forward-looking financial insights:
- **Goal Storage**: `goalStorage.ts` — localStorage-based CRUD for savings goals, scoped per budget file
- **Forecast Engine**: `forecastEngine.ts` — monthly spending projection, category-level forecasts, debt payoff calculator, what-if scenario engine, and goal progress calculator
- **Goal Actions**: `create-goal`, `update-goal`, `delete-goal` write actions with confirmation cards
- **Context Integration**: `useBudgetContext.ts` automatically computes and injects goal progress, spending projections, category forecasts, and debt account info into AI context
- Users can say "I want to save $5,000 by December" and the AI creates a goal and tracks progress
- Monthly spending projections extrapolate based on daily spending rate with clear assumptions stated
- Category-level forecasts identify which categories are likely to go over budget
- Debt payoff timelines based on account balances with negative balances
- What-if scenarios (e.g., "cut dining by 50%") show projected impact on budget and goals

### Chat State
- Messages persist in a session store (`chatState.ts`) — closing and reopening the panel preserves conversation history within the session
- State is module-level (not localStorage), so it resets on page reload
- Goals persist across sessions via localStorage (scoped per budget file)

### Configuration
- API key is stored in `LocalPrefs['ai.apiKey']` (device-local, not synced)
- Optional custom endpoint URL in `LocalPrefs['ai.endpointUrl']` for Azure OpenAI, local models, etc.
- Set via Settings > AI Assistant section
- No backend proxy needed — calls go directly to OpenAI from the browser

## Notes

- The app is fully local-first — data is stored in the browser's IndexedDB
- The sync server is optional and not started by default in this setup
- First startup takes ~30 seconds for the loot-core build and initial Vite compilation
- The yarn link step (during `yarn install`) takes a few seconds on first cold-boot but is instant on subsequent runs due to caching
