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
- **Settings**: `packages/desktop-client/src/components/settings/AISettings.tsx` — OpenAI API key configuration stored in `SyncedPrefs` (syncs across devices)
- **Server Handlers**: `packages/loot-core/src/server/chat/app.ts` — CRUD handlers for chat data stored in budget SQLite DB

### Chat History & Data Persistence

Chat messages, memories, goals, and AI settings are persisted in the budget's SQLite database via loot-core:
- **Chat messages**: `chat_messages` table — stored locally via raw SQL (not CRDT sync, since chat data is local-only)
- **AI memories**: `chat_memories` table — stored locally via raw SQL
- **Savings goals**: `chat_goals` table — stored locally via raw SQL
- **AI settings**: Stored in `preferences` table via `SyncedPrefs` (`ai.apiKey`, `ai.modelName`, `ai.endpointUrl`)
- Each budget has isolated chat data (budget-scoped by virtue of separate SQLite DBs)
- A rolling window of 200 messages is maintained (older messages are pruned on save)
- On reload, any pending/executing actions are marked as "expired" so they don't appear as active confirmations
- The AI receives a summary of the last 10 messages from the prior session for conversation continuity
- Users can clear all chat history using the trash icon in the chat header
- On first load after upgrade, existing localStorage data is automatically migrated to the database
- Key files: `chatState.ts`, `memoryStorage.ts`, `goalStorage.ts` — async persistence layers using `send()` API

### How It Works

1. User clicks "AI Chat" button in the sidebar (uses `SvgChatBubbleDots` icon)
2. Chat panel opens on the right side of FinancesApp (or full-screen overlay on mobile)
3. On mount, persisted messages are loaded from the database (with expired action state handling)
4. On each message, the system gathers lightweight baseline context (accounts, categories, budget for current month, a small sample of recent transactions, scheduled transactions). Detailed data is fetched on-demand via query actions only when needed.
5. Context + conversation history is sent to OpenAI's API (or custom endpoint)
6. Response is displayed in the chat panel
7. If the AI proposes write action(s), a confirmation card is shown with human-readable details (names instead of UUIDs for categories, accounts, payees, and transactions). The AI's description is used as the card header. For bulk updates (10+ transactions), items are grouped into a summary with an expandable "Show all" section for full per-transaction details. For multiple actions, the queue UI shows all actions with individual and batch confirm/reject controls.
8. User must explicitly confirm or cancel before any write operation executes
9. If the AI proposes a read-only query action, it auto-executes, fetches data, and sends a follow-up request to summarize results

### Action Queue System

The AI can handle compound requests (e.g., "create a schedule for rent and add a rule to categorize the payee") by emitting multiple action blocks in a single response.

- **Multi-action parser**: `parseAllActions()` in `aiService.ts` extracts all fenced action blocks from a response
- **Queue UI**: When multiple write actions are detected, ChatMessage renders a grouped action list with per-action Confirm/Skip buttons plus batch Confirm All/Cancel All
- **Sequential execution**: Confirm All executes actions in order, updating status as each completes. Failures don't block remaining actions.
- **Race protection**: Actions transition atomically from `pending` → `executing` to prevent double-submission
- **Types**: `QueuedAction` type in `types.ts` tracks per-action id, status, and result

### Write Actions (with confirmation)

The AI can propose these actions, each requiring user confirmation:

- `set-budget-amount` — Set budget for a category in a given month
- `add-transaction` — Add a new transaction to an account
- `update-transaction` — Change details of an existing transaction
- `delete-transaction` — Remove a transaction
- `transfer-between-accounts` — Move money between accounts
- `create-category` — Create a new budget category
- `create-account` — Create a new account
- `close-account` / `reopen-account` — Close or reopen accounts
- `rename-category` / `delete-category` — Rename or delete categories (with optional transfer)
- `create-category-group` — Create category groups with optional initial categories
- `rename-payee` / `merge-payees` — Rename payees or merge duplicates
- `copy-previous-month` — Copy all budget values from previous month
- `set-budget-average` — Set all budgets to 3/6/12-month average
- `bulk-set-budget` — Set budget for multiple categories at once
- `transfer-budget` — Transfer budget between categories
- `create-goal` / `update-goal` / `delete-goal` — Savings goal management
- `reorganize-categories` — Compound action: creates new groups, moves categories by name, deletes old empty groups — all in one confirmation
- `save-memory` — Save an AI memory/preference (categorization rules, preferences, context)
- `delete-memory` — Delete a saved memory by ID
- `bulk-update-transactions` — Update multiple transactions at once (bulk categorization, payee changes, etc.)
- `create-schedule` / `update-schedule` / `delete-schedule` — Schedule management for recurring transactions
- `create-schedules-batch` — Compound action: creates multiple schedules at once (used for subscription-to-schedule conversion)
- `create-rule` — Create a payee rename rule (fromNames → toPayee). Resolves payee by name or creates new payee. Uses `rule-add-payee-rename` API.
- `delete-rule` — Delete an existing rule by ID

