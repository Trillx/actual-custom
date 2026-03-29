import { send } from 'loot-core/platform/client/connection';
import { q } from 'loot-core/shared/query';

import type {
  BudgetComparison,
  QueryAction,
  SpendingSummary,
  TransactionQueryFilters,
} from './types';

type ResolvedTransaction = {
  id: string;
  date: string;
  amount: number;
  payee_name?: string;
  category_name?: string;
  account_name?: string;
  notes?: string;
};

type LookupMaps = {
  payeeMap: Map<string, string>;
  categoryMap: Map<string, string>;
  accountMap: Map<string, string>;
};

function formatCurrency(amount: number): string {
  const abs = Math.abs(amount / 100).toFixed(2);
  return amount < 0 ? `-$${abs}` : `$${abs}`;
}

function getDateRange(filters?: TransactionQueryFilters): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  const endDate = filters?.endDate || now.toISOString().split('T')[0];
  const defaultStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const startDate = filters?.startDate || defaultStart.toISOString().split('T')[0];
  return { startDate, endDate };
}

function buildAqlFilter(filters: TransactionQueryFilters | undefined) {
  const conditions: Array<Record<string, unknown>> = [];
  if (!filters) return {};

  const { startDate, endDate } = getDateRange(filters);
  conditions.push({ date: { $gte: startDate } });
  conditions.push({ date: { $lte: endDate } });

  if (filters.accountId) {
    conditions.push({ account: filters.accountId });
  }
  if (filters.payeeId) {
    conditions.push({ payee: filters.payeeId });
  }
  if (filters.payee) {
    conditions.push({ 'payee.name': { $like: `%${filters.payee}%` } });
  }
  if (filters.categoryId) {
    conditions.push({ category: filters.categoryId });
  }
  if (filters.category) {
    conditions.push({ 'category.name': { $like: `%${filters.category}%` } });
  }
  if (filters.amountMin !== undefined) {
    conditions.push({ amount: { $gte: filters.amountMin } });
  }
  if (filters.amountMax !== undefined) {
    conditions.push({ amount: { $lte: filters.amountMax } });
  }
  if (filters.notes) {
    conditions.push({ notes: { $like: `%${filters.notes}%` } });
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
}

type RawTx = {
  id: string;
  date: string;
  amount: number;
  payee?: string;
  category?: string;
  account?: string;
  notes?: string;
};

const PAGE_SIZE = 500;

async function fetchFilteredTransactions(
  filters: TransactionQueryFilters | undefined,
  maps: LookupMaps,
  limit?: number,
): Promise<ResolvedTransaction[]> {
  const { startDate, endDate } = getDateRange(filters);

  const filterWithDates: TransactionQueryFilters = {
    ...filters,
    startDate,
    endDate,
  };
  const aqlFilter = buildAqlFilter(filterWithDates);

  const allData: RawTx[] = [];
  let currentOffset = 0;
  const fetchLimit = limit || 0;

  while (true) {
    const query = q('transactions')
      .filter(aqlFilter)
      .select('*')
      .orderBy({ date: 'desc' })
      .options({ splits: 'inline' })
      .limit(PAGE_SIZE)
      .offset(currentOffset);

    const { data } = (await send('api/query', {
      query: query.serialize(),
    })) as { data: RawTx[] };

    allData.push(...data);

    if (data.length < PAGE_SIZE) break;
    if (fetchLimit > 0 && allData.length >= fetchLimit) break;

    currentOffset += PAGE_SIZE;
  }

  const finalData = fetchLimit > 0 ? allData.slice(0, fetchLimit) : allData;

  return finalData.map(tx => ({
    id: tx.id,
    date: tx.date,
    amount: tx.amount,
    payee_name: tx.payee ? maps.payeeMap.get(tx.payee) : undefined,
    category_name: tx.category ? maps.categoryMap.get(tx.category) : undefined,
    account_name: tx.account ? maps.accountMap.get(tx.account) : undefined,
    notes: tx.notes || undefined,
  }));
}

function formatTransactionList(
  transactions: ResolvedTransaction[],
  limit = 50,
): string {
  const lines: string[] = [];
  const displayed = transactions.slice(0, limit);

  lines.push(
    `Found ${transactions.length} transactions${transactions.length > limit ? ` (showing first ${limit})` : ''}:\n`,
  );

  for (const tx of displayed) {
    const payee = tx.payee_name || 'Unknown';
    const category = tx.category_name || 'Uncategorized';
    const account = tx.account_name || '';
    const amount = formatCurrency(tx.amount);
    lines.push(
      `- ${tx.date}: ${payee} | ${amount} | ${category} | ${account}${tx.notes ? ` | ${tx.notes}` : ''}`,
    );
  }

  const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  lines.push(`\nTotal: ${formatCurrency(total)}`);

  return lines.join('\n');
}

function computeSpendingSummary(
  transactions: ResolvedTransaction[],
  groupBy: SpendingSummary['groupBy'],
  startDate: string,
  endDate: string,
): SpendingSummary {
  const groups = new Map<string, { total: number; count: number }>();

  for (const tx of transactions) {
    if (tx.amount >= 0) continue;

    let key: string;
    switch (groupBy) {
      case 'category':
        key = tx.category_name || 'Uncategorized';
        break;
      case 'payee':
        key = tx.payee_name || 'Unknown';
        break;
      case 'account':
        key = tx.account_name || 'Unknown';
        break;
      case 'month':
        key = tx.date.substring(0, 7);
        break;
      case 'week': {
        const d = new Date(tx.date);
        const day = d.getDay();
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - day);
        key = `Week of ${weekStart.toISOString().split('T')[0]}`;
        break;
      }
      case 'quarter': {
        const month = parseInt(tx.date.substring(5, 7), 10);
        const year = tx.date.substring(0, 4);
        const qtr = Math.ceil(month / 3);
        key = `${year} Q${qtr}`;
        break;
      }
    }

    const existing = groups.get(key) || { total: 0, count: 0 };
    existing.total += tx.amount;
    existing.count += 1;
    groups.set(key, existing);
  }

  const items = [...groups.entries()]
    .map(([name, data]) => ({
      name,
      total: data.total,
      count: data.count,
    }))
    .sort((a, b) => a.total - b.total);

  const grandTotal = items.reduce((sum, item) => sum + item.total, 0);

  return { groupBy, startDate, endDate, items, grandTotal };
}

