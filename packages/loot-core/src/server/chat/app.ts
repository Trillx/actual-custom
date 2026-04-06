import { v4 as uuidv4 } from 'uuid';

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
  try {
    return await db.all(
      `SELECT id, role, content, timestamp, action_status, pending_action, pending_actions
       FROM chat_messages
       WHERE tombstone = 0
       ORDER BY timestamp ASC`,
    );
  } catch {
    return [];
  }
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
  try {
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
        await db.run(
          `UPDATE chat_messages
           SET role = ?, content = ?, timestamp = ?, action_status = ?, pending_action = ?, pending_actions = ?
           WHERE id = ?`,
          [
            msg.role,
            msg.content,
            msg.timestamp,
            msg.actionStatus || null,
            pendingAction,
            pendingActions,
            msg.id,
          ],
        );
      } else {
        await db.run(
          `INSERT INTO chat_messages (id, role, content, timestamp, action_status, pending_action, pending_actions, tombstone)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            msg.id,
            msg.role,
            msg.content,
            msg.timestamp,
            msg.actionStatus || null,
            pendingAction,
            pendingActions,
          ],
        );
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
        await db.run(`UPDATE chat_messages SET tombstone = 1 WHERE id = ?`, [
          row.id,
        ]);
      }
    }
  } catch {
    // table may not exist yet
  }
}

async function clearChatMessages(): Promise<void> {
  try {
    await db.run(`UPDATE chat_messages SET tombstone = 1 WHERE tombstone = 0`);
  } catch {
    // table may not exist yet
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
  try {
    return await db.all(
      `SELECT id, content, category, created_at, source
       FROM chat_memories
       WHERE tombstone = 0
       ORDER BY created_at ASC`,
    );
  } catch {
    return [];
  }
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
  const id = existingId || uuidv4();
  await db.run(
    `INSERT INTO chat_memories (id, content, category, created_at, source, tombstone)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [id, content, category, Date.now(), source],
  );
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
  const sets: string[] = [];
  const params: (string | number)[] = [];
  if (content !== undefined) {
    sets.push('content = ?');
    params.push(content);
  }
  if (category !== undefined) {
    sets.push('category = ?');
    params.push(category);
  }
  if (sets.length === 0) return;
  params.push(id);
  await db.run(
    `UPDATE chat_memories SET ${sets.join(', ')} WHERE id = ?`,
    params,
  );
}

async function deleteChatMemory({ id }: { id: string }): Promise<void> {
  await db.run(`UPDATE chat_memories SET tombstone = 1 WHERE id = ?`, [id]);
}

async function clearChatMemories(): Promise<void> {
  try {
    await db.run(`UPDATE chat_memories SET tombstone = 1 WHERE tombstone = 0`);
  } catch {
    // table may not exist yet
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
  try {
    return await db.all(
      `SELECT id, name, target_amount, target_date, associated_account_ids, associated_category_ids, created_at, updated_at
       FROM chat_goals
       WHERE tombstone = 0
       ORDER BY created_at ASC`,
    );
  } catch {
    return [];
  }
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
  const id = existingId || uuidv4();
  await db.run(
    `INSERT INTO chat_goals (id, name, target_amount, target_date, associated_account_ids, associated_category_ids, created_at, updated_at, tombstone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      name,
      targetAmount,
      targetDate,
      associatedAccountIds ? JSON.stringify(associatedAccountIds) : null,
      associatedCategoryIds ? JSON.stringify(associatedCategoryIds) : null,
      now,
      now,
    ],
  );
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
  const sets: string[] = ['updated_at = ?'];
  const params: (string | number | null)[] = [Date.now()];
  if (name !== undefined) {
    sets.push('name = ?');
    params.push(name);
  }
  if (targetAmount !== undefined) {
    sets.push('target_amount = ?');
    params.push(targetAmount);
  }
  if (targetDate !== undefined) {
    sets.push('target_date = ?');
    params.push(targetDate);
  }
  if (associatedAccountIds !== undefined) {
    sets.push('associated_account_ids = ?');
    params.push(JSON.stringify(associatedAccountIds));
  }
  if (associatedCategoryIds !== undefined) {
    sets.push('associated_category_ids = ?');
    params.push(JSON.stringify(associatedCategoryIds));
  }
  params.push(id);
  await db.run(`UPDATE chat_goals SET ${sets.join(', ')} WHERE id = ?`, params);
}

async function deleteChatGoal({ id }: { id: string }): Promise<void> {
  await db.run(`UPDATE chat_goals SET tombstone = 1 WHERE id = ?`, [id]);
}
