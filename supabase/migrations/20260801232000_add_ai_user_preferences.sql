-- Add ai_user_preferences table to store per-user AI preferences

CREATE TABLE public.ai_user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure one preference per user/key to support upserts
CREATE UNIQUE INDEX IF NOT EXISTS ai_user_preferences_user_key_idx ON public.ai_user_preferences (user_id, key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_user_preferences TO authenticated;
GRANT ALL ON public.ai_user_preferences TO service_role;

ALTER TABLE public.ai_user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own AI preferences" ON public.ai_user_preferences
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