function formatSpendingSummary(summary: SpendingSummary): string {
  const lines: string[] = [];
  lines.push(
    `Spending by ${summary.groupBy} (${summary.startDate} to ${summary.endDate}):\n`,
  );

  for (const item of summary.items) {
    const pct =
      summary.grandTotal !== 0
        ? ((item.total / summary.grandTotal) * 100).toFixed(1)
        : '0';
    lines.push(
      `- ${item.name}: ${formatCurrency(Math.abs(item.total))} (${item.count} transactions, ${pct}%)`,
    );
  }

  lines.push(
    `\nTotal spending: ${formatCurrency(Math.abs(summary.grandTotal))}`,
  );
  return lines.join('\n');
}

async function fetchBudgetComparison(
  month: string,
): Promise<BudgetComparison> {
  const bm = (await send('api/budget-month', { month })) as {
    totalBudgeted?: number;
    totalSpent?: number;
    categoryGroups?: Array<{
      name?: string;
      categories?: Array<{
        name?: string;
        budgeted?: number;
        spent?: number;
        balance?: number;
      }>;
    }>;
  };

  const categories: BudgetComparison['categories'] = [];
  let totalBudgeted = 0;
  let totalSpent = 0;

  if (bm.categoryGroups) {
    for (const group of bm.categoryGroups) {
      if (group.categories) {
        for (const cat of group.categories) {
          const budgeted = cat.budgeted ?? 0;
          const spent = Math.abs(cat.spent ?? 0);
          const remaining = budgeted - spent;
          const percentUsed =
            budgeted > 0 ? (spent / budgeted) * 100 : spent > 0 ? 100 : 0;

          let status: 'under' | 'on-track' | 'over' = 'under';
          if (percentUsed > 100) status = 'over';
          else if (percentUsed >= 75) status = 'on-track';

          totalBudgeted += budgeted;
          totalSpent += spent;

          categories.push({
            name: cat.name || 'Unknown',
            groupName: group.name,
            budgeted,
            spent,
            remaining,
            percentUsed: Math.round(percentUsed),
            status,
          });
        }
      }
    }
  }

  return { month, categories, totalBudgeted, totalSpent };
}

