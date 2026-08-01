-- Add ai_creator_analytics table to track video performance metrics per user

CREATE TABLE public.ai_creator_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users,
  video_id UUID NULL REFERENCES videos(id),
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  watch_time INTEGER NOT NULL DEFAULT 0,
  completion_rate NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_creator_analytics_user_idx ON public.ai_creator_analytics (user_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_creator_analytics TO authenticated;
GRANT ALL ON public.ai_creator_analytics TO service_role;

ALTER TABLE public.ai_creator_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own analytics" ON public.ai_creator_analytics
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