### Read-Only Query Actions (auto-execute, no confirmation)

The AI can query data using these query types:

- `search-transactions` — Filter transactions by date, payee, category, account, amount, notes
- `spending-by-category` / `spending-by-payee` / `spending-by-month` / `spending-by-week` / `spending-by-quarter` / `spending-by-account` — Spending breakdowns
- `budget-vs-actual` — Compare budgeted vs actual spending for a month
- `top-payees` / `top-categories` — Ranked spending by payee or category
- `budget-month` — Get budget data for any specific month
- `budget-trend` — Compare budget data across multiple months
- `detect-subscriptions` — Find recurring charges from transaction history
- `detect-anomalies` — Identify unusual spending patterns vs historical averages
- `spending-trend` — Analyze month-over-month spending trends by category or payee
- `historical-comparison` — Compare current month spending to historical averages
- `list-memories` — List all saved AI memories (auto-executes like other queries)
- `list-rules` — List all existing rules with resolved payee/category names (auto-executes like other queries)

Query helpers are in `queryHelpers.ts`. They use the `api/query` AQL endpoint for server-side transaction filtering and the `api/budget-month` endpoint for budget data. The flow is: AI returns a query action → ChatPanel auto-executes it (up to 2 rounds) → result is injected into context → AI summarizes the result for the user.

### Subscription & Anomaly Detection

- `spendingAnalysis.ts` — Detects recurring charges by analyzing payee + amount consistency (CV < 30%) with recognizable intervals. Cross-references with scheduled transactions for confirmation.
- **Fuzzy payee grouping**: `normalizePayeeName()` strips Inc/LLC/Corp/.com/.net suffixes, lowercases, and collapses whitespace to group payee variants (e.g., "Netflix", "NETFLIX.COM", "Netflix Inc") under one canonical name. Variant names are tracked in `RecurringTransaction.payeeVariants[]` and surfaced in the subscription list with a warning to create rename rules.
- Anomalies use 2+ standard deviations above historical mean for both category-level and individual transaction analysis.
- Results are pre-computed and injected into context for proactive AI insights.
- When untracked subscriptions are detected (matchesSchedule=false), the AI suggests creating schedules via `create-schedules-batch`. Schedule context includes IDs, recurrence info, account, and completion status for update/delete operations.
- When payee name variants are detected, the AI suggests creating payee rename rules via `create-rule` to normalize imported payee names for future imports.

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

### Actual Budget Knowledge Base

The AI has a condensed knowledge base of Actual Budget's official documentation (`actualDocsKnowledge.ts`), covering:

- Envelope/zero-sum budgeting philosophy and workflow
- Accounts (on/off budget, reconciliation, closing)
- Categories (groups, merge, hide, pin, notes)
- Transactions (manual entry, splits, cleared status, importing)
- Transfers (on-budget vs off-budget, matching)
- Payees (merge, rename, favorites, transfer payees)
- Bulk editing
- Rules (conditions, actions, stages, automatic rules, category learning)
- Schedules (recurring, one-time, auto-enter, approximate amounts)
- Credit cards (payment workflow, carrying debt)
- Returns & reimbursements
- Reports (net worth, cash flow, spending, custom)
- Multi-currency, joint accounts, syncing, tips & tricks

This knowledge is injected into the system prompt so the AI can give accurate guidance on Actual Budget features without needing to look things up externally.

### AI Memory System

The AI assistant has a persistent memory system for learning user preferences, categorization rules, and personal context:

- **Memory Storage**: `memoryStorage.ts` — localStorage-based CRUD for memories, scoped per budget file via fingerprint (`actual-budget-chat-memories:<fingerprint>`)
- **Memory Panel**: `MemoryPanel.tsx` — UI for viewing, adding, and deleting memories. Accessed via 🧠 button in chat header.
- **Memory Types**: `categorization` (transaction/category rules), `preference` (general preferences), `context` (personal financial context)
- **AI Integration**: Memories are injected into the system prompt so the AI references them when relevant. The AI proactively proposes `save-memory` when users teach it patterns (e.g., "always categorize Starbucks as Dining Out").
- **Actions**: `save-memory` (write, requires confirmation), `delete-memory` (write, requires confirmation), `list-memories` (read-only, auto-executes like other queries)
- **Max**: 100 memories per budget (oldest dropped when limit reached) to keep context window manageable.
- **localStorage key**: `actual-budget-chat-memories:<budget-fingerprint>`

### Chat State

- Messages persist in a session store (`chatState.ts`) — closing and reopening the panel preserves conversation history within the session
- State is module-level (not localStorage), so it resets on page reload
- Goals and memories persist across sessions via localStorage (scoped per budget file)

### Configuration

