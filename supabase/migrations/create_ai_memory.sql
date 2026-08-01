-- Migration: create_ai_memory.sql

BEGIN;

-- Conversations table
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON public.ai_conversations (user_id);

-- Messages table
CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON public.ai_messages (conversation_id);

-- Enable Row Level Security
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

-- Policies for ai_conversations
DROP POLICY IF EXISTS select_ai_conversations_owner ON public.ai_conversations;
CREATE POLICY select_ai_conversations_owner ON public.ai_conversations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS insert_ai_conversations_owner ON public.ai_conversations;
CREATE POLICY insert_ai_conversations_owner ON public.ai_conversations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS update_ai_conversations_owner ON public.ai_conversations;
CREATE POLICY update_ai_conversations_owner ON public.ai_conversations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS delete_ai_conversations_owner ON public.ai_conversations;
CREATE POLICY delete_ai_conversations_owner ON public.ai_conversations
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Policies for ai_messages
DROP POLICY IF EXISTS select_ai_messages_owner ON public.ai_messages;
CREATE POLICY select_ai_messages_owner ON public.ai_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS insert_ai_messages_owner ON public.ai_messages;
CREATE POLICY insert_ai_messages_owner ON public.ai_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c WHERE c.id = NEW.conversation_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS update_ai_messages_owner ON public.ai_messages;
CREATE POLICY update_ai_messages_owner ON public.ai_messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c WHERE c.id = NEW.conversation_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS delete_ai_messages_owner ON public.ai_messages;
CREATE POLICY delete_ai_messages_owner ON public.ai_messages
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

COMMIT;
