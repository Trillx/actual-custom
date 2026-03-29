import type { BudgetAction, BudgetContext, ChatMessage } from './types';

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
      'IMPORTANT: When the user asks you to perform an action (set a budget amount, add a transaction, create a category, etc.), ' +
      'you MUST respond with a JSON action block on its own line, wrapped like this:\n' +
      '```action\n{"type":"<action-type>","description":"<human readable description>","params":{...}}\n```\n\n' +
      'Available action types:\n' +
      '- "set-budget-amount": params: {month, categoryId, amount} (amount in cents)\n' +
      '- "add-transaction": params: {accountId, date, amount, payee_name, category_id, notes} (amount in cents, negative for expenses)\n' +
      '- "create-category": params: {name, group_id}\n' +
      '- "create-account": params: {name, balance, offBudget} (balance in cents)\n\n' +
      'After the action block, add a brief explanation of what will happen. ' +
      'The user will need to confirm the action before it executes. ' +
      'Only include ONE action per response. For read-only questions, just answer normally without action blocks.',
  );

  if (context.accounts.length > 0) {
    parts.push('\n\nAccounts:');
    for (const acct of context.accounts) {
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
    parts.push('\n\nRecent Transactions (last 30):');
    for (const tx of context.recentTransactions.slice(0, 30)) {
      const amount = formatCurrency(tx.amount);
      const payee = tx.payee_name || 'Unknown';
      const category = tx.category_name || 'Uncategorized';
      const account = tx.account_name || '';
      parts.push(
        `  - ${tx.date}: ${payee} | $${amount} | ${category} | ${account}${tx.notes ? ` | ${tx.notes}` : ''}`,
      );
    }
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
        'create-category',
        'create-account',
      ].includes(parsed.type)
    ) {
      return parsed;
    }
  } catch {
    // Invalid JSON in action block
  }
  return null;
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
