-- Add conversation_id to ai_messages and create index for lookups

ALTER TABLE public.ai_messages
  ADD COLUMN IF NOT EXISTS conversation_id UUID NULL REFERENCES public.ai_conversations(id);

CREATE INDEX IF NOT EXISTS ai_messages_conversation_id_idx
  ON public.ai_messages (conversation_id, created_at);
