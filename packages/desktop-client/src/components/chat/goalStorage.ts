import { send } from 'loot-core/platform/client/connection';

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

const LOCALSTORAGE_KEY_PREFIX = 'actual-budget-chat-goals';

let currentBudgetId: string | null = null;
let migrationDone = false;

export function setBudgetId(budgetId: string): void {
  if (currentBudgetId !== budgetId) {
    migrationDone = false;
  }
  currentBudgetId = budgetId;
}

function getLocalStorageKey(): string {
  return currentBudgetId
    ? `${LOCALSTORAGE_KEY_PREFIX}:${currentBudgetId}`
    : LOCALSTORAGE_KEY_PREFIX;
}

function readLocalStorage(): SavingsGoal[] {
  if (migrationDone) return [];
  migrationDone = true;
  try {
    const key = getLocalStorageKey();
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as SavingsGoal[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function mapRow(r: {
  id: string;
  name: string;
  target_amount: number;
  target_date: string;
  associated_account_ids: string | null;
  associated_category_ids: string | null;
  created_at: number;
  updated_at: number;
}): SavingsGoal {
  return {
    id: r.id,
    name: r.name,
    targetAmount: r.target_amount,
    targetDate: r.target_date,
    associatedAccountIds: r.associated_account_ids
      ? JSON.parse(r.associated_account_ids)
      : undefined,
    associatedCategoryIds: r.associated_category_ids
      ? JSON.parse(r.associated_category_ids)
      : undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getGoals(): Promise<SavingsGoal[]> {
  try {
    const localData = readLocalStorage();

    const rows = await send('chat-goals-get');
    let dbGoals: SavingsGoal[] = [];
    if (Array.isArray(rows)) {
      dbGoals = rows.map(mapRow);
    }

    if (localData.length > 0) {
      const existingIds = new Set(dbGoals.map(g => g.id));
      const newFromLocal = localData.filter(g => !existingIds.has(g.id));
      for (const goal of newFromLocal) {
        await send('chat-goal-create', {
          id: goal.id,
          name: goal.name,
          targetAmount: goal.targetAmount,
          targetDate: goal.targetDate,
          associatedAccountIds: goal.associatedAccountIds,
          associatedCategoryIds: goal.associatedCategoryIds,
        });
      }
      try {
        localStorage.removeItem(getLocalStorageKey());
      } catch { /* ignore */ }
      if (newFromLocal.length > 0) {
        const refreshed = await send('chat-goals-get');
        if (Array.isArray(refreshed)) {
          return refreshed.map(mapRow);
        }
      }
    }

    return dbGoals;
  } catch {
    return [];
  }
}

export async function saveGoals(_goals: SavingsGoal[]): Promise<void> {
  // no-op: individual operations handle persistence
}

export async function createGoal(params: {
  name: string;
  targetAmount: number;
  targetDate: string;
  associatedAccountIds?: string[];
  associatedCategoryIds?: string[];
}): Promise<SavingsGoal> {
  const now = Date.now();
  const id = await send('chat-goal-create', {
    name: params.name,
    targetAmount: params.targetAmount,
    targetDate: params.targetDate,
    associatedAccountIds: params.associatedAccountIds,
    associatedCategoryIds: params.associatedCategoryIds,
  });
  return {
    id,
    name: params.name,
    targetAmount: params.targetAmount,
    targetDate: params.targetDate,
    associatedAccountIds: params.associatedAccountIds,
    associatedCategoryIds: params.associatedCategoryIds,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateGoal(
  id: string,
  updates: Partial<Omit<SavingsGoal, 'id' | 'createdAt'>>,
): Promise<SavingsGoal | null> {
  try {
    await send('chat-goal-update', {
      id,
      name: updates.name,
      targetAmount: updates.targetAmount,
      targetDate: updates.targetDate,
      associatedAccountIds: updates.associatedAccountIds,
      associatedCategoryIds: updates.associatedCategoryIds,
    });
    const goals = await getGoals();
    return goals.find(g => g.id === id) || null;
  } catch {
    return null;
  }
}

export async function deleteGoal(id: string): Promise<boolean> {
  try {
    await send('chat-goal-delete', { id });
    return true;
  } catch {
    return false;
  }
}

export async function getGoalById(id: string): Promise<SavingsGoal | null> {
  const goals = await getGoals();
  return goals.find(g => g.id === id) || null;
}