function formatBudgetComparison(comparison: BudgetComparison): string {
  const lines: string[] = [];
  lines.push(`Budget vs Actual for ${comparison.month}:\n`);

  const overBudget = comparison.categories.filter(c => c.status === 'over');
  const onTrack = comparison.categories.filter(c => c.status === 'on-track');
  const underBudget = comparison.categories.filter(
    c => c.status === 'under' && c.budgeted > 0,
  );

  if (overBudget.length > 0) {
    lines.push('OVER BUDGET:');
    for (const c of overBudget) {
      lines.push(
        `  ! ${c.name}: spent ${formatCurrency(c.spent)} of ${formatCurrency(c.budgeted)} budgeted (${c.percentUsed}%, ${formatCurrency(Math.abs(c.remaining))} over)`,
      );
    }
  }

  if (onTrack.length > 0) {
    lines.push('\nAPPROACHING BUDGET (75%+):');
    for (const c of onTrack) {
      lines.push(
        `  ~ ${c.name}: spent ${formatCurrency(c.spent)} of ${formatCurrency(c.budgeted)} budgeted (${c.percentUsed}%, ${formatCurrency(c.remaining)} left)`,
      );
    }
  }

  if (underBudget.length > 0) {
    lines.push('\nUNDER BUDGET:');
    for (const c of underBudget) {
      lines.push(
        `  * ${c.name}: spent ${formatCurrency(c.spent)} of ${formatCurrency(c.budgeted)} budgeted (${c.percentUsed}%, ${formatCurrency(c.remaining)} left)`,
      );
    }
  }

  lines.push(
    `\nOverall: spent ${formatCurrency(comparison.totalSpent)} of ${formatCurrency(comparison.totalBudgeted)} budgeted`,
  );

  return lines.join('\n');
}

async function fetchBudgetMonth(month: string): Promise<string> {
  const bm = (await send('api/budget-month', { month })) as {
    incomeAvailable?: number;
    totalBudgeted?: number;
    totalSpent?: number;
    toBudget?: number;
    categoryGroups?: Array<{
      name?: string;
      categories?: Array<{
        name?: string;
        budgeted?: number;
        spent?: number;
        balance?: number;
      }>;
    }>;
  };

  const lines: string[] = [];
  lines.push(`Budget for ${month}:`);
  lines.push(`- To Budget (available): ${formatCurrency(bm.toBudget ?? 0)}`);
  lines.push(`- Total Budgeted: ${formatCurrency(bm.totalBudgeted ?? 0)}`);
  lines.push(
    `- Total Spent: ${formatCurrency(Math.abs(bm.totalSpent ?? 0))}`,
  );

  if (bm.categoryGroups) {
    lines.push('\nCategory Budgets:');
    for (const group of bm.categoryGroups) {
      if (group.categories) {
        for (const cat of group.categories) {
          lines.push(
            `  - ${cat.name || 'Unknown'}: budgeted ${formatCurrency(cat.budgeted ?? 0)}, spent ${formatCurrency(Math.abs(cat.spent ?? 0))}, remaining ${formatCurrency(cat.balance ?? 0)}`,
          );
        }
      }
    }
  }

  return lines.join('\n');
}

