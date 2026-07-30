-- Migration: 20260801_create_video_likes.sql

BEGIN;

-- 1) Create table to store likes per video
CREATE TABLE IF NOT EXISTS public.video_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS ux_video_likes_video_user ON public.video_likes (video_id, user_id);
CREATE INDEX IF NOT EXISTS idx_video_likes_video_id ON public.video_likes (video_id);
CREATE INDEX IF NOT EXISTS idx_video_likes_user_id ON public.video_likes (user_id);

-- Enable Row Level Security
ALTER TABLE public.video_likes ENABLE ROW LEVEL SECURITY;

-- Policies
-- Everyone can read likes
DROP POLICY IF EXISTS select_video_likes_public ON public.video_likes;
CREATE POLICY select_video_likes_public ON public.video_likes
  FOR SELECT USING (true);

-- Authenticated users can insert likes for themselves only
DROP POLICY IF EXISTS insert_video_likes_authenticated ON public.video_likes;
CREATE POLICY insert_video_likes_authenticated ON public.video_likes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND auth.role() = 'authenticated');

-- Authenticated users can delete their own likes
DROP POLICY IF EXISTS delete_video_likes_own ON public.video_likes;
CREATE POLICY delete_video_likes_own ON public.video_likes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


-- 2) Trigger functions to keep videos.likes_count in sync
-- Increment on insert, decrement on delete

CREATE OR REPLACE FUNCTION public.video_likes_count_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.videos SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.videos SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = OLD.video_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach triggers
DROP TRIGGER IF EXISTS trg_video_likes_after_insert ON public.video_likes;
CREATE TRIGGER trg_video_likes_after_insert
  AFTER INSERT ON public.video_likes
  FOR EACH ROW
  EXECUTE PROCEDURE public.video_likes_count_change();

DROP TRIGGER IF EXISTS trg_video_likes_after_delete ON public.video_likes;
CREATE TRIGGER trg_video_likes_after_delete
  AFTER DELETE ON public.video_likes
  FOR EACH ROW
  EXECUTE PROCEDURE public.video_likes_count_change();

COMMIT;
