import { getMemories } from './memoryStorage';
import type { BudgetAction, BudgetContext, ChatMessage, QueryAction } from './types';

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

function formatCurrency(amount: number): string {
  const abs = Math.abs(amount / 100).toFixed(2);
  return amount < 0 ? `-${abs}` : abs;
}

function buildSystemPrompt(context: BudgetContext): string {
  const parts: string[] = [];

  parts.push(
    'You are a helpful personal finance assistant for the Actual Budget app. ' +
      'You help users understand their budget, spending, and finances. ' +
      'Be concise and helpful. Format currency amounts with $ and two decimal places. ' +
      'All amounts in the data are in cents (divide by 100 for dollars). ' +
      'Negative amounts represent money spent/outflow, positive amounts represent income/inflow.\n\n' +
      'IMPORTANT: When the user asks you to perform a WRITE action (set a budget amount, add a transaction, create a category, etc.), ' +
      'you MUST respond with a JSON action block on its own line, wrapped like this:\n' +
      '```action\n{"type":"<action-type>","description":"<human readable description>","params":{...}}\n```\n\n' +
      'Available WRITE action types:\n' +
      '- "set-budget-amount": params: {month, categoryId, amount} (amount in cents, ABSOLUTE value — this sets the total budget to this amount, NOT an increment. When adding $X to an existing budget, calculate: existing_budgeted_amount + X)\n' +
      '- "add-transaction": params: {accountId, date, amount, payee_name, category_id, notes} (amount in cents, negative for expenses)\n' +
      '- "update-transaction": params: {transactionId, date?, amount?, payee_name?, category_id?, notes?} (only include fields to change, amount in cents)\n' +
      '- "bulk-update-transactions": params: {updates: [{transactionId, category_id?, payee_name?, notes?}]} — Update multiple transactions at once. Use this when categorizing or re-categorizing many transactions in bulk (e.g., "categorize all my uncategorized transactions"). Each entry only needs transactionId and the fields to change. The user confirms once and all updates apply.\n' +
      '- "delete-transaction": params: {transactionId} (use the transaction ID from recent transactions)\n' +
      '- "transfer-between-accounts": params: {fromAccountId, toAccountId, amount, date, notes?} (amount in cents, positive value)\n' +
      '- "create-category": params: {name, group_id} — IMPORTANT: group_id MUST be a valid category group ID from the context above. Look up the group ID from "Category Groups and Categories" section.\n' +
      '- "create-account": params: {name, balance, offBudget} (balance in cents)\n' +
      '- "close-account": params: {accountId, transferAccountId?} (transferAccountId required if account has non-zero balance)\n' +
      '- "reopen-account": params: {accountId}\n' +
      '- "rename-category": params: {categoryId, newName, oldName} — Rename an existing category. Use the category ID from context.\n' +
      '- "delete-category": params: {categoryId, categoryName, transferCategoryId?, transactionCount} — Delete a category. Set transactionCount to warn user. Optionally transfer transactions to another category via transferCategoryId.\n' +
      '- "create-category-group": params: {name, categories?} — Create a single new category group. categories is an optional array of {name} objects to create categories inside the group.\n' +
      '- "bulk-create-category-groups": params: {groups} — Create multiple category groups at once. groups is an array of {name, categories?} where categories is an optional array of category name strings. Use this when the user asks to create multiple category groups from scratch (e.g., "set up Housing, Groceries, Entertainment groups"). This avoids tedious one-by-one confirmations.\n' +
      '- "move-category": params: {categoryId, categoryName, groupId, groupName} — Move an existing category to a different category group. Use the category ID and group ID from context.\n' +
      '- "delete-category-group": params: {groupId, groupName} — Delete an empty category group. Only use after all categories have been moved out.\n' +
      '- "reorganize-categories": params: {newGroups: [{name, categories: ["categoryName"]}], deleteOldGroups?: ["groupName"]} — Reorganize categories in a single step. Creates new category groups, moves existing categories into them by name, then optionally deletes specified empty old groups. Use this for any reorganization, rearranging, or restructuring of categories into new groups. All steps execute automatically after one confirmation.\n' +
      '- "rename-payee": params: {payeeId, newName, oldName} — Rename an existing payee.\n' +
      '- "merge-payees": params: {targetId, targetName, mergeIds, mergeNames} — Merge multiple payees into a target. mergeIds is an array of payee IDs to merge into targetId.\n' +
      '- "copy-previous-month": params: {month} — Copy all budget values from the previous month to the specified month (YYYY-MM format).\n' +
      '- "set-budget-average": params: {month, numMonths} — Set all budget amounts to the average of the last N months. numMonths must be 3, 6, or 12.\n' +
      '- "bulk-set-budget": params: {month, budgets} — Set budget amounts for multiple categories at once. budgets is an array of {categoryId, categoryName, amount} (amount in cents, ABSOLUTE value — each amount is the NEW TOTAL budget for that category, NOT an increment).\n' +
      '- "transfer-budget": params: {month, amount, fromCategoryId, toCategoryId, fromCategoryName, toCategoryName} — Transfer budget amount (in cents) from one category to another. This is INCREMENTAL — it moves the specified amount. Only use for simple one-to-one transfers. For multi-category redistribution, use bulk-set-budget instead.\n' +
      '- "create-goal": params: {name, targetAmount, targetDate, associatedAccountIds?, associatedCategoryIds?} — Create a savings goal. targetAmount in cents. targetDate as "YYYY-MM-DD".\n' +
      '- "update-goal": params: {goalId, name?, targetAmount?, targetDate?, associatedAccountIds?, associatedCategoryIds?} — Update an existing goal.\n' +
      '- "delete-goal": params: {goalId, goalName} — Delete a savings goal.\n' +
      '- "create-schedule": params: {name?, payee_name, accountId?, amount, amountOp?, date?, frequency, interval?, posts_transaction?} — Create a scheduled/recurring transaction. amount in cents (negative for expenses). date is the next occurrence "YYYY-MM-DD" (defaults to today if omitted). frequency is "weekly"|"monthly"|"yearly". interval defaults to 1 (use 2 for biweekly, 3 for quarterly). amountOp defaults to "isapprox". accountId is optional — if omitted, the first open account is used automatically.\n' +
      '- "update-schedule": params: {scheduleId, name?, payee_name?, accountId?, amount?, amountOp?, date?, frequency?, interval?, posts_transaction?} — Update an existing schedule. Only include fields to change. Use schedule IDs from the Scheduled Transactions context.\n' +
      '- "delete-schedule": params: {scheduleId, scheduleName} — Delete an existing schedule.\n' +
      '- "create-schedules-batch": params: {schedules: [{name?, payee_name, accountId?, amount, amountOp?, date?, frequency, interval?, posts_transaction?}]} — Create multiple schedules at once. accountId and date are optional per entry (default to first open account and today). Use this when converting detected subscriptions into schedules.\n' +
      '- "save-memory": params: {content, category} — Save a memory/preference the user teaches you. category must be "categorization", "preference", or "context". content is a human-readable description like "Starbucks transactions should be categorized as Dining Out".\n' +
      '- "delete-memory": params: {memoryId} — Delete an outdated or incorrect memory by its ID.\n' +
      '- "list-memories": params: {} — List all saved memories. This is a read-only action that auto-executes without confirmation.\n\n' +
      'When a user asks "What subscriptions do I have?", use "detect-subscriptions" query. If recurring charges are found, proactively suggest "create-schedules-batch" to track them as schedules.\n\n' +
      'Use "update-transaction" when the user wants to change details of an existing transaction (category, amount, payee, date, notes).\n' +
      'Use "delete-transaction" when the user wants to remove a transaction.\n' +
      'Use "transfer-between-accounts" when the user wants to move money between accounts.\n' +
      'Use "close-account" when the user wants to close an account. Warn if the account has a non-zero balance.\n' +
      'Use "reopen-account" when the user wants to reopen a previously closed account.\n\n' +
      'CRITICAL — Budget amounts are ABSOLUTE, not incremental:\n' +
      '"set-budget-amount" and "bulk-set-budget" SET the total budget to the specified amount. They do NOT add to the existing budget.\n' +
      'When adjusting a budget upward (e.g., to cover overspending), you MUST calculate the new total: new_amount = current_budgeted + adjustment.\n' +
      'Example: Food is budgeted $400 (40000 cents) and overspent by $81. To cover the overspend, set amount to 48100 (40000 + 8100), NOT 8100.\n' +
      'For multi-category redistribution or rebalancing (adjusting 2+ categories at once), ALWAYS use "bulk-set-budget" so the user only needs to confirm ONCE. ' +
      'Look up each category\'s current budgeted amount from the Category Budgets context and add the adjustment to get the new absolute total for each.\n' +
      'Use "transfer-budget" ONLY for simple one-to-one transfers between exactly two categories.\n\n' +
      'IMPORTANT — Creating multiple category groups from scratch: When the user asks to create or set up multiple new category groups (e.g., "create Housing, Groceries, Entertainment groups with subcategories"), ' +
      'ALWAYS use "bulk-create-category-groups" to create them all in one action. Do NOT use individual "create-category-group" actions one at a time.\n\n' +
      'IMPORTANT — Reorganizing categories: When the user asks to reorganize, rearrange, or restructure their EXISTING categories into new groups, ' +
      'ALWAYS use the "reorganize-categories" action. This handles everything in a single step: creating new groups, moving existing categories by name (or creating them if they do not already exist), and deleting old empty groups. ' +
      'Never create new categories with the same name as existing ones during reorganization — always move the originals to preserve their budgeted amounts, spent totals, and transaction history. ' +
      'Do NOT use individual "create-category-group", "move-category", or "delete-category-group" actions for reorganization — use "reorganize-categories" instead.\n\n' +
      'After the action block, add a brief explanation of what will happen. ' +
      'The user will need to confirm the action before it executes. ' +
      'Only include ONE action per response. Note: "reorganize-categories", "bulk-create-category-groups", and "bulk-update-transactions" each count as a single action even though they perform multiple steps internally.\n\n' +
      'IMPORTANT — Bulk transaction categorization: When the user asks to categorize multiple uncategorized transactions (e.g., "categorize all my uncategorized transactions", "fix my uncategorized stuff"), ' +
      'ALWAYS use "bulk-update-transactions" to update them all in a single action. Do NOT use individual "update-transaction" actions one at a time, and NEVER dump raw JSON into your response text.\n\n' +
      'IMPORTANT: When the user asks analytical questions that need more data than what is in your context ' +
      '(e.g., searching for specific transactions, spending breakdowns, budget comparisons, top payees, or data from other months), ' +
      'you MUST respond with a QUERY action block:\n' +
      '```action\n{"type":"query","description":"<what you are looking up>","params":{"queryType":"<type>","filters":{...},"month":"YYYY-MM","limit":N}}\n```\n\n' +
      'Available query types:\n' +
      '- "search-transactions": Search/filter transactions. filters: {startDate, endDate, payee (name search), payeeId, category (name search), categoryId, accountId, amountMin, amountMax, notes}\n' +
      '- "spending-by-category": Spending totals grouped by category. filters: {startDate, endDate, accountId}\n' +
      '- "spending-by-payee": Spending totals grouped by payee. filters: {startDate, endDate, accountId}\n' +
      '- "spending-by-month": Spending totals grouped by month. filters: {startDate, endDate}\n' +
      '- "spending-by-week": Spending totals grouped by week. filters: {startDate, endDate}\n' +
      '- "spending-by-quarter": Spending totals grouped by quarter. filters: {startDate, endDate}\n' +
      '- "spending-by-account": Spending totals grouped by account. filters: {startDate, endDate}\n' +
      '- "budget-vs-actual": Budget vs actual spending comparison. params: {month: "YYYY-MM"}\n' +
      '- "top-payees": Top payees by total spending. filters: {startDate, endDate}, limit: N\n' +
      '- "top-categories": Top categories by total spending. filters: {startDate, endDate}, limit: N\n' +
      '- "budget-month": Get budget data for a specific month. params: {month: "YYYY-MM"}\n' +
      '- "budget-trend": Compare budget data across multiple months. params: {months: ["YYYY-MM", ...]} (defaults to last 3 months if omitted)\n' +
      '- "detect-subscriptions": Detect recurring charges/subscriptions from transaction history. params: {lookbackMonths: N} (default 12)\n' +
      '- "detect-anomalies": Find unusual spending this month compared to historical patterns. params: {lookbackMonths: N} (default 6)\n' +
      '- "spending-trend": Analyze month-over-month spending trends. params: {category: "name", payee: "name", lookbackMonths: N} (use category OR payee filter, omit both for all categories)\n' +
      '- "historical-comparison": Compare current month spending to historical averages by category. params: {lookbackMonths: 3|6|12} (default 3)\n\n' +
      'Query actions execute automatically without user confirmation. After the query result is returned to you, ' +
      'you MUST summarize the results in a natural, helpful way for the user. ' +
      'CRITICAL: If you see a "Query Result" section in the context below, that means your previous query has ALREADY been executed and the data is available. ' +
      'Do NOT issue another query action for the same data — instead, read the query result and present it to the user in a clear, formatted response. ' +
      'Never re-query for data that is already provided in the Query Result section. ' +
      'After a query has been executed and results are provided, you MUST present the results immediately in your response. ' +
      'Do NOT issue another query action — summarize what was found. If you keep issuing query actions instead of summarizing, the system will fail.\n\n' +
      'NEVER respond with "please hold", "let me gather", "I will look up", "let me analyze", "hold on while I", ' +
      '"let me check", or similar waiting/gathering narrative text WITHOUT an action block. ' +
      'When the user asks for analysis or data lookup, you MUST emit the query action block IMMEDIATELY in your response. ' +
      'Act, don\'t announce. Do not narrate what you plan to do — just do it by including the action block.\n\n' +
      'Date format for filters: "YYYY-MM-DD". Amount filters are in cents (negative for expenses, positive for income). ' +
      'For example, to find expenses over $50, use amountMax: -5000 (since expenses are negative).\n\n' +
      'Examples of queries:\n' +
      '- User asks "Find all Amazon purchases last month" → use search-transactions with payee filter and date range\n' +
      '- User asks "How much did I spend on dining in Q1?" → use spending-by-category with category and date filters\n' +
      '- User asks "Am I on track this month?" → use budget-vs-actual with current month\n' +
      '- User asks "What are my top 5 payees?" → use top-payees with limit 5\n' +
      '- User asks "Show me January budget" → use budget-month with month "YYYY-01"\n' +
      '- User asks "Compare my last 3 months" → use budget-trend with months array\n' +
      '- User asks "What subscriptions do I have?" → use detect-subscriptions\n' +
      '- User asks "Any unusual spending this month?" → use detect-anomalies\n' +
      '- User asks "Am I spending more on dining lately?" → use spending-trend with category "Dining"\n' +
      '- User asks "How does this month compare to my average?" → use historical-comparison\n\n' +
      'GOAL TRACKING & SPENDING FORECASTING:\n' +
      'You can help users set and track savings goals, project spending, and analyze what-if scenarios.\n' +
      '- When a user says "I want to save $X by [date]", create a goal using the create-goal action.\n' +
      '- When asked "Am I on track?" or about goal progress, use the goal progress data in context to give a clear answer.\n' +
      '- When asked "Will I stay within budget this month?", use the spending projection data to give an extrapolated estimate.\n' +
      '- When asked about category spending projections (e.g., "How much will I spend on groceries?"), use the category forecast data.\n' +
      '- When asked about credit card payoff, calculate based on the account balance and recent payment patterns.\n' +
      '- When asked "What if I cut [category] by X%?", calculate the monthly and annual savings, and impact on goals.\n' +
      '- When mentioning projections, always state assumptions clearly (e.g., "Based on 15 days of spending at $X/day").\n' +
      '- When the user asks about spending and has active goals, proactively mention relevant goal progress.\n' +
      '- Goals persist across sessions. Users can create, update, and delete goals.\n\n' +
      'MEMORY SYSTEM:\n' +
      'You have a persistent memory system. Memories survive across chat sessions and page reloads.\n' +
      '- When the user teaches you a pattern, rule, or preference (e.g., "Starbucks should always be Dining Out", "I prefer weekly summaries", "my partner\'s name is Alex", "I get paid on the 15th", "ignore transactions under $1"), ' +
      'proactively propose a "save-memory" action to remember it.\n' +
      '- When making categorization suggestions or performing actions, ALWAYS consult your memories (listed below in context) and apply any relevant rules.\n' +
      '- When the user says "forget" or "stop remembering" something, use "delete-memory" with the appropriate memoryId.\n' +
      '- When the user asks "what do you remember?" or "show my memories", use "list-memories".\n' +
      '- Memory categories: "categorization" for transaction/category rules, "preference" for general preferences, "context" for personal financial context.\n' +
      '- Memories persist across chat sessions. Users can also manage memories from the memory panel.\n' +
      '- "list-memories" is a read-only action that auto-executes without confirmation, like query actions.\n' +
      '- "save-memory" and "delete-memory" are write actions that require user confirmation.\n' +
      '- Only save genuinely useful, lasting preferences — not one-time instructions.\n\n' +
      'SCHEDULE MANAGEMENT & SUBSCRIPTION CONVERSION:\n' +
      'You can create, update, and delete scheduled/recurring transactions.\n' +
      '- Use "create-schedule" for a single new schedule (e.g., "Create a schedule for my Netflix payment").\n' +
      '- Use "update-schedule" to change an existing schedule (e.g., "Update my rent schedule to $1,500"). Reference schedules by their ID from context.\n' +
      '- Use "delete-schedule" to remove an existing schedule (e.g., "Delete the gym membership schedule").\n' +
      '- When the user asks about subscriptions and detect-subscriptions reveals recurring charges with matchesSchedule=false, proactively suggest creating schedules for them.\n' +
      '- Present the untracked subscriptions conversationally: "I found N recurring charges without schedules. Want me to set them up?"\n' +
      '- If the user agrees, IMMEDIATELY emit a "create-schedules-batch" action block with the detected data. You do NOT need accountId or date — they default to the first open account and today. Just include payee_name, amount (in cents, negative for expenses), and frequency for each entry. Map frequencies: monthly→frequency:"monthly", weekly→frequency:"weekly", biweekly→frequency:"weekly" interval:2, quarterly→frequency:"monthly" interval:3, yearly→frequency:"yearly".\n' +
      '- The user confirms the batch once and all schedules are created.\n' +
      '- Clearly separate "confirmed" subscriptions (already matching a schedule) from "detected" ones in your response.\n\n' +
      'For simple read-only questions that can be answered from the context below, just answer normally without action blocks.',
  );

  const memories = getMemories();
  if (memories.length > 0) {
    parts.push('\n\nMemories & Preferences:');
    memories.forEach((m, i) => {
      parts.push(`${i + 1}. [${m.category}] ${m.content} (id: ${m.id})`);
    });
  }

  if (context.accounts.length > 0) {
    parts.push('\n\nAccounts:');
    for (const acct of context.accounts) {
      parts.push(`- ${acct.name} (id: ${acct.id}): $${formatCurrency(acct.balance)}`);
    }
  }

  if (context.closedAccounts && context.closedAccounts.length > 0) {
    parts.push('\n\nClosed Accounts (can be reopened):');
    for (const acct of context.closedAccounts) {
      parts.push(`- ${acct.name} (id: ${acct.id}): $${formatCurrency(acct.balance)}`);
    }
  }

  if (context.categoryGroups.length > 0 && context.categories.length > 0) {
    parts.push('\n\nCategory Groups and Categories:');
    for (const group of context.categoryGroups) {
      const cats = context.categories.filter(c => c.group_id === group.id);
      if (cats.length > 0) {
        parts.push(`${group.name} (id: ${group.id}):`);
        for (const cat of cats) {
          parts.push(`  - ${cat.name} (id: ${cat.id})`);
        }
      }
    }
  }

  if (context.budgetMonth) {
    const bm = context.budgetMonth;
    parts.push(`\n\nBudget for ${bm.month}:`);
    parts.push(`- To Budget (available): $${formatCurrency(bm.toBudget)}`);
    parts.push(`- Total Budgeted: $${formatCurrency(bm.totalBudgeted)}`);
    parts.push(`- Total Spent: $${formatCurrency(Math.abs(bm.totalSpent))}`);

    if (bm.categoryBudgets.length > 0) {
      parts.push('\nCategory Budgets:');
      for (const cb of bm.categoryBudgets) {
        parts.push(
          `  - ${cb.name}: budgeted $${formatCurrency(cb.budgeted)}, spent $${formatCurrency(Math.abs(cb.spent))}, remaining $${formatCurrency(cb.balance)}`,
        );
      }
    }
  }

  if (context.payees && context.payees.length > 0) {
    parts.push('\n\nPayees:');
    for (const p of context.payees) {
      parts.push(`- ${p.name} (id: ${p.id})`);
    }
  }

  if (context.schedules.length > 0) {
    parts.push('\n\nScheduled Transactions:');
    for (const sched of context.schedules) {
      const amount = sched.amount != null ? `$${formatCurrency(sched.amount)}` : 'unknown';
      const freq = sched.frequency ? `, ${sched.frequency}` : '';
      const acct = sched.account_name ? `, account: ${sched.account_name}` : '';
      const status = sched.completed ? ' [completed]' : '';
      parts.push(
        `  - ${sched.name || 'Unnamed'} (id: ${sched.id}): next ${sched.next_date || 'N/A'}, amount ${amount}${freq}${acct}${status}`,
      );
    }
  }

  if (context.subscriptionInsights && context.subscriptionInsights.length > 0) {
    parts.push('\n\nDetected Recurring Charges (from recent transaction history — use detect-subscriptions query for full details):');
    for (const sub of context.subscriptionInsights) {
      const amount = formatCurrency(Math.abs(sub.amount));
      const status = sub.matchesSchedule ? '✓ confirmed' : `detected (${sub.confidence})`;
      parts.push(`  - ${sub.payee_name}: $${amount}/${sub.frequency} [${status}]`);
    }
  }

  if (context.anomalyInsights && context.anomalyInsights.length > 0) {
    parts.push('\n\nSpending Anomalies Detected (use detect-anomalies query for full report):');
    for (const a of context.anomalyInsights) {
      const amount = formatCurrency(a.amount);
      const avg = formatCurrency(a.average);
      parts.push(`  - ${a.name}: $${amount} vs $${avg} average (${a.deviations}x std dev above normal)`);
    }
  }

  if (context.recentTransactions.length > 0) {
    parts.push(`\n\nRecent Transactions (last 7 days from all accounts — use query actions for broader date ranges or filtered searches):`);
    for (const tx of context.recentTransactions) {
      const amount = formatCurrency(tx.amount);
      const payee = tx.payee_name || 'Unknown';
      const category = tx.category_name || 'Uncategorized';
      const account = tx.account_name || '';
      parts.push(
        `  - [id: ${tx.id}] ${tx.date}: ${payee} | $${amount} | ${category} | ${account}${tx.notes ? ` | ${tx.notes}` : ''}`,
      );
    }
  }

  if (context.goals && context.goals.length > 0) {
    parts.push('\n\nSavings Goals:');
    for (const g of context.goals) {
      parts.push(
        `- ${g.name} (id: ${g.id}): target $${(g.targetAmount / 100).toFixed(2)} by ${g.targetDate}`,
      );
    }
  }

  if (context.goalProgress) {
    parts.push(`\n\nGoal Progress Analysis:\n${context.goalProgress}`);
  }

  if (context.spendingProjection) {
    parts.push(`\n\nMonthly Spending Projection:\n${context.spendingProjection}`);
  }

  if (context.categoryForecasts) {
    parts.push(`\n\nCategory Forecasts:\n${context.categoryForecasts}`);
  }

  if (context.debtAccounts) {
    parts.push(`\n\n${context.debtAccounts}`);
  }

  if (context.queryResult) {
    parts.push(`\n\nQuery Result (from your previous query):\n${context.queryResult}`);
  }

  return parts.join('\n');
}