export async function executeQuery(
  action: QueryAction,
  maps: LookupMaps,
): Promise<string> {
  const { startDate, endDate } = getDateRange(action.filters);

  switch (action.queryType) {
    case 'search-transactions': {
      const txns = await fetchFilteredTransactions(
        action.filters,
        maps,
        action.limit || 50,
      );
      return formatTransactionList(txns, action.limit || 50);
    }

    case 'spending-by-category': {
      const txns = await fetchFilteredTransactions(action.filters, maps);
      const summary = computeSpendingSummary(txns, 'category', startDate, endDate);
      return formatSpendingSummary(summary);
    }

    case 'spending-by-payee': {
      const txns = await fetchFilteredTransactions(action.filters, maps);
      const summary = computeSpendingSummary(txns, 'payee', startDate, endDate);
      return formatSpendingSummary(summary);
    }

    case 'spending-by-month': {
      const txns = await fetchFilteredTransactions(action.filters, maps);
      const summary = computeSpendingSummary(txns, 'month', startDate, endDate);
      return formatSpendingSummary(summary);
    }

    case 'spending-by-week': {
      const txns = await fetchFilteredTransactions(action.filters, maps);
      const summary = computeSpendingSummary(txns, 'week', startDate, endDate);
      return formatSpendingSummary(summary);
    }

    case 'spending-by-quarter': {
      const txns = await fetchFilteredTransactions(action.filters, maps);
      const summary = computeSpendingSummary(
        txns,
        'quarter',
        startDate,
        endDate,
      );
      return formatSpendingSummary(summary);
    }

    case 'spending-by-account': {
      const txns = await fetchFilteredTransactions(action.filters, maps);
      const summary = computeSpendingSummary(
        txns,
        'account',
        startDate,
        endDate,
      );
      return formatSpendingSummary(summary);
    }

    case 'budget-vs-actual': {
      const month =
        action.month || new Date().toISOString().substring(0, 7);
      const comparison = await fetchBudgetComparison(month);
      return formatBudgetComparison(comparison);
    }

    case 'top-payees': {
      const txns = await fetchFilteredTransactions(action.filters, maps);
      const summary = computeSpendingSummary(txns, 'payee', startDate, endDate);
      const topItems = summary.items.slice(0, action.limit || 10);
      const topTotal = topItems.reduce((sum, item) => sum + item.total, 0);
      return (
        `Top ${topItems.length} payees by spending:\n\n` +
        topItems
          .map(
            (item, i) =>
              `${i + 1}. ${item.name}: ${formatCurrency(Math.abs(item.total))} (${item.count} transactions)`,
          )
          .join('\n') +
        `\n\nTop ${topItems.length} total: ${formatCurrency(Math.abs(topTotal))}` +
        `\nAll payees total: ${formatCurrency(Math.abs(summary.grandTotal))}`
      );
    }

    case 'top-categories': {
      const txns = await fetchFilteredTransactions(action.filters, maps);
      const summary = computeSpendingSummary(
        txns,
        'category',
        startDate,
        endDate,
      );
      const topItems = summary.items.slice(0, action.limit || 10);
      const topTotal = topItems.reduce((sum, item) => sum + item.total, 0);
      return (
        `Top ${topItems.length} categories by spending:\n\n` +
        topItems
          .map(
            (item, i) =>
              `${i + 1}. ${item.name}: ${formatCurrency(Math.abs(item.total))} (${item.count} transactions)`,
          )
          .join('\n') +
        `\n\nTop ${topItems.length} total: ${formatCurrency(Math.abs(topTotal))}` +
        `\nAll categories total: ${formatCurrency(Math.abs(summary.grandTotal))}`
      );
    }

    case 'budget-month': {
      const month =
        action.month || new Date().toISOString().substring(0, 7);
      return await fetchBudgetMonth(month);
    }

    case 'budget-trend': {
      const months = action.months || [];
      if (months.length === 0) {
        const now = new Date();
        for (let i = 2; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          months.push(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          );
        }
      }
      const results: string[] = [];
      results.push(
        `Budget trend for ${months[0]} to ${months[months.length - 1]}:\n`,
      );
      for (const m of months) {
        try {
          const comparison = await fetchBudgetComparison(m);
          results.push(
            `${m}: budgeted ${formatCurrency(comparison.totalBudgeted)}, spent ${formatCurrency(comparison.totalSpent)}, ` +
              `${comparison.totalBudgeted >= comparison.totalSpent ? 'under' : 'over'} by ${formatCurrency(Math.abs(comparison.totalBudgeted - comparison.totalSpent))}`,
          );
          const overCategories = comparison.categories.filter(
            c => c.status === 'over',
          );
          if (overCategories.length > 0) {
            for (const c of overCategories.slice(0, 3)) {
              results.push(
                `  - ${c.name}: ${c.percentUsed}% used (${formatCurrency(c.spent)} of ${formatCurrency(c.budgeted)})`,
              );
            }
          }
        } catch {
          results.push(`${m}: Budget data not available`);
        }
      }
      return results.join('\n');
    }

    default:
      return 'Unknown query type.';
  }
}
