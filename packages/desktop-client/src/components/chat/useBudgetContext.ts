import { useCallback } from 'react';

import { send } from 'loot-core/platform/client/connection';

import {
  calculateGoalProgress,
  forecastByCategory,
  formatGoalProgressSummary,
  formatProjectionSummary,
  projectMonthlySpending,
} from './forecastEngine';
import { getGoals, setBudgetId } from './goalStorage';
import { setMemoryBudgetId } from './memoryStorage';
import { executeQuery } from './queryHelpers';
import {
  detectAnomalies,
  detectRecurringTransactions,
} from './spendingAnalysis';
import type { BudgetContext, QueryAction } from './types';

export function useBudgetContext() {
  const gatherContext = useCallback(async (): Promise<BudgetContext> => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [accountsRaw, categoriesRaw, categoryGroupsRaw, payeesRaw, schedulesRaw] =
      await Promise.all([
        send('api/accounts-get'),
        send('api/categories-get', { grouped: false }),
        send('api/category-groups-get'),
        send('api/payees-get'),
        send('api/schedules-get').catch(() => []),
      ]);

    const rawAccounts = accountsRaw as Array<{ id: string }>;
    const budgetFingerprint = rawAccounts.length > 0
      ? rawAccounts.map(a => a.id).sort().join(':')
      : 'empty-budget';
    setBudgetId(budgetFingerprint);
    setMemoryBudgetId(budgetFingerprint);

    const allAccounts = accountsRaw as Array<{
      id: string;
      name: string;
      balance_current?: number | null;
      closed?: boolean;
    }>;

    const accounts = allAccounts
      .filter(a => !a.closed)
      .map(a => ({
        id: a.id,
        name: a.name,
        balance: a.balance_current ?? 0,
      }));

    const closedAccounts = allAccounts
      .filter(a => a.closed)
      .map(a => ({
        id: a.id,
        name: a.name,
        balance: a.balance_current ?? 0,
      }));

    const categoryGroups = (
      categoryGroupsRaw as Array<{
        id: string;
        name: string;
        hidden?: boolean;
      }>
    )
      .filter(g => !g.hidden)
      .map(g => ({ id: g.id, name: g.name }));

    const categories = (
      categoriesRaw as Array<{
        id: string;
        name: string;
        group_id: string;
        hidden?: boolean;
      }>
    )
      .filter(c => !c.hidden)
      .map(c => {
        const group = categoryGroups.find(g => g.id === c.group_id);
        return {
          id: c.id,
          name: c.name,
          group_id: c.group_id,
          group_name: group?.name,
        };
      });

    const payeeMap = new Map<string, string>();
    for (const p of payeesRaw as Array<{ id: string; name: string }>) {
      payeeMap.set(p.id, p.name);
    }

    const categoryMap = new Map<string, string>();
    for (const c of categories) {
      categoryMap.set(c.id, c.name);
    }

    const accountMap = new Map<string, string>();
    for (const a of accounts) {
      accountMap.set(a.id, a.name);
    }

    const schedules = (
      schedulesRaw as Array<{
        id: string;
        name?: string;
        next_date?: string;
        amount?: number;
        payee?: string;
      }>
    ).map(s => ({
      id: s.id,
      name: s.name || (s.payee ? payeeMap.get(s.payee) : undefined),
      next_date: s.next_date,
      amount: s.amount,
    }));

    let budgetMonth: BudgetContext['budgetMonth'] = undefined;
    try {
      const bm = (await send('api/budget-month', { month: currentMonth })) as {
        incomeAvailable?: number;
        totalBudgeted?: number;
        totalSpent?: number;
        toBudget?: number;
        categoryGroups?: Array<{
          categories?: Array<{
            name?: string;
            budgeted?: number;
            spent?: number;
            balance?: number;
          }>;
        }>;
      };
      const categoryBudgets: Array<{
        name: string;
        budgeted: number;
        spent: number;
        balance: number;
      }> = [];
      if (bm.categoryGroups) {
        for (const group of bm.categoryGroups) {
          if (group.categories) {
            for (const cat of group.categories) {
              categoryBudgets.push({
                name: cat.name || 'Unknown',
                budgeted: cat.budgeted ?? 0,
                spent: cat.spent ?? 0,
                balance: cat.balance ?? 0,
              });
            }
          }
        }
      }
      budgetMonth = {
        month: currentMonth,
        incomeAvailable: bm.incomeAvailable ?? 0,
        totalBudgeted: bm.totalBudgeted ?? 0,
        totalSpent: bm.totalSpent ?? 0,
        toBudget: bm.toBudget ?? 0,
        categoryBudgets,
      };
    } catch {
      // Budget month may not be available
    }

    let recentTransactions: BudgetContext['recentTransactions'] = [];
    try {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const startDate = sevenDaysAgo.toISOString().split('T')[0];
      const endDate = now.toISOString().split('T')[0];

      for (const account of accounts) {
        const txns = (await send('api/transactions-get', {
          accountId: account.id,
          startDate,
          endDate,
        })) as Array<{
          id: string;
          date: string;
          amount: number;
          payee?: string;
          category?: string;
          account?: string;
          notes?: string;
        }>;

        for (const tx of txns) {
          recentTransactions.push({
            id: tx.id,
            date: tx.date,
            amount: tx.amount,
            payee_name: tx.payee ? payeeMap.get(tx.payee) : undefined,
            category_name: tx.category
              ? categoryMap.get(tx.category)
              : undefined,
            account_name: accountMap.get(account.id),
            notes: tx.notes || undefined,
          });
        }
      }

      recentTransactions.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
      recentTransactions = recentTransactions.slice(0, 30);
    } catch {
      // Transactions may not be available
    }

    const payees = (payeesRaw as Array<{ id: string; name: string }>)
      .filter(p => p.name)
      .map(p => ({ id: p.id, name: p.name }));

    let subscriptionInsights: BudgetContext['subscriptionInsights'];
    let anomalyInsights: BudgetContext['anomalyInsights'];
    try {
      const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      const insightStartDate = sixMonthsAgo.toISOString().split('T')[0];
      const insightEndDate = now.toISOString().split('T')[0];

      const insightTxns: Array<{
        date: string;
        amount: number;
        payee_name?: string;
        category_name?: string;
      }> = [];

      for (const account of accounts) {
        const txns = (await send('api/transactions-get', {
          accountId: account.id,
          startDate: insightStartDate,
          endDate: insightEndDate,
        })) as Array<{
          date: string;
          amount: number;
          payee?: string;
          category?: string;
        }>;

        for (const tx of txns) {
          insightTxns.push({
            date: tx.date,
            amount: tx.amount,
            payee_name: tx.payee ? payeeMap.get(tx.payee) : undefined,
            category_name: tx.category ? categoryMap.get(tx.category) : undefined,
          });
        }
      }

      const scheduleInfos = schedules.map(s => ({
        name: s.name,
        amount: s.amount,
      }));

      const subs = detectRecurringTransactions(insightTxns, scheduleInfos);
      subscriptionInsights = subs.slice(0, 10).map(s => ({
        payee_name: s.payee_name,
        amount: s.amount,
        frequency: s.frequency,
        confidence: s.confidence,
        matchesSchedule: s.matchesSchedule,
      }));

      const anomalies = detectAnomalies(insightTxns);
      anomalyInsights = anomalies.slice(0, 5).map(a => ({
        type: a.type,
        name: a.name,
        amount: a.amount,
        average: a.average,
        deviations: a.deviations,
      }));
    } catch {
      // Insights may not be available
    }

    const goals = getGoals().map(g => ({
      id: g.id,
      name: g.name,
      targetAmount: g.targetAmount,
      targetDate: g.targetDate,
      associatedAccountIds: g.associatedAccountIds,
      associatedCategoryIds: g.associatedCategoryIds,
    }));

    const baseContext: BudgetContext = {
      accounts,
      closedAccounts,
      payees,
      categories,
      categoryGroups,
      currentMonth,
      budgetMonth,
      recentTransactions,
      schedules,
      subscriptionInsights,
      anomalyInsights,
      goals: goals.length > 0 ? goals : undefined,
    };

    let monthlyNetSavings = 0;
    if (budgetMonth) {
      monthlyNetSavings = budgetMonth.totalBudgeted + budgetMonth.totalSpent;
    }

    let goalProgress: string | undefined;
    if (goals.length > 0) {
      const fullGoals = getGoals();
      const progressItems = fullGoals.map(g =>
        calculateGoalProgress(g, baseContext, monthlyNetSavings),
      );
      goalProgress = progressItems.map(formatGoalProgressSummary).join('\n\n');
    }

    const projection = projectMonthlySpending(baseContext);
    const spendingProjection = projection
      ? formatProjectionSummary(projection)
      : undefined;

    const catForecasts = forecastByCategory(baseContext);
    let categoryForecasts: string | undefined;
    if (catForecasts.length > 0) {
      const overBudget = catForecasts.filter(cf => cf.status === 'over');
      const lines: string[] = [];
      if (overBudget.length > 0) {
        lines.push('Categories projected to go over budget:');
        for (const cf of overBudget) {
          lines.push(
            `- ${cf.categoryName}: spent $${(cf.spentSoFar / 100).toFixed(2)} so far, projected $${(cf.projectedTotal / 100).toFixed(2)} (budget $${(cf.budgeted / 100).toFixed(2)}, over by $${(Math.abs(cf.projectedOverUnder) / 100).toFixed(2)})`,
          );
        }
      }
      const onTrack = catForecasts.filter(cf => cf.status === 'on-track');
      if (onTrack.length > 0) {
        lines.push('Categories on track:');
        for (const cf of onTrack) {
          lines.push(
            `- ${cf.categoryName}: projected $${(cf.projectedTotal / 100).toFixed(2)} of $${(cf.budgeted / 100).toFixed(2)} budget`,
          );
        }
      }
      if (lines.length > 0) categoryForecasts = lines.join('\n');
    }

    let debtAccounts: string | undefined;
    const debtAccts = accounts.filter(a => a.balance < 0);
    if (debtAccts.length > 0) {
      const lines = ['Accounts with negative balances (potential debt):'];
      for (const da of debtAccts) {
        lines.push(
          `- ${da.name}: balance -$${(Math.abs(da.balance) / 100).toFixed(2)}`,
        );
      }
      debtAccounts = lines.join('\n');
    }

    return {
      ...baseContext,
      goalProgress,
      spendingProjection,
      categoryForecasts,
      debtAccounts,
    };
  }, []);

  const runQuery = useCallback(
    async (
      action: QueryAction,
      context: BudgetContext,
    ): Promise<string> => {
      const payeeMap = new Map<string, string>();
      if (context.payees) {
        for (const p of context.payees) {
          payeeMap.set(p.id, p.name);
        }
      }

      const categoryMap = new Map<string, string>();
      for (const c of context.categories) {
        categoryMap.set(c.id, c.name);
      }

      const accountMap = new Map<string, string>();
      for (const a of context.accounts) {
        accountMap.set(a.id, a.name);
      }

      const maps = {
        payeeMap,
        categoryMap,
        accountMap,
        schedules: context.schedules?.map(s => ({
          name: s.name,
          amount: s.amount,
        })),
      };

      return executeQuery(action, maps);
    },
    [],
  );

  return { gatherContext, runQuery };
}
