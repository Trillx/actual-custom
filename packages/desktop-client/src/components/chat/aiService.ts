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
      '- "set-budget-amount": params: {month, categoryId, amount} (amount in cents)\n' +
      '- "add-transaction": params: {accountId, date, amount, payee_name, category_id, notes} (amount in cents, negative for expenses)\n' +
      '- "update-transaction": params: {transactionId, date?, amount?, payee_name?, category_id?, notes?} (only include fields to change, amount in cents)\n' +
      '- "delete-transaction": params: {transactionId} (use the transaction ID from recent transactions)\n' +
      '- "transfer-between-accounts": params: {fromAccountId, toAccountId, amount, date, notes?} (amount in cents, positive value)\n' +
      '- "create-category": params: {name, group_id}\n' +
      '- "create-account": params: {name, balance, offBudget} (balance in cents)\n' +
      '- "close-account": params: {accountId, transferAccountId?} (transferAccountId required if account has non-zero balance)\n' +
      '- "reopen-account": params: {accountId}\n' +
      '- "rename-category": params: {categoryId, newName, oldName} — Rename an existing category. Use the category ID from context.\n' +
      '- "delete-category": params: {categoryId, categoryName, transferCategoryId?, transactionCount} — Delete a category. Set transactionCount to warn user. Optionally transfer transactions to another category via transferCategoryId.\n' +
      '- "create-category-group": params: {name, categories?} — Create a new category group. categories is an optional array of {name} objects to create categories inside the group.\n' +
      '- "rename-payee": params: {payeeId, newName, oldName} — Rename an existing payee.\n' +
      '- "merge-payees": params: {targetId, targetName, mergeIds, mergeNames} — Merge multiple payees into a target. mergeIds is an array of payee IDs to merge into targetId.\n' +
      '- "copy-previous-month": params: {month} — Copy all budget values from the previous month to the specified month (YYYY-MM format).\n' +
      '- "set-budget-average": params: {month, numMonths} — Set all budget amounts to the average of the last N months. numMonths must be 3, 6, or 12.\n' +
      '- "bulk-set-budget": params: {month, budgets} — Set budget amounts for multiple categories at once. budgets is an array of {categoryId, categoryName, amount} (amount in cents).\n' +
      '- "transfer-budget": params: {month, amount, fromCategoryId, toCategoryId, fromCategoryName, toCategoryName} — Transfer budget amount (in cents) from one category to another.\n\n' +
      'Use "update-transaction" when the user wants to change details of an existing transaction (category, amount, payee, date, notes).\n' +
      'Use "delete-transaction" when the user wants to remove a transaction.\n' +
      'Use "transfer-between-accounts" when the user wants to move money between accounts.\n' +
      'Use "close-account" when the user wants to close an account. Warn if the account has a non-zero balance.\n' +
      'Use "reopen-account" when the user wants to reopen a previously closed account.\n\n' +
      'After the action block, add a brief explanation of what will happen. ' +
      'The user will need to confirm the action before it executes. ' +
      'Only include ONE action per response.\n\n' +
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
      '- "budget-trend": Compare budget data across multiple months. params: {months: ["YYYY-MM", ...]} (defaults to last 3 months if omitted)\n\n' +
      'Query actions execute automatically without user confirmation. After the query result is returned to you, ' +
      'summarize the results in a natural, helpful way for the user.\n\n' +
      'Date format for filters: "YYYY-MM-DD". Amount filters are in cents (negative for expenses, positive for income). ' +
      'For example, to find expenses over $50, use amountMax: -5000 (since expenses are negative).\n\n' +
      'Examples of queries:\n' +
      '- User asks "Find all Amazon purchases last month" → use search-transactions with payee filter and date range\n' +
      '- User asks "How much did I spend on dining in Q1?" → use spending-by-category with category and date filters\n' +
      '- User asks "Am I on track this month?" → use budget-vs-actual with current month\n' +
      '- User asks "What are my top 5 payees?" → use top-payees with limit 5\n' +
      '- User asks "Show me January budget" → use budget-month with month "YYYY-01"\n' +
      '- User asks "Compare my last 3 months" → use budget-trend with months array\n\n' +
      'For simple read-only questions that can be answered from the context below, just answer normally without action blocks.',
  );

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
      parts.push(
        `  - ${sched.name || 'Unnamed'}: next ${sched.next_date || 'N/A'}, amount ${amount}`,
      );
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

  if (context.queryResult) {
    parts.push(`\n\nQuery Result (from your previous query):\n${context.queryResult}`);
  }

  return parts.join('\n');
}

export function parseAction(content: string): BudgetAction | null {
  const actionMatch = content.match(/```action\s*\n([\s\S]*?)\n```/);
  if (!actionMatch) return null;

  try {
    const parsed = JSON.parse(actionMatch[1]) as BudgetAction;
    if (
      parsed.type &&
      parsed.description &&
      parsed.params &&
      [
        'set-budget-amount',
        'add-transaction',
        'update-transaction',
        'delete-transaction',
        'transfer-between-accounts',
        'create-category',
        'create-account',
        'rename-category',
        'delete-category',
        'create-category-group',
        'rename-payee',
        'merge-payees',
        'copy-previous-month',
        'set-budget-average',
        'bulk-set-budget',
        'transfer-budget',
        'query',
        'close-account',
        'reopen-account',
      ].includes(parsed.type)
    ) {
      return parsed;
    }
  } catch {
    // Invalid JSON in action block
  }
  return null;
}

export function parseQueryAction(action: BudgetAction): QueryAction | null {
  if (action.type !== 'query') return null;

  const params = action.params;
  const queryType = params.queryType as QueryAction['queryType'];
  if (!queryType) return null;

  const validTypes = [
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
  ];
  if (!validTypes.includes(queryType)) return null;

  return {
    queryType,
    filters: params.filters as QueryAction['filters'],
    month: params.month as string | undefined,
    months: params.months as string[] | undefined,
    limit: params.limit as number | undefined,
  };
}

export function stripActionBlock(content: string): string {
  return content.replace(/```action\s*\n[\s\S]*?\n```\s*/g, '').trim();
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

  const apiMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages
      .filter(m => m.role !== 'system')
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
      max_tokens: 1024,
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
