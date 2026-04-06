import type { ChatMessage } from './types';

const STORAGE_KEY_PREFIX = 'actual-budget-chat-history';
const MAX_MESSAGES = 200;

let sessionMessages: ChatMessage[] = [];
let currentBudgetId: string | null = null;

function getStorageKey(): string {
  if (currentBudgetId) {
    return `${STORAGE_KEY_PREFIX}:${currentBudgetId}`;
  }
  return STORAGE_KEY_PREFIX;
}

export function setChatBudgetId(budgetId: string): void {
  if (currentBudgetId !== budgetId) {
    sessionMessages = [];
  }
  currentBudgetId = budgetId;
}

export function getSessionMessages(): ChatMessage[] {
  return sessionMessages;
}

export function setSessionMessages(messages: ChatMessage[]): void {
  sessionMessages = messages;
  persistMessages(messages);
}

export function addSessionMessage(message: ChatMessage): void {
  sessionMessages = [...sessionMessages, message];
  persistMessages(sessionMessages);
}

export function updateSessionMessage(
  id: string,
  updates: Partial<ChatMessage>,
): void {
  sessionMessages = sessionMessages.map(m =>
    m.id === id ? { ...m, ...updates } : m,
  );
  persistMessages(sessionMessages);
}

export function clearSessionMessages(): void {
  sessionMessages = [];
  try {
    localStorage.removeItem(getStorageKey());
  } catch {
    // ignore storage errors
  }
}

function pruneMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_MESSAGES) return messages;
  return messages.slice(messages.length - MAX_MESSAGES);
}

function expireActions(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(m => {
    let updated = m;
    if (m.actionStatus === 'pending' || m.actionStatus === 'confirmed') {
      updated = { ...updated, actionStatus: 'expired' as ChatMessage['actionStatus'] };
    }
    if (m.pendingActions) {
      const expiredActions = m.pendingActions.map(a =>
        a.status === 'pending' || a.status === 'executing'
          ? { ...a, status: 'expired' as 'expired' }
          : a,
      );
      const hasChanges = m.pendingActions.some(
        (a, i) => a.status !== expiredActions[i].status,
      );
      if (hasChanges) {
        updated = { ...updated, pendingActions: expiredActions };
      }
    }
    return updated;
  });
}

function persistMessages(messages: ChatMessage[]): void {
  try {
    const pruned = pruneMessages(messages);
    localStorage.setItem(getStorageKey(), JSON.stringify(pruned));
  } catch {
    // ignore storage errors (quota exceeded, etc.)
  }
}

export function loadPersistedMessages(): ChatMessage[] {
  try {
    const stored = localStorage.getItem(getStorageKey());
    if (!stored) return [];
    const parsed = JSON.parse(stored) as ChatMessage[];
    if (!Array.isArray(parsed)) return [];
    const expired = expireActions(parsed);
    sessionMessages = expired;
    persistMessages(expired);
    return expired;
  } catch {
    return [];
  }
}

export function buildConversationSummary(messages: ChatMessage[]): string {
  const recentMessages = messages.slice(-10);
  if (recentMessages.length === 0) return '';

  const lines = recentMessages
    .filter(m => m.role !== 'system' && !m.content.startsWith('Querying: '))
    .map(m => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const content =
        m.content.length > 200
          ? m.content.substring(0, 200) + '...'
          : m.content;
      return `${role}: ${content}`;
    });

  if (lines.length === 0) return '';

  return (
    '\n\nPrevious conversation context (from earlier session):\n' +
    lines.join('\n')
  );
}
