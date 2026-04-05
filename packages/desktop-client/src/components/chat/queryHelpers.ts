import { send } from "loot-core/platform/client/connection";
import { q } from "loot-core/shared/query";

import {
  analyzeSpendingTrend,
  compareToHistorical,
  detectAnomalies,
  detectRecurringTransactions,
  formatAnomalyReport,
  formatHistoricalComparison,
  formatSubscriptionList,
  formatTrendAnalysis,
} from "./spendingAnalysis";
import type {
  BudgetComparison,
  QueryAction,
  SpendingSummary,
  TransactionQueryFilters,
} from "./types";

type ResolvedTransaction = {
  id: string;
  date: string;
  amount: number;
  payee_name?: string;
  payee_id?: string;
  category_name?: string;
  category_id?: string;
  account_name?: string;
  notes?: string;
};

type LookupMaps = {
  payeeMap: Map<string, string>;
  categoryMap: Map<string, string>;
  accountMap: Map<string, string>;
  schedules?: Array<{ name?: string; amount?: number }>;
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
  const endDate = filters?.endDate || now.toISOString().split("T")[0];
  if (filters?.uncategorized && !filters?.startDate) {
    return { startDate: "2000-01-01", endDate };
  }
  const defaultStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const startDate =
    filters?.startDate || defaultStart.toISOString().split("T")[0];
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
    conditions.push({ "payee.name": { $like: `%${filters.payee}%` } });
  }
  if (filters.uncategorized) {
    conditions.push({ category: null });
  } else if (filters.categoryId) {
    conditions.push({ category: filters.categoryId });
  } else if (filters.category) {
    conditions.push({ "category.name": { $like: `%${filters.category}%` } });
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
  limit?: number
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
    const query = q("transactions")
      .filter(aqlFilter)
      .select("*")
      .orderBy({ date: "desc" })
      .options({ splits: "inline" })
      .limit(PAGE_SIZE)
      .offset(currentOffset);

    const { data } = (await send("api/query", {
      query: query.serialize(),
    })) as { data: RawTx[] };

    allData.push(...data);

    if (data.length < PAGE_SIZE) break;
    if (fetchLimit > 0 && allData.length >= fetchLimit) break;

    currentOffset += PAGE_SIZE;
  }

  const finalData = fetchLimit > 0 ? allData.slice(0, fetchLimit) : allData;

  return finalData.map((tx) => ({
    id: tx.id,
    date: tx.date,
    amount: tx.amount,
    payee_name: tx.payee ? maps.payeeMap.get(tx.payee) : undefined,
    payee_id: tx.payee || undefined,
    category_name: tx.category ? maps.categoryMap.get(tx.category) : undefined,
    category_id: tx.category || undefined,
    account_name: tx.account ? maps.accountMap.get(tx.account) : undefined,
    notes: tx.notes || undefined,
  }));
}

function formatTransactionList(
  transactions: ResolvedTransaction[],
  limit = 50,
  includeIds = false
): string {
  if (includeIds && transactions.length > 20) {
    return formatGroupedUncategorized(transactions);
  }

  const lines: string[] = [];
  const displayed = transactions.slice(0, limit);

  lines.push(
    `Found ${transactions.length} transactions${
      transactions.length > limit ? ` (showing first ${limit})` : ""
    }:\n`
  );

  for (const tx of displayed) {
    const payee = tx.payee_name || "Unknown";
    const category = tx.category_name || "Uncategorized";
    const account = tx.account_name || "";
    const amount = formatCurrency(tx.amount);
    const idPrefix = includeIds ? `[${tx.id}] ` : "";
    const payeeIdSuffix =
      includeIds && tx.payee_id ? ` (payeeId: ${tx.payee_id})` : "";
    lines.push(
      `- ${idPrefix}${
        tx.date
      }: ${payee}${payeeIdSuffix} | ${amount} | ${category} | ${account}${
        tx.notes ? ` | ${tx.notes}` : ""
      }`
    );
  }

  const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  lines.push(`\nTotal: ${formatCurrency(total)}`);

  return lines.join("\n");
}

