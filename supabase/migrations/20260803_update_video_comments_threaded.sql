-- Migration: 20260803_update_video_comments_threaded.sql

BEGIN;

-- 1) Add comments_count to videos table (if not already present)
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS comments_count bigint NOT NULL DEFAULT 0;

-- 2) Extend video_comments to support threaded replies and edited_at
ALTER TABLE public.video_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.video_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz DEFAULT NULL;

-- Indexes to improve lookup performance
CREATE INDEX IF NOT EXISTS idx_video_comments_video_id ON public.video_comments (video_id);
CREATE INDEX IF NOT EXISTS idx_video_comments_parent_id ON public.video_comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_video_comments_user_id ON public.video_comments (user_id);

-- 3) Enable RLS (already enabled in earlier migration) and recreate safe policies
ALTER TABLE public.video_comments ENABLE ROW LEVEL SECURITY;

-- Readable by everyone
DROP POLICY IF EXISTS select_video_comments_public ON public.video_comments;
CREATE POLICY select_video_comments_public ON public.video_comments
  FOR SELECT USING (true);

-- Authenticated users can insert comments for themselves only
DROP POLICY IF EXISTS insert_video_comments_authenticated ON public.video_comments;
CREATE POLICY insert_video_comments_authenticated ON public.video_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND auth.role() = 'authenticated');

-- Authenticated users can delete their own comments
DROP POLICY IF EXISTS delete_own_video_comment ON public.video_comments;
CREATE POLICY delete_own_video_comment ON public.video_comments
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Authenticated users can update their own comments (edit body)
DROP POLICY IF EXISTS update_video_comments_own ON public.video_comments;
CREATE POLICY update_video_comments_own ON public.video_comments
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4) Trigger functions to keep videos.comments_count in sync
CREATE OR REPLACE FUNCTION public.video_comments_count_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.videos SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.videos SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) WHERE id = OLD.video_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach triggers
DROP TRIGGER IF EXISTS trg_video_comments_after_insert ON public.video_comments;
CREATE TRIGGER trg_video_comments_after_insert
  AFTER INSERT ON public.video_comments
  FOR EACH ROW
  EXECUTE PROCEDURE public.video_comments_count_change();

DROP TRIGGER IF EXISTS trg_video_comments_after_delete ON public.video_comments;
CREATE TRIGGER trg_video_comments_after_delete
  AFTER DELETE ON public.video_comments
  FOR EACH ROW
  EXECUTE PROCEDURE public.video_comments_count_change();

COMMIT;
