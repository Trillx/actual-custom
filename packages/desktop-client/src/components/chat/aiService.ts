import type { BudgetContext, ChatMessage } from './types';

function formatCurrency(amount: number): string {
  return (amount / 100).toFixed(2);
}

function buildSystemPrompt(context: BudgetContext): string {
  const parts: string[] = [];

  parts.push(
    'You are a helpful personal finance assistant for the Actual Budget app. ' +
      'You help users understand their budget, spending, and finances. ' +
      'Be concise and helpful. Format currency amounts with $ and two decimal places. ' +
      'All amounts in the data are in cents (divide by 100 for dollars). ' +
      'Negative amounts represent money spent/outflow, positive amounts represent income/inflow.',
  );

  if (context.accounts.length > 0) {
    parts.push('\n\nAccounts:');
    for (const acct of context.accounts) {
      parts.push(`- ${acct.name}: $${formatCurrency(acct.balance)}`);
    }
  }

  if (context.categoryGroups.length > 0 && context.categories.length > 0) {
    parts.push('\n\nCategory Groups and Categories:');
    for (const group of context.categoryGroups) {
      const cats = context.categories.filter(c => c.group_id === group.id);
      if (cats.length > 0) {
        parts.push(`${group.name}:`);
        for (const cat of cats) {
          parts.push(`  - ${cat.name}`);
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

export async function sendChatMessage(
  apiKey: string,
  messages: ChatMessage[],
  context: BudgetContext,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(context);

  const apiMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
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
