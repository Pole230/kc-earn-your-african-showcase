-- 20260801_002_create_kc_ai_tables.sql
-- Adds conversations and conversation_messages tables to store AI assistant chat history.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select_owner" ON conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "conversations_insert_owner" ON conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "conversations_update_owner" ON conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "conversations_delete_owner" ON conversations FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('user','assistant','system')),
  content text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

-- Only allow selecting messages when the parent conversation belongs to the current user
CREATE POLICY "conversation_messages_select" ON conversation_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_messages.conversation_id AND c.user_id = auth.uid())
);

CREATE POLICY "conversation_messages_insert" ON conversation_messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_messages.conversation_id AND c.user_id = auth.uid())
);

CREATE POLICY "conversation_messages_delete" ON conversation_messages FOR DELETE USING (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_messages.conversation_id AND c.user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_convmsg_conversation_id ON conversation_messages (conversation_id);
