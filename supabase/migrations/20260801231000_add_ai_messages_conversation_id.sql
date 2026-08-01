CREATE TABLE public.ai_messages (
  -- existing columns retained by not redefining the table here; this migration adds the conversation_id column
  -- Note: ensure previous migration that created ai_messages has already been applied.
  -- Add a nullable conversation_id column referencing ai_conversations.id
  ALTER TABLE public.ai_messages
    ADD COLUMN conversation_id UUID NULL REFERENCES public.ai_conversations(id);

  -- Create index to speed up conversation lookups
  CREATE INDEX IF NOT EXISTS ai_messages_conversation_id_idx ON public.ai_messages (conversation_id, created_at);
