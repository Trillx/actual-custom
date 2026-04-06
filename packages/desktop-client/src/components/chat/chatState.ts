import { send } from 'loot-core/platform/client/connection';

import type { ChatMessage } from './types';

const MAX_MESSAGES = 200;
const LOCALSTORAGE_KEY_PREFIX = 'actual-budget-chat-history';

let sessionMessages: ChatMessage[] = [];
let currentBudgetId: string | null = null;
let migrationDone = false;
let savePromise: Promise<void> = Promise.resolve();

export function setChatBudgetId(budgetId: string): void {
  if (currentBudgetId !== budgetId) {
    sessionMessages = [];
    migrationDone = false;
  }
  currentBudgetId = budgetId;
}

export function getSessionMessages(): ChatMessage[] {
  return sessionMessages;
}

export function setSessionMessages(messages: ChatMessage[]): void {
  sessionMessages = messages;
  void enqueueSave(messages);
}

export function addSessionMessage(message: ChatMessage): void {
  sessionMessages = [...sessionMessages, message];
  void enqueueSave(sessionMessages);
}

export function updateSessionMessage(
  id: string,
  updates: Partial<ChatMessage>,
): void {
  sessionMessages = sessionMessages.map(m =>
    m.id === id ? { ...m, ...updates } : m,
  );
  void enqueueSave(sessionMessages);
}

export function clearSessionMessages(): void {
  sessionMessages = [];
  send('chat-messages-clear').catch(() => {});
}

function pruneMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_MESSAGES) return messages;
  return messages.slice(messages.length - MAX_MESSAGES);
}

function expireActions(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(m => {
    let updated = m;
    if (m.actionStatus === 'pending' || m.actionStatus === 'confirmed') {
      updated = {
        ...updated,
        actionStatus: 'expired' as ChatMessage['actionStatus'],
      };
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

function enqueueSave(messages: ChatMessage[]): Promise<void> {
  savePromise = savePromise
    .then(() => persistMessages(messages))
    .catch(() => {});
  return savePromise;
}

async function persistMessages(messages: ChatMessage[]): Promise<void> {
  try {
    const pruned = pruneMessages(messages);
    await send('chat-messages-save', {
      messages: pruned.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        actionStatus: m.actionStatus,
        pendingAction: m.pendingAction,
        pendingActions: m.pendingActions,
      })),
    });
  } catch {
    // ignore storage errors
  }
}

function getLocalStorageKey(): string {
  return currentBudgetId
    ? `${LOCALSTORAGE_KEY_PREFIX}:${currentBudgetId}`
    : LOCALSTORAGE_KEY_PREFIX;
}

function readLocalStorage(): ChatMessage[] {
  if (migrationDone) return [];
  migrationDone = true;
  try {
    const key = getLocalStorageKey();
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored) as ChatMessage[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function clearLocalStorage(): void {
  try {
    localStorage.removeItem(getLocalStorageKey());
  } catch {
    // ignore
  }
}

export async function loadPersistedMessages(): Promise<ChatMessage[]> {
  try {
    const localData = readLocalStorage();

    const rows = await send('chat-messages-get');
    let dbMessages: ChatMessage[] = [];
    if (Array.isArray(rows) && rows.length > 0) {
      dbMessages = rows.map(r => {
        let pendingAction: ChatMessage['pendingAction'];
        let pendingActions: ChatMessage['pendingActions'];
        try {
          pendingAction = r.pending_action
            ? JSON.parse(r.pending_action)
            : undefined;
        } catch {
          /* ignore */
        }
        try {
          pendingActions = r.pending_actions
            ? JSON.parse(r.pending_actions)
            : undefined;
        } catch {
          /* ignore */
        }
        return {
          id: r.id,
          role: r.role as ChatMessage['role'],
          content: r.content,
          timestamp: r.timestamp,
          actionStatus:
            (r.action_status as ChatMessage['actionStatus']) || undefined,
          pendingAction,
          pendingActions,
        };
      });
    }

    let merged = dbMessages;
    if (localData.length > 0) {
      const existingIds = new Set(dbMessages.map(m => m.id));
      const newFromLocal = localData.filter(m => !existingIds.has(m.id));
      if (newFromLocal.length > 0) {
        merged = [...dbMessages, ...newFromLocal].sort(
          (a, b) => a.timestamp - b.timestamp,
        );
        await persistMessages(merged);
      }
      clearLocalStorage();
    }

    if (merged.length === 0) return [];
    const expired = expireActions(merged);
    sessionMessages = expired;
    await persistMessages(expired);
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
