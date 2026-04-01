export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  pendingAction?: BudgetAction;
  actionStatus?: 'pending' | 'confirmed' | 'rejected' | 'executed' | 'failed';
};

export type BudgetAction = {
  type:
    | 'set-budget-amount'
    | 'add-transaction'
    | 'update-transaction'
    | 'delete-transaction'
    | 'transfer-between-accounts'
    | 'create-category'
    | 'create-account'
    | 'query'
    | 'close-account'
    | 'reopen-account'
    | 'rename-category'
    | 'delete-category'
    | 'create-category-group'
    | 'move-category'
    | 'delete-category-group'
    | 'rename-payee'
    | 'merge-payees'
    | 'copy-previous-month'
    | 'set-budget-average'
    | 'bulk-set-budget'
    | 'transfer-budget'
    | 'create-goal'
    | 'update-goal'
    | 'delete-goal'
    | 'reorganize-categories'
    | 'save-memory'
    | 'delete-memory'
    | 'list-memories';
  description: string;
  params: Record<string, unknown>;
};

export type TransactionQueryFilters = {
  startDate?: string;
  endDate?: string;
  payee?: string;
  payeeId?: string;
  category?: string;
  categoryId?: string;
  accountId?: string;
  amountMin?: number;
  amountMax?: number;
  notes?: string;
};

export type SpendingSummary = {
  groupBy: 'category' | 'payee' | 'month' | 'week' | 'quarter' | 'account';
  startDate: string;
  endDate: string;
  items: Array<{
    name: string;
    total: number;
    count: number;
  }>;
  grandTotal: number;
};

export type BudgetComparison = {
  month: string;
  categories: Array<{
    name: string;
    groupName?: string;
    budgeted: number;
    spent: number;
    remaining: number;
    percentUsed: number;
    status: 'under' | 'on-track' | 'over';
  }>;
  totalBudgeted: number;
  totalSpent: number;
};

export type QueryAction = {
  queryType:
    | 'search-transactions'
    | 'spending-by-category'
    | 'spending-by-payee'
    | 'spending-by-month'
    | 'budget-vs-actual'
    | 'top-payees'
    | 'top-categories'
    | 'budget-month'
    | 'budget-trend'
    | 'spending-by-week'
    | 'spending-by-quarter'
    | 'spending-by-account'
    | 'detect-subscriptions'
    | 'detect-anomalies'
    | 'spending-trend'
    | 'historical-comparison';
  filters?: TransactionQueryFilters;
  month?: string;
  months?: string[];
  limit?: number;
  category?: string;
  payee?: string;
  lookbackMonths?: number;
};

export type RecurringTransaction = {
  payee_name: string;
  amount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  confidence: 'high' | 'medium' | 'low';
  lastDate: string;
  occurrences: number;
  matchesSchedule: boolean;
  scheduleName?: string;
};

export type SpendingAnomaly = {
  type: 'transaction' | 'category';
  name: string;
  amount: number;
  average: number;
  stdDev: number;
  deviations: number;
  date?: string;
  period?: string;
};

export type SpendingTrend = {
  name: string;
  direction: 'increasing' | 'decreasing' | 'stable';
  percentChange: number;
  monthlyTotals: Array<{ month: string; total: number }>;
  narrative: string;
};

export type HistoricalComparison = {
  currentMonth: string;
  comparisonPeriod: string;
  categories: Array<{
    name: string;
    currentSpending: number;
    historicalAverage: number;
    difference: number;
    percentDifference: number;
    status: 'significantly-over' | 'over' | 'normal' | 'under' | 'significantly-under';
  }>;
  totalCurrent: number;
  totalAverage: number;
};

export type BudgetContext = {
  accounts: Array<{ id: string; name: string; balance: number }>;
  closedAccounts?: Array<{ id: string; name: string; balance: number }>;
  payees?: Array<{ id: string; name: string }>;
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
  subscriptionInsights?: Array<{
    payee_name: string;
    amount: number;
    frequency: string;
    confidence: string;
    matchesSchedule: boolean;
  }>;
  anomalyInsights?: Array<{
    type: string;
    name: string;
    amount: number;
    average: number;
    deviations: number;
  }>;
  queryResult?: string;
  goals?: Array<{
    id: string;
    name: string;
    targetAmount: number;
    targetDate: string;
    associatedAccountIds?: string[];
    associatedCategoryIds?: string[];
  }>;
  goalProgress?: string;
  spendingProjection?: string;
  categoryForecasts?: string;
  debtAccounts?: string;
};