- API key is stored in `LocalPrefs['ai.apiKey']` (device-local, not synced)
- Optional custom endpoint URL in `LocalPrefs['ai.endpointUrl']` for OpenRouter, Azure OpenAI, local models, or any OpenAI-compatible endpoint
- Optional custom model name in `LocalPrefs['ai.modelName']` (defaults to `gpt-4o-mini`)
- OpenRouter headers (`HTTP-Referer`, `X-Title`) are auto-added when endpoint contains `openrouter.ai`
- Set via Settings > AI Assistant section
- No backend proxy needed — calls go directly to the API from the browser

## Deployment (with Sync Server)

Production deployment runs the full Actual Budget sync server, enabling:

- Multi-device sync
- Bank syncing (GoCardless, SimpleFIN)
- Password-protected access
- Server-side budget file storage

### Build & Serve

- **Build**: `bash build-prod.sh` — builds frontend + loot-core + sync server
- **Serve**: `node serve-prod.js` — launches the sync server which serves both the API and frontend
- **Data dir**: `/home/runner/actual-data/` (server-files, user-files)
- **Port**: Uses `PORT` env var (Replit sets this automatically)

### Sync Server Details

- Express app at `packages/sync-server/`
- In production mode, serves the frontend static files from `@actual-app/web` build directory
- Sets required security headers (COOP, COEP, CSP)
- Auth: password-based by default (set password on first visit)
- Config via env vars: `ACTUAL_DATA_DIR`, `ACTUAL_PORT`, `ACTUAL_HOSTNAME`, `ACTUAL_LOGIN_METHOD`

### Fly.io Deployment

For distributing to end users, deploy via Fly.io (follows official Actual Budget Fly.io docs pattern):

1. Install flyctl and login:
   - macOS: `curl -L https://fly.io/install.sh | sh`
   - Windows: `iwr https://fly.io/install.ps1 -useb | iex`
   - Then: `fly auth login`

2. From the project root (where fly.toml lives), launch the app:

   ```
   fly launch
   ```

   - Say `y` to use existing fly.toml config
   - This creates the app, volume, and deploys in one step

3. To update after code changes:
   ```
   fly deploy
   ```

Key difference from official docs: Official uses `--image actualbudget/actual-server:latest` (pre-built).
Our fork builds from source via the root `Dockerfile` (includes AI chat feature).

Files:

- `Dockerfile` — Multi-stage production build (deps → build frontend + sync server → minimal runtime)
- `Dockerfile.dev` — Development container (used by docker-compose.yml)
- `fly.toml` — Fly.io config (matches official template, uses default Dockerfile)
- `.dockerignore` — Keeps Docker build context small

## CI / Code Quality Rules (IMPORTANT)

This is a fork of `actualbudget/actual`. GitHub Actions CI runs automatically on every push. To keep CI green and avoid merge conflicts when pulling from upstream:

### Formatting (oxfmt)

- **Tool**: `oxfmt` (Oxc formatter) — NOT Prettier
- **Check**: `yarn lint` runs `oxfmt --check .` first
- **Fix**: `yarn lint:fix` or `npx oxfmt <file>`
- **ALWAYS run `npx oxfmt <files>` on any file you create or modify before committing**

### Linting (oxlint)

- **Tool**: `oxlint` with type-aware mode
- **Check**: `yarn lint` runs `oxlint --type-aware --quiet` after formatting
- **Fix**: `yarn lint:fix` or manually fix reported issues

### TypeScript

- **Check**: `yarn typecheck` runs `tsgo` + `lage typecheck` across all packages
- **Strict typing**: Use `as const` for literal values when needed (e.g., `allowedHosts: true as const`)
- **Never use `any` type** — use proper types or `unknown` with type guards

### .gitignore

- `.agents/`, `.local/`, `.cache/`, `attached_assets/` are gitignored (Replit system files)
- These must NEVER be committed — they cause formatting failures in CI
- `fly.toml` IS tracked (deployment config, no secrets)

### Before Every Commit Checklist

1. Run `npx oxfmt <changed-files>` to format
2. Verify no Replit system files are staged (`git status` — no `.agents/`, `.local/`, `attached_assets/`)
3. For TypeScript changes, run `yarn typecheck` on the affected package

### Pulling from Upstream

- Remote: `origin` points to `Trillx/actual-custom` (fork)
- Upstream: `actualbudget/actual` (add as remote if needed: `git remote add upstream https://github.com/actualbudget/actual.git`)
- Pull: `git fetch upstream && git merge upstream/master`
- Our custom code is isolated to `packages/desktop-client/src/components/chat/` and a few integration points — merge conflicts should be minimal

## Notes

- The app is local-first — data is stored in browser IndexedDB AND synced to the server
- The sync server runs in production deployment, enabling multi-device access
- In development, only the frontend runs (no sync server) — data stays in browser only
- First startup takes ~30 seconds for the loot-core build and initial Vite compilation
- The yarn link step (during `yarn install`) takes a few seconds on first cold-boot but is instant on subsequent runs due to caching
