BEGIN TRANSACTION;

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      action_status TEXT,
      pending_action TEXT,
      pending_actions TEXT,
      tombstone INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages (tombstone, timestamp);

    CREATE TABLE IF NOT EXISTS chat_memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      tombstone INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_chat_memories_category ON chat_memories (tombstone, category);

    CREATE TABLE IF NOT EXISTS chat_goals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      target_amount INTEGER NOT NULL,
      target_date TEXT NOT NULL,
      associated_account_ids TEXT,
      associated_category_ids TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      tombstone INTEGER DEFAULT 0
    );

COMMIT;
