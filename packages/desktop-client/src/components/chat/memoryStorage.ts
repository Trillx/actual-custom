export type MemoryCategory = 'categorization' | 'preference' | 'context';

export type Memory = {
  id: string;
  content: string;
  category: MemoryCategory;
  createdAt: number;
  source: 'user' | 'ai';
};

const STORAGE_KEY_PREFIX = 'actual-budget-chat-memories';
const MAX_MEMORIES = 100;
const VALID_CATEGORIES = ['categorization', 'preference', 'context'] as const;
const VALID_SOURCES = ['user', 'ai'] as const;

let currentBudgetId: string | null = null;

export function setMemoryBudgetId(budgetId: string): void {
  currentBudgetId = budgetId;
}

function getStorageKey(): string {
  if (currentBudgetId) {
    return `${STORAGE_KEY_PREFIX}:${currentBudgetId}`;
  }
  return STORAGE_KEY_PREFIX;
}

function generateId(): string {
  return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

export function getMemories(): Memory[] {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidMemory);
  } catch {
    return [];
  }
}

function saveMemories(memories: Memory[]): void {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(memories));
  } catch {
    // localStorage quota exceeded or unavailable
  }
}

export function addMemory(params: {
  content: string;
  category: MemoryCategory;
  source: 'user' | 'ai';
}): Memory {
  const memories = getMemories();
  if (memories.length >= MAX_MEMORIES) {
    memories.shift();
  }
  const memory: Memory = {
    id: generateId(),
    content: params.content,
    category: params.category,
    createdAt: Date.now(),
    source: params.source,
  };
  memories.push(memory);
  saveMemories(memories);
  return memory;
}

export function updateMemory(
  id: string,
  updates: Partial<Pick<Memory, 'content' | 'category'>>,
): Memory | null {
  const memories = getMemories();
  const idx = memories.findIndex(m => m.id === id);
  if (idx === -1) return null;
  memories[idx] = { ...memories[idx], ...updates };
  saveMemories(memories);
  return memories[idx];
}
export function deleteMemory(id: string): boolean {
  const memories = getMemories();
  const filtered = memories.filter(m => m.id !== id);
  if (filtered.length === memories.length) return false;
  saveMemories(filtered);
  return true;
}

export function clearMemories(): void {
  saveMemories([]);
}

export function getMemoryById(id: string): Memory | null {
  return getMemories().find(m => m.id === id) || null;
}
