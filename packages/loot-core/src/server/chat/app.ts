import { createApp } from '../app';
import * as db from '../db';
import { mutator } from '../mutators';

export type ChatHandlers = {
  'chat-messages-get': typeof getChatMessages;
  'chat-messages-save': typeof saveChatMessages;
  'chat-messages-clear': typeof clearChatMessages;
  'chat-memories-get': typeof getChatMemories;
  'chat-memory-add': typeof addChatMemory;
  'chat-memory-update': typeof updateChatMemory;
  'chat-memory-delete': typeof deleteChatMemory;
  'chat-memories-clear': typeof clearChatMemories;
  'chat-goals-get': typeof getChatGoals;
  'chat-goal-create': typeof createChatGoal;
  'chat-goal-update': typeof updateChatGoal;
  'chat-goal-delete': typeof deleteChatGoal;
};

export const app = createApp<ChatHandlers>();

app.method('chat-messages-get', getChatMessages);
app.method('chat-messages-save', mutator(saveChatMessages));
app.method('chat-messages-clear', mutator(clearChatMessages));
app.method('chat-memories-get', getChatMemories);
app.method('chat-memory-add', mutator(addChatMemory));
app.method('chat-memory-update', mutator(updateChatMemory));
app.method('chat-memory-delete', mutator(deleteChatMemory));
app.method('chat-memories-clear', mutator(clearChatMemories));
app.method('chat-goals-get', getChatGoals);
app.method('chat-goal-create', mutator(createChatGoal));
app.method('chat-goal-update', mutator(updateChatGoal));
app.method('chat-goal-delete', mutator(deleteChatGoal));

async function getChatMessages(): Promise<
  Array<{
    id: string;
    role: string;
    content: string;
    timestamp: number;
    action_status: string | null;
    pending_action: string | null;
    pending_actions: string | null;
  }>
> {
  return db.all(
    `SELECT id, role, content, timestamp, action_status, pending_action, pending_actions
     FROM chat_messages
     WHERE tombstone = 0
     ORDER BY timestamp ASC`,
  );
}

async function saveChatMessages({
  messages,
}: {
  messages: Array<{
    id: string;
    role: string;
    content: string;
    timestamp: number;
    actionStatus?: string;
    pendingAction?: unknown;
    pendingActions?: unknown;
  }>;
}): Promise<void> {
  const existing = await db.all<{ id: string }>(
    `SELECT id FROM chat_messages WHERE tombstone = 0`,
  );
  const existingIds = new Set(existing.map(r => r.id));

  for (const msg of messages) {
    const pendingAction = msg.pendingAction
      ? JSON.stringify(msg.pendingAction)
      : null;
    const pendingActions = msg.pendingActions
      ? JSON.stringify(msg.pendingActions)
      : null;

    if (existingIds.has(msg.id)) {
      await db.update('chat_messages', {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        action_status: msg.actionStatus || null,
        pending_action: pendingAction,
        pending_actions: pendingActions,
      });
    } else {
      await db.insertWithUUID('chat_messages', {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        action_status: msg.actionStatus || null,
        pending_action: pendingAction,
        pending_actions: pendingActions,
      });
    }
  }

  const MAX_MESSAGES = 200;
  const total = await db.all<{ id: string }>(
    `SELECT id FROM chat_messages WHERE tombstone = 0`,
  );
  if (total.length > MAX_MESSAGES) {
    const toDelete = await db.all<{ id: string }>(
      `SELECT id FROM chat_messages WHERE tombstone = 0
       ORDER BY timestamp ASC
       LIMIT ?`,
      [total.length - MAX_MESSAGES],
    );
    for (const row of toDelete) {
      await db.delete_('chat_messages', row.id);
    }
  }
}

async function clearChatMessages(): Promise<void> {
  const rows = await db.all<{ id: string }>(
    `SELECT id FROM chat_messages WHERE tombstone = 0`,
  );
  for (const row of rows) {
    await db.delete_('chat_messages', row.id);
  }
}

