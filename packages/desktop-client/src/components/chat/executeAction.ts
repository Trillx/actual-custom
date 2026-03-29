import { send } from 'loot-core/platform/client/connection';

import type { BudgetAction } from './types';

export async function executeAction(action: BudgetAction): Promise<string> {
  switch (action.type) {
    case 'set-budget-amount': {
      const { month, categoryId, amount } = action.params as {
        month: string;
        categoryId: string;
        amount: number;
      };
      await send('api/budget-set-amount', { month, categoryId, amount });
      return `Budget amount set successfully for ${month}.`;
    }
    case 'add-transaction': {
      const { accountId, date, amount, payee_name, category_id, notes } =
        action.params as {
          accountId: string;
          date: string;
          amount: number;
          payee_name?: string;
          category_id?: string;
          notes?: string;
        };
      await send('api/transactions-add', {
        accountId,
        transactions: [
          {
            date,
            amount,
            payee_name,
            category: category_id,
            notes,
          },
        ],
      });
      return 'Transaction added successfully.';
    }
    case 'create-category': {
      const { name, group_id } = action.params as {
        name: string;
        group_id: string;
      };
      await send('api/category-create', {
        category: { name, group_id, hidden: false },
      });
      return `Category "${name}" created successfully.`;
    }
    case 'create-account': {
      const { name, balance, offBudget } = action.params as {
        name: string;
        balance?: number;
        offBudget?: boolean;
      };
      await send('account-create', {
        name,
        balance: balance || 0,
        offBudget: offBudget || false,
      });
      return `Account "${name}" created successfully.`;
    }
    default:
      return 'Unknown action type.';
  }
}
