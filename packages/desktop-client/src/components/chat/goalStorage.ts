export type SavingsGoal = {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: string;
  associatedAccountIds?: string[];
  associatedCategoryIds?: string[];
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY_PREFIX = 'actual-budget-chat-goals';

let currentBudgetId: string | null = null;

export function setBudgetId(budgetId: string): void {
  currentBudgetId = budgetId;
}

function getStorageKey(): string {
  if (currentBudgetId) {
    return `${STORAGE_KEY_PREFIX}:${currentBudgetId}`;
  }
  return STORAGE_KEY_PREFIX;
}

function generateId(): string {
  return `goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getGoals(): SavingsGoal[] {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return [];
    return JSON.parse(raw) as SavingsGoal[];
  } catch {
    return [];
  }
}

export function saveGoals(goals: SavingsGoal[]): void {
  localStorage.setItem(getStorageKey(), JSON.stringify(goals));
}

export function createGoal(params: {
  name: string;
  targetAmount: number;
  targetDate: string;
  associatedAccountIds?: string[];
  associatedCategoryIds?: string[];
}): SavingsGoal {
  const now = Date.now();
  const goal: SavingsGoal = {
    id: generateId(),
    name: params.name,
    targetAmount: params.targetAmount,
    targetDate: params.targetDate,
    associatedAccountIds: params.associatedAccountIds,
    associatedCategoryIds: params.associatedCategoryIds,
    createdAt: now,
    updatedAt: now,
  };
  const goals = getGoals();
  goals.push(goal);
  saveGoals(goals);
  return goal;
}

export function updateGoal(
  id: string,
  updates: Partial<Omit<SavingsGoal, 'id' | 'createdAt'>>,
): SavingsGoal | null {
  const goals = getGoals();
  const idx = goals.findIndex(g => g.id === id);
  if (idx === -1) return null;
  goals[idx] = { ...goals[idx], ...updates, updatedAt: Date.now() };
  saveGoals(goals);
  return goals[idx];
}

export function deleteGoal(id: string): boolean {
  const goals = getGoals();
  const filtered = goals.filter(g => g.id !== id);
  if (filtered.length === goals.length) return false;
  saveGoals(filtered);
  return true;
}

export function getGoalById(id: string): SavingsGoal | null {
  return getGoals().find(g => g.id === id) || null;
}
