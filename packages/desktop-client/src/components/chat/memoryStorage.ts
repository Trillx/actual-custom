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

export function getMemories(): Memory[] {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return [];
    return JSON.parse(raw) as Memory[];
  } catch {
    return [];
  }
}

function saveMemories(memories: Memory[]): void {
  localStorage.setItem(getStorageKey(), JSON.stringify(memories));
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