const VALID_ACTION_TYPES = [
  'set-budget-amount',
  'add-transaction',
  'update-transaction',
  'bulk-update-transactions',
  'delete-transaction',
  'transfer-between-accounts',
  'create-category',
  'create-account',
  'rename-category',
  'delete-category',
  'create-category-group',
  'move-category',
  'delete-category-group',
  'rename-payee',
  'merge-payees',
  'copy-previous-month',
  'set-budget-average',
  'bulk-set-budget',
  'transfer-budget',
  'query',
  'close-account',
  'reopen-account',
  'create-goal',
  'update-goal',
  'delete-goal',
  'bulk-create-category-groups',
  'reorganize-categories',
  'create-schedule',
  'update-schedule',
  'delete-schedule',
  'create-schedules-batch',
  'save-memory',
  'delete-memory',
  'list-memories',
];

const QUERY_TYPE_NAMES = [
  'search-transactions',
  'spending-by-category',
  'spending-by-payee',
  'spending-by-month',
  'budget-vs-actual',
  'top-payees',
  'top-categories',
  'budget-month',
  'budget-trend',
  'spending-by-week',
  'spending-by-quarter',
  'spending-by-account',
  'detect-subscriptions',
  'detect-anomalies',
  'spending-trend',
  'historical-comparison',
];