function formatGroupedUncategorized(
  transactions: ResolvedTransaction[]
): string {
  const lines: string[] = [];
  lines.push(
    `Found ${transactions.length} uncategorized transactions, grouped by payee:\n`
  );

  const groups = new Map<
    string,
    { displayName: string; payeeId: string; txIds: string[]; total: number }
  >();

  for (const tx of transactions) {
    const payee = tx.payee_name || "Unknown";
    const key = payee.toLowerCase().trim();
    const existing = groups.get(key);
    if (existing) {
      existing.txIds.push(tx.id);
      existing.total += tx.amount;
    } else {
      groups.set(key, {
        displayName: payee,
        payeeId: tx.payee_id || "",
        txIds: [tx.id],
        total: tx.amount,
      });
    }
  }

  const sorted = Array.from(groups.values()).sort(
    (a, b) => b.txIds.length - a.txIds.length
  );

  for (const g of sorted) {
    lines.push(
      `- "${g.displayName}" (payeeId: ${g.payeeId}) | ${
        g.txIds.length
      } txns | total: ${formatCurrency(g.total)} | IDs: ${g.txIds.join(", ")}`
    );
  }

  const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  lines.push(`\nGrand total: ${formatCurrency(total)}`);

  return lines.join("\n");
}

function computeSpendingSummary(
  transactions: ResolvedTransaction[],
  groupBy: SpendingSummary["groupBy"],
  startDate: string,
  endDate: string
): SpendingSummary {
  const groups = new Map<string, { total: number; count: number }>();

  for (const tx of transactions) {
    if (tx.amount >= 0) continue;

    let key: string;
    switch (groupBy) {
      case "category":
        key = tx.category_name || "Uncategorized";
        break;
      case "payee":
        key = tx.payee_name || "Unknown";
        break;
      case "account":
        key = tx.account_name || "Unknown";
        break;
      case "month":
        key = tx.date.substring(0, 7);
        break;
      case "week": {
        const d = new Date(tx.date);
        const day = d.getDay();
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - day);
        key = `Week of ${weekStart.toISOString().split("T")[0]}`;
        break;
      }
      case "quarter": {
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
    `Spending by ${summary.groupBy} (${summary.startDate} to ${summary.endDate}):\n`
  );

  for (const item of summary.items) {
    const pct =
      summary.grandTotal !== 0
        ? ((item.total / summary.grandTotal) * 100).toFixed(1)
        : "0";
    lines.push(
      `- ${item.name}: ${formatCurrency(Math.abs(item.total))} (${
        item.count
      } transactions, ${pct}%)`
    );
  }

  lines.push(
    `\nTotal spending: ${formatCurrency(Math.abs(summary.grandTotal))}`
  );
  return lines.join("\n");
}

async function fetchBudgetComparison(month: string): Promise<BudgetComparison> {
  const bm = (await send("api/budget-month", { month })) as {
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

  const categories: BudgetComparison["categories"] = [];
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

          let status: "under" | "on-track" | "over" = "under";
          if (percentUsed > 100) status = "over";
          else if (percentUsed >= 75) status = "on-track";

          totalBudgeted += budgeted;
          totalSpent += spent;

          categories.push({
            name: cat.name || "Unknown",
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

  const overBudget = comparison.categories.filter((c) => c.status === "over");
  const onTrack = comparison.categories.filter((c) => c.status === "on-track");
  const underBudget = comparison.categories.filter(
    (c) => c.status === "under" && c.budgeted > 0
  );

  if (overBudget.length > 0) {
    lines.push("OVER BUDGET:");
    for (const c of overBudget) {
      lines.push(
        `  ! ${c.name}: spent ${formatCurrency(c.spent)} of ${formatCurrency(
          c.budgeted
        )} budgeted (${c.percentUsed}%, ${formatCurrency(
          Math.abs(c.remaining)
        )} over)`
      );
    }
  }

  if (onTrack.length > 0) {
    lines.push("\nAPPROACHING BUDGET (75%+):");
    for (const c of onTrack) {
      lines.push(
        `  ~ ${c.name}: spent ${formatCurrency(c.spent)} of ${formatCurrency(
          c.budgeted
        )} budgeted (${c.percentUsed}%, ${formatCurrency(c.remaining)} left)`
      );
    }
  }

  if (underBudget.length > 0) {
    lines.push("\nUNDER BUDGET:");
    for (const c of underBudget) {
      lines.push(
        `  * ${c.name}: spent ${formatCurrency(c.spent)} of ${formatCurrency(
          c.budgeted
        )} budgeted (${c.percentUsed}%, ${formatCurrency(c.remaining)} left)`
      );
    }
  }

  lines.push(
    `\nOverall: spent ${formatCurrency(
      comparison.totalSpent
    )} of ${formatCurrency(comparison.totalBudgeted)} budgeted`
  );

  return lines.join("\n");
}

async function fetchBudgetMonth(month: string): Promise<string> {
  const bm = (await send("api/budget-month", { month })) as {
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
  lines.push(`- Total Spent: ${formatCurrency(Math.abs(bm.totalSpent ?? 0))}`);

  if (bm.categoryGroups) {
    lines.push("\nCategory Budgets:");
    for (const group of bm.categoryGroups) {
      if (group.categories) {
        for (const cat of group.categories) {
          lines.push(
            `  - ${cat.name || "Unknown"}: budgeted ${formatCurrency(
              cat.budgeted ?? 0
            )}, spent ${formatCurrency(
              Math.abs(cat.spent ?? 0)
            )}, remaining ${formatCurrency(cat.balance ?? 0)}`
          );
        }
      }
    }
  }

  return lines.join("\n");
}

export async function executeQuery(
  action: QueryAction,
  maps: LookupMaps
): Promise<string> {
  const { startDate, endDate } = getDateRange(action.filters);

  switch (action.queryType) {
    case "search-transactions": {
      const isUncategorized = action.filters?.uncategorized;
      const limit = isUncategorized ? 0 : action.limit || 50;
      const txns = await fetchFilteredTransactions(action.filters, maps, limit);
      return formatTransactionList(
        txns,
        isUncategorized ? txns.length : action.limit || 50,
        !!isUncategorized
      );
    }

    case "spending-by-category": {
      const txns = await fetchFilteredTransactions(action.filters, maps);
      const summary = computeSpendingSummary(
        txns,
        "category",
        startDate,
        endDate
      );
      return formatSpendingSummary(summary);
    }

    case "spending-by-payee": {
      const txns = await fetchFilteredTransactions(action.filters, maps);
      const summary = computeSpendingSummary(txns, "payee", startDate, endDate);
      return formatSpendingSummary(summary);
    }

    case "spending-by-month": {
      const txns = await fetchFilteredTransactions(action.filters, maps);
      const summary = computeSpendingSummary(txns, "month", startDate, endDate);
      return formatSpendingSummary(summary);
    }

    case "spending-by-week": {
      const txns = await fetchFilteredTransactions(action.filters, maps);
      const summary = computeSpendingSummary(txns, "week", startDate, endDate);
      return formatSpendingSummary(summary);
    }

    case "spending-by-quarter": {
      const txns = await fetchFilteredTransactions(action.filters, maps);
      const summary = computeSpendingSummary(
        txns,
        "quarter",
        startDate,
        endDate
      );
      return formatSpendingSummary(summary);
    }

    case "spending-by-account": {
      const txns = await fetchFilteredTransactions(action.filters, maps);
      const summary = computeSpendingSummary(
        txns,
        "account",
        startDate,
        endDate
      );
      return formatSpendingSummary(summary);
    }

    case "budget-vs-actual": {
      const month = action.month || new Date().toISOString().substring(0, 7);
      const comparison = await fetchBudgetComparison(month);
      return formatBudgetComparison(comparison);
    }

    case "top-payees": {
      const txns = await fetchFilteredTransactions(action.filters, maps);
      const summary = computeSpendingSummary(txns, "payee", startDate, endDate);
      const topItems = summary.items.slice(0, action.limit || 10);
      const topTotal = topItems.reduce((sum, item) => sum + item.total, 0);
      return (
        `Top ${topItems.length} payees by spending:\n\n` +
        topItems
          .map(
            (item, i) =>
              `${i + 1}. ${item.name}: ${formatCurrency(
                Math.abs(item.total)
              )} (${item.count} transactions)`
          )
          .join("\n") +
        `\n\nTop ${topItems.length} total: ${formatCurrency(
          Math.abs(topTotal)
        )}` +
        `\nAll payees total: ${formatCurrency(Math.abs(summary.grandTotal))}`
      );
    }

    case "top-categories": {
      const txns = await fetchFilteredTransactions(action.filters, maps);
      const summary = computeSpendingSummary(
        txns,
        "category",
        startDate,
        endDate
      );
      const topItems = summary.items.slice(0, action.limit || 10);
      const topTotal = topItems.reduce((sum, item) => sum + item.total, 0);
      return (
        `Top ${topItems.length} categories by spending:\n\n` +
        topItems
          .map(
            (item, i) =>
              `${i + 1}. ${item.name}: ${formatCurrency(
                Math.abs(item.total)
              )} (${item.count} transactions)`
          )
          .join("\n") +
        `\n\nTop ${topItems.length} total: ${formatCurrency(
          Math.abs(topTotal)
        )}` +
        `\nAll categories total: ${formatCurrency(
          Math.abs(summary.grandTotal)
        )}`
      );
    }

    case "budget-month": {
      const month = action.month || new Date().toISOString().substring(0, 7);
      return await fetchBudgetMonth(month);
    }

    case "budget-trend": {
      const months = action.months || [];
      if (months.length === 0) {
        const now = new Date();
        for (let i = 2; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          months.push(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
          );
        }
      }
      const results: string[] = [];
      results.push(
        `Budget trend for ${months[0]} to ${months[months.length - 1]}:\n`
      );
      for (const m of months) {
        try {
          const comparison = await fetchBudgetComparison(m);
          results.push(
            `${m}: budgeted ${formatCurrency(
              comparison.totalBudgeted
            )}, spent ${formatCurrency(comparison.totalSpent)}, ` +
              `${
                comparison.totalBudgeted >= comparison.totalSpent
                  ? "under"
                  : "over"
              } by ${formatCurrency(
                Math.abs(comparison.totalBudgeted - comparison.totalSpent)
              )}`
          );
          const overCategories = comparison.categories.filter(
            (c) => c.status === "over"
          );
          if (overCategories.length > 0) {
            for (const c of overCategories.slice(0, 3)) {
              results.push(
                `  - ${c.name}: ${c.percentUsed}% used (${formatCurrency(
                  c.spent
                )} of ${formatCurrency(c.budgeted)})`
              );
            }
          }
        } catch {
          results.push(`${m}: Budget data not available`);
        }
      }
      return results.join("\n");
    }

    case "detect-subscriptions": {
      const lookback = action.lookbackMonths || 12;
      const lookbackDate = new Date();
      lookbackDate.setMonth(lookbackDate.getMonth() - lookback);
      const txns = await fetchFilteredTransactions(
        {
          ...action.filters,
          startDate: lookbackDate.toISOString().split("T")[0],
          endDate: new Date().toISOString().split("T")[0],
        },
        maps
      );
      const subscriptions = detectRecurringTransactions(
        txns,
        maps.schedules || []
      );
      return formatSubscriptionList(subscriptions);
    }

    case "detect-anomalies": {
      const lookback = action.lookbackMonths || 6;
      const lookbackDate = new Date();
      lookbackDate.setMonth(lookbackDate.getMonth() - lookback);
      const txns = await fetchFilteredTransactions(
        {
          ...action.filters,
          startDate: lookbackDate.toISOString().split("T")[0],
          endDate: new Date().toISOString().split("T")[0],
        },
        maps
      );
      const anomalies = detectAnomalies(txns);
      return formatAnomalyReport(anomalies);
    }

    case "spending-trend": {
      const lookback = action.lookbackMonths || 6;
      const lookbackDate = new Date();
      lookbackDate.setMonth(lookbackDate.getMonth() - lookback);
      const filterType = action.payee ? "payee" : "category";
      const filterName = action.payee || action.category;
      const txns = await fetchFilteredTransactions(
        {
          ...action.filters,
          startDate: lookbackDate.toISOString().split("T")[0],
          endDate: new Date().toISOString().split("T")[0],
        },
        maps
      );
      const trends = analyzeSpendingTrend(txns, filterName, filterType);
      return formatTrendAnalysis(trends);
    }

    case "historical-comparison": {
      const lookback = action.lookbackMonths || 3;
      const lookbackDate = new Date();
      lookbackDate.setMonth(lookbackDate.getMonth() - lookback - 1);
      const txns = await fetchFilteredTransactions(
        {
          ...action.filters,
          startDate: lookbackDate.toISOString().split("T")[0],
          endDate: new Date().toISOString().split("T")[0],
        },
        maps
      );
      const comparison = compareToHistorical(txns, lookback);
      return formatHistoricalComparison(comparison);
    }

    case "payee-category-history": {
      const lookback = action.lookbackMonths || 12;
      const lookbackDate = new Date();
      lookbackDate.setMonth(lookbackDate.getMonth() - lookback);
      const txns = await fetchFilteredTransactions(
        {
          startDate: lookbackDate.toISOString().split("T")[0],
          endDate: new Date().toISOString().split("T")[0],
        },
        maps
      );

      const payeeStats = new Map<
        string,
        Map<string, { categoryId: string; categoryName: string; count: number }>
      >();
      const payeeDisplayNames = new Map<string, string>();

      for (const tx of txns) {
        if (!tx.payee_name || !tx.category_name) continue;
        const payeeKey = tx.payee_name.toLowerCase().trim();

        if (!payeeStats.has(payeeKey)) {
          payeeStats.set(payeeKey, new Map());
          payeeDisplayNames.set(payeeKey, tx.payee_name);
        }
        const catMap = payeeStats.get(payeeKey)!;
        const catKey = tx.category_name;
        const existing = catMap.get(catKey);

        if (existing) {
          existing.count++;
        } else {
          catMap.set(catKey, {
            categoryId: tx.category_id || "",
            categoryName: catKey,
            count: 1,
          });
        }
      }

      const lines: string[] = [];
      lines.push(`Payee → Category history (last ${lookback} months):\n`);

      const sortedPayees = Array.from(payeeStats.entries())
        .map(([payeeKey, catMap]) => {
          const categories = Array.from(catMap.values()).sort(
            (a, b) => b.count - a.count
          );
          const totalCount = categories.reduce((sum, c) => sum + c.count, 0);
          const top = categories[0];
          const majorityRatio = top.count / totalCount;
          let confidence: string;
          if (totalCount >= 3 && majorityRatio >= 0.8) {
            confidence = "high";
          } else if (totalCount >= 2 && majorityRatio >= 0.5) {
            confidence = "medium";
          } else {
            confidence = "low";
          }
          return {
            payeeKey,
            displayName: payeeDisplayNames.get(payeeKey) || payeeKey,
            topCategory: top.categoryName,
            topCategoryId: top.categoryId,
            totalCount,
            majorityPct: Math.round(majorityRatio * 100),
            confidence,
          };
        })
        .sort((a, b) => b.totalCount - a.totalCount);

      for (const entry of sortedPayees) {
        lines.push(
          `- "${entry.displayName}" → ${entry.topCategory} (${entry.topCategoryId}) | ${entry.totalCount} txns, ${entry.majorityPct}% majority | confidence: ${entry.confidence}`
        );
      }

      lines.push(
        "\n--- Available Categories (for AI-suggested categorization of unknown payees) ---"
      );
      for (const [id, name] of Array.from(maps.categoryMap.entries())) {
        lines.push(`- ${name} (${id})`);
      }

      return lines.join("\n");
    }

    case "auto-categorize": {
      const uncategorizedTxns = await fetchFilteredTransactions(
        {
          uncategorized: true,
          startDate: "2000-01-01",
          endDate: new Date().toISOString().split("T")[0],
        },
        maps,
        0
      );

      if (uncategorizedTxns.length === 0) {
        return "No uncategorized transactions found. Everything is already categorized!";
      }

      const lookback = action.lookbackMonths || 12;
      const lookbackDate = new Date();
      lookbackDate.setMonth(lookbackDate.getMonth() - lookback);
      const historicalTxns = await fetchFilteredTransactions(
        {
          startDate: lookbackDate.toISOString().split("T")[0],
          endDate: new Date().toISOString().split("T")[0],
        },
        maps
      );

      const payeeHistory = new Map<
        string,
        {
          displayName: string;
          topCategoryId: string;
          topCategoryName: string;
          count: number;
          confidence: string;
        }
      >();

      const payeeCatCounts = new Map<
        string,
        Map<string, { id: string; name: string; count: number }>
      >();
      for (const tx of historicalTxns) {
        if (!tx.payee_name || !tx.category_name || !tx.category_id) continue;
        const payeeKey = tx.payee_name.toLowerCase().trim();
        if (!payeeCatCounts.has(payeeKey)) {
          payeeCatCounts.set(payeeKey, new Map());
        }
        const catMap = payeeCatCounts.get(payeeKey)!;
        const existing = catMap.get(tx.category_name);
        if (existing) {
          existing.count++;
        } else {
          catMap.set(tx.category_name, {
            id: tx.category_id,
            name: tx.category_name,
            count: 1,
          });
        }
      }

      for (const [payeeKey, catMap] of Array.from(payeeCatCounts.entries())) {
        const categories = Array.from(catMap.values()).sort(
          (a, b) => b.count - a.count
        );
        const totalCount = categories.reduce((sum, c) => sum + c.count, 0);
        const top = categories[0];
        const majorityRatio = top.count / totalCount;
        let confidence: string;
        if (totalCount >= 3 && majorityRatio >= 0.8) {
          confidence = "high";
        } else if (totalCount >= 2 && majorityRatio >= 0.5) {
          confidence = "medium";
        } else {
          confidence = "low";
        }
        const displayName =
          historicalTxns.find(
            (t) =>
              t.payee_name && t.payee_name.toLowerCase().trim() === payeeKey
          )?.payee_name || payeeKey;
        payeeHistory.set(payeeKey, {
          displayName,
          topCategoryId: top.id,
          topCategoryName: top.name,
          count: totalCount,
          confidence,
        });
      }

      const lines: string[] = [];
      lines.push(
        `=== AUTO-CATEGORIZE: ${uncategorizedTxns.length} uncategorized transactions ===\n`
      );

      lines.push("PAYEE GROUPS WITH SUGGESTED CATEGORIES:");
      const groups = new Map<
        string,
        {
          displayName: string;
          payeeId: string;
          txIds: string[];
          total: number;
        }
      >();
      for (const tx of uncategorizedTxns) {
        const payee = tx.payee_name || "Unknown";
        const key = payee.toLowerCase().trim();
        const existing = groups.get(key);
        if (existing) {
          existing.txIds.push(tx.id);
          existing.total += tx.amount;
        } else {
          groups.set(key, {
            displayName: payee,
            payeeId: tx.payee_id || "",
            txIds: [tx.id],
            total: tx.amount,
          });
        }
      }

      const sorted = Array.from(groups.entries()).sort(
        (a, b) => b[1].txIds.length - a[1].txIds.length
      );

      let groupIndex = 0;
      const txIdMap: Record<string, string[]> = {};
      for (const [key, g] of sorted) {
        groupIndex++;
        const groupLabel = `G${groupIndex}`;
        txIdMap[groupLabel] = g.txIds;
        const history = payeeHistory.get(key);
        const historyNote = history
          ? `HISTORY: ${history.topCategoryName} (${history.topCategoryId}), confidence: ${history.confidence}`
          : "NO HISTORY";
        lines.push(
          `- ${groupLabel}: "${g.displayName}" | ${
            g.txIds.length
          } txns | ${formatCurrency(g.total)} | ${historyNote}`
        );
      }

      lines.push(
        "\n--- Available Categories (use these IDs for bulk-update) ---"
      );
      for (const [id, name] of Array.from(maps.categoryMap.entries())) {
        lines.push(`- ${name} (${id})`);
      }

      lines.push(
        "\n--- Transaction ID Map (use in bulk-update-transactions) ---"
      );
      for (const [groupLabel, ids] of Object.entries(txIdMap)) {
        lines.push(`${groupLabel}: ${ids.join(",")}`);
      }

      lines.push(
        "\nINSTRUCTIONS: For each group (G1, G2, etc.), assign a category. For HISTORY groups use the suggested category. For NO HISTORY groups, use your knowledge of the payee name. Emit a single bulk-update-transactions action mapping each transaction ID to its categoryId."
      );

      return lines.join("\n");
    }

    default:
      return "Unknown query type.";
  }
}