async function getChatMemories(): Promise<
  Array<{
    id: string;
    content: string;
    category: string;
    created_at: number;
    source: string;
  }>
> {
  return db.all(
    `SELECT id, content, category, created_at, source
     FROM chat_memories
     WHERE tombstone = 0
     ORDER BY created_at ASC`,
  );
}

async function addChatMemory({
  id: existingId,
  content,
  category,
  source,
}: {
  id?: string;
  content: string;
  category: string;
  source: string;
}): Promise<string> {
  const id = await db.insertWithUUID('chat_memories', {
    ...(existingId ? { id: existingId } : {}),
    content,
    category,
    created_at: Date.now(),
    source,
  });
  return id;
}

async function updateChatMemory({
  id,
  content,
  category,
}: {
  id: string;
  content?: string;
  category?: string;
}): Promise<void> {
  const updates: Record<string, unknown> = { id };
  if (content !== undefined) updates.content = content;
  if (category !== undefined) updates.category = category;
  await db.update('chat_memories', updates);
}

async function deleteChatMemory({ id }: { id: string }): Promise<void> {
  await db.delete_('chat_memories', id);
}

async function clearChatMemories(): Promise<void> {
  const rows = await db.all<{ id: string }>(
    `SELECT id FROM chat_memories WHERE tombstone = 0`,
  );
  for (const row of rows) {
    await db.delete_('chat_memories', row.id);
  }
}

async function getChatGoals(): Promise<
  Array<{
    id: string;
    name: string;
    target_amount: number;
    target_date: string;
    associated_account_ids: string | null;
    associated_category_ids: string | null;
    created_at: number;
    updated_at: number;
  }>
> {
  return db.all(
    `SELECT id, name, target_amount, target_date, associated_account_ids, associated_category_ids, created_at, updated_at
     FROM chat_goals
     WHERE tombstone = 0
     ORDER BY created_at ASC`,
  );
}

async function createChatGoal({
  id: existingId,
  name,
  targetAmount,
  targetDate,
  associatedAccountIds,
  associatedCategoryIds,
}: {
  id?: string;
  name: string;
  targetAmount: number;
  targetDate: string;
  associatedAccountIds?: string[];
  associatedCategoryIds?: string[];
}): Promise<string> {
  const now = Date.now();
  const id = await db.insertWithUUID('chat_goals', {
    ...(existingId ? { id: existingId } : {}),
    name,
    target_amount: targetAmount,
    target_date: targetDate,
    associated_account_ids: associatedAccountIds
      ? JSON.stringify(associatedAccountIds)
      : null,
    associated_category_ids: associatedCategoryIds
      ? JSON.stringify(associatedCategoryIds)
      : null,
    created_at: now,
    updated_at: now,
  });
  return id;
}

async function updateChatGoal({
  id,
  name,
  targetAmount,
  targetDate,
  associatedAccountIds,
  associatedCategoryIds,
}: {
  id: string;
  name?: string;
  targetAmount?: number;
  targetDate?: string;
  associatedAccountIds?: string[];
  associatedCategoryIds?: string[];
}): Promise<void> {
  const updates: Record<string, unknown> = { id, updated_at: Date.now() };
  if (name !== undefined) updates.name = name;
  if (targetAmount !== undefined) updates.target_amount = targetAmount;
  if (targetDate !== undefined) updates.target_date = targetDate;
  if (associatedAccountIds !== undefined)
    updates.associated_account_ids = JSON.stringify(associatedAccountIds);
  if (associatedCategoryIds !== undefined)
    updates.associated_category_ids = JSON.stringify(associatedCategoryIds);
  await db.update('chat_goals', updates);
}

async function deleteChatGoal({ id }: { id: string }): Promise<void> {
  await db.delete_('chat_goals', id);
}
