import { send } from 'loot-core/platform/client/connection';

export type MemoryCategory = 'categorization' | 'preference' | 'context';

export type Memory = {
  id: string;
  content: string;
  category: MemoryCategory;
  createdAt: number;
  source: 'user' | 'ai';
};

const LOCALSTORAGE_KEY_PREFIX = 'actual-budget-chat-memories';
const MAX_MEMORIES = 100;
const VALID_CATEGORIES = ['categorization', 'preference', 'context'] as const;
const VALID_SOURCES = ['user', 'ai'] as const;

let currentBudgetId: string | null = null;
let migrationDone = false;

export function setMemoryBudgetId(budgetId: string): void {
  if (currentBudgetId !== budgetId) {
    migrationDone = false;
  }
  currentBudgetId = budgetId;
}

function isValidMemory(entry: unknown): entry is Memory {
  if (typeof entry !== 'object' || entry === null) return false;
  const obj = entry as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    obj.id.length > 0 &&
    typeof obj.content === 'string' &&
    obj.content.length > 0 &&
    typeof obj.category === 'string' &&
    (VALID_CATEGORIES as readonly string[]).includes(obj.category) &&
    typeof obj.createdAt === 'number' &&
    isFinite(obj.createdAt) &&
    typeof obj.source === 'string' &&
    (VALID_SOURCES as readonly string[]).includes(obj.source)
  );
}

function getLocalStorageKey(): string {
  return currentBudgetId
    ? `${LOCALSTORAGE_KEY_PREFIX}:${currentBudgetId}`
    : LOCALSTORAGE_KEY_PREFIX;
}

function readLocalStorage(): Memory[] {
  if (migrationDone) return [];
  migrationDone = true;
  try {
    const key = getLocalStorageKey();
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(isValidMemory);
        if (valid.length > 0) {
          return valid;
        }
      }
    }
  } catch {
    // ignore
  }
  return [];
}

export async function getMemories(): Promise<Memory[]> {
  try {
    const localData = readLocalStorage();

    const rows = await send('chat-memories-get');
    let dbMemories: Memory[] = [];
    if (Array.isArray(rows)) {
      dbMemories = rows.map(r => ({
        id: r.id,
        content: r.content,
        category: r.category as MemoryCategory,
        createdAt: r.created_at,
        source: r.source as 'user' | 'ai',
      }));
    }

    if (localData.length > 0) {
      const existingIds = new Set(dbMemories.map(m => m.id));
      const newFromLocal = localData.filter(m => !existingIds.has(m.id));
      for (const mem of newFromLocal) {
        await send('chat-memory-add', {
          id: mem.id,
          content: mem.content,
          category: mem.category,
          source: mem.source,
        });
      }
      try {
        localStorage.removeItem(getLocalStorageKey());
      } catch { /* ignore */ }
      if (newFromLocal.length > 0) {
        const refreshed = await send('chat-memories-get');
        if (Array.isArray(refreshed)) {
          return refreshed.map(r => ({
            id: r.id,
            content: r.content,
            category: r.category as MemoryCategory,
            createdAt: r.created_at,
            source: r.source as 'user' | 'ai',
          }));
        }
      }
    }

    return dbMemories;
  } catch {
    return [];
  }
}

export async function addMemory(params: {
  content: string;
  category: MemoryCategory;
  source: 'user' | 'ai';
}): Promise<Memory> {
  const memories = await getMemories();
  if (memories.length >= MAX_MEMORIES) {
    const oldest = memories[0];
    if (oldest) {
      await send('chat-memory-delete', { id: oldest.id });
    }
  }
  const id = await send('chat-memory-add', {
    content: params.content,
    category: params.category,
    source: params.source,
  });
  return {
    id,
    content: params.content,
    category: params.category,
    createdAt: Date.now(),
    source: params.source,
  };
}

export async function updateMemory(
  id: string,
  updates: Partial<Pick<Memory, 'content' | 'category'>>,
): Promise<Memory | null> {
  try {
    await send('chat-memory-update', {
      id,
      content: updates.content,
      category: updates.category,
    });
    const memories = await getMemories();
    return memories.find(m => m.id === id) || null;
  } catch {
    return null;
  }
}

export async function deleteMemory(id: string): Promise<boolean> {
  try {
    await send('chat-memory-delete', { id });
    return true;
  } catch {
    return false;
  }
}

export async function clearMemories(): Promise<void> {
  await send('chat-memories-clear');
}

export async function getMemoryById(id: string): Promise<Memory | null> {
  const memories = await getMemories();
  return memories.find(m => m.id === id) || null;
}
