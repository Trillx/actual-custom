import { useCallback } from 'react';

import { send } from 'loot-core/platform/client/connection';

import type { BudgetContext } from './types';

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

    const accounts = (
      accountsRaw as Array<{
        id: string;
        name: string;
        balance: number;
        closed?: boolean;
      }>
    )
      .filter(a => !a.closed)
      .map(a => ({
        id: a.id,
        name: a.name,
        balance: a.balance || 0,
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
        _amount?: number;
        _payee?: string;
      }>
    ).map(s => ({
      id: s.id,
      name: s.name || (s._payee ? payeeMap.get(s._payee) : undefined),
      next_date: s.next_date,
      amount: s._amount,
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
                budgeted: cat.budgeted || 0,
                spent: cat.spent || 0,
                balance: cat.balance || 0,
              });
            }
          }
        }
      }
      budgetMonth = {
        month: currentMonth,
        incomeAvailable: bm.incomeAvailable || 0,
        totalBudgeted: bm.totalBudgeted || 0,
        totalSpent: bm.totalSpent || 0,
        toBudget: bm.toBudget || 0,
        categoryBudgets,
      };
    } catch {
      // Budget month may not be available
    }

    let recentTransactions: BudgetContext['recentTransactions'] = [];
    try {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const startDate = thirtyDaysAgo.toISOString().split('T')[0];
      const endDate = now.toISOString().split('T')[0];

      for (const account of accounts.slice(0, 5)) {
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

    return {
      accounts,
      categories,
      categoryGroups,
      currentMonth,
      budgetMonth,
      recentTransactions,
      schedules,
    };
  }, []);

  return { gatherContext };
}