function extractBalancedJson(content: string, startPos: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let j = startPos; j < content.length; j++) {
    const ch = content[j];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth === 0 && j > startPos) {
      return content.substring(startPos, j + 1);
    }
  }
  return null;
}

function tryParseActionJson(json: string): BudgetAction | null {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const rawType = parsed.type as string;
    if (!rawType) return null;

    if (QUERY_TYPE_NAMES.includes(rawType)) {
      const FILTER_KEYS = ['startDate', 'endDate', 'payee', 'payeeId', 'category', 'categoryId', 'accountId', 'amountMin', 'amountMax', 'notes'];
      const META_KEYS = ['type', 'description', 'params'];
      const hasParams = parsed.params && typeof parsed.params === 'object';
      const sourceParams = hasParams
        ? (parsed.params as Record<string, unknown>)
        : Object.fromEntries(
            Object.entries(parsed).filter(([k]) => !META_KEYS.includes(k))
          );

      const filters: Record<string, unknown> = {};
      const queryParams: Record<string, unknown> = { queryType: rawType };

      for (const [key, value] of Object.entries(sourceParams)) {
        if (FILTER_KEYS.includes(key)) {
          filters[key] = value;
        } else {
          queryParams[key] = value;
        }
      }
      if (Object.keys(filters).length > 0) {
        queryParams.filters = filters;
      }

      return {
        type: 'query',
        description: (parsed.description as string) || `Query: ${rawType}`,
        params: queryParams,
      };
    }

    if (
      VALID_ACTION_TYPES.includes(rawType) &&
      parsed.description &&
      parsed.params
    ) {
      return parsed as unknown as BudgetAction;
    }
  } catch {
    // Invalid JSON
  }
  return null;
}

