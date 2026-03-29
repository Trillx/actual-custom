export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  pendingAction?: BudgetAction;
  actionStatus?: 'pending' | 'confirmed' | 'rejected' | 'executed';
};

export type BudgetAction = {
  type:
    | 'set-budget-amount'
    | 'add-transaction'
    | 'update-transaction'
    | 'create-category'
    | 'create-account';
  description: string;
  params: Record<string, unknown>;
};

export type BudgetContext = {
  accounts: Array<{ id: string; name: string; balance: number }>;
  categories: Array<{
    id: string;
    name: string;
    group_id: string;
    group_name?: string;
  }>;
  categoryGroups: Array<{ id: string; name: string }>;
  currentMonth: string;
  budgetMonth?: {
    month: string;
    incomeAvailable: number;
    totalBudgeted: number;
    totalSpent: number;
    toBudget: number;
    categoryBudgets: Array<{
      name: string;
      budgeted: number;
      spent: number;
      balance: number;
    }>;
  };
  recentTransactions: Array<{
    id: string;
    date: string;
    amount: number;
    payee_name?: string;
    category_name?: string;
    account_name?: string;
    notes?: string;
  }>;
  schedules: Array<{
    id: string;
    name?: string;
    next_date?: string;
    amount?: number;
  }>;
};