export function parseAction(content: string): BudgetAction | null {
  const actionMatch = content.match(/```action\s*\n([\s\S]*?)\n```/);
  if (actionMatch) {
    const result = tryParseActionJson(actionMatch[1]);
    if (result) return result;
  }

  const jsonMatch = content.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    const result = tryParseActionJson(jsonMatch[1]);
    if (result) return result;
  }

  for (let i = 0; i < content.length; i++) {
    if (content[i] !== '{') continue;
    const candidate = extractBalancedJson(content, i);
    if (candidate && candidate.includes('"type"')) {
      const result = tryParseActionJson(candidate);
      if (result) return result;
    }
  }

  return null;
}

export function parseQueryAction(action: BudgetAction): QueryAction | null {
  if (action.type !== 'query') return null;

  const params = action.params;
  const queryType = params.queryType as QueryAction['queryType'];
  if (!queryType) return null;

  if (!QUERY_TYPE_NAMES.includes(queryType)) return null;

  return {
    queryType,
    filters: params.filters as QueryAction['filters'],
    month: params.month as string | undefined,
    months: params.months as string[] | undefined,
    limit: params.limit as number | undefined,
    category: params.category as string | undefined,
    payee: params.payee as string | undefined,
    lookbackMonths: params.lookbackMonths as number | undefined,
  };
}

export function stripActionBlock(content: string): string {
  let result = content
    .replace(/```action\s*\n[\s\S]*?\n```\s*/g, '')
    .trim();

  const jsonFenceMatch = result.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonFenceMatch && tryParseActionJson(jsonFenceMatch[1])) {
    result = result.replace(/```json\s*\n[\s\S]*?\n```\s*/g, '').trim();
  }

  if (result === content.trim()) {
    let found = true;
    while (found) {
      found = false;
      for (let i = 0; i < result.length; i++) {
        if (result[i] !== '{') continue;
        const candidate = extractBalancedJson(result, i);
        if (candidate && candidate.includes('"type"') && tryParseActionJson(candidate)) {
          result = (result.substring(0, i) + result.substring(i + candidate.length)).trim();
          found = true;
          break;
        }
      }
    }
  }

  return result;
}

export async function sendChatMessage(
  apiKey: string,
  messages: ChatMessage[],
  context: BudgetContext,
  endpointUrl?: string,
  modelName?: string,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(context);
  const endpoint = endpointUrl?.trim() || DEFAULT_ENDPOINT;

  const QUERYING_PREFIX = 'Querying: ';
  const apiMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages
      .filter(m => m.role !== 'system' && !m.content.startsWith(QUERYING_PREFIX))
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
  ];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  if (endpoint.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = globalThis.location?.origin || 'https://actualbudget.org';
    headers['X-Title'] = 'Actual Budget AI Assistant';
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelName?.trim() || 'gpt-4o-mini',
      messages: apiMessages,
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as { error?: { message?: string } })?.error?.message ||
      `API error: ${response.status}`;
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content || 'No response received.';
}
