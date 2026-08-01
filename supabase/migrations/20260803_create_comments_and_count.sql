-- Migration: 20260803_create_comments_and_count.sql

BEGIN;

-- 1) Create comments table
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_id uuid NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_video_id ON public.comments (video_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments (user_id);

-- Enable Row Level Security
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Policies
-- Public read access to comments
DROP POLICY IF EXISTS select_comments_public ON public.comments;
CREATE POLICY select_comments_public ON public.comments
  FOR SELECT USING (true);

-- Authenticated users can insert comments where they are the author
DROP POLICY IF EXISTS insert_comments_authenticated ON public.comments;
CREATE POLICY insert_comments_authenticated ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND auth.role() = 'authenticated');

-- Authenticated users can update/delete only their own comments
DROP POLICY IF EXISTS update_comments_owner ON public.comments;
CREATE POLICY update_comments_owner ON public.comments
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS delete_comments_owner ON public.comments;
CREATE POLICY delete_comments_owner ON public.comments
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


-- 2) Add comments_count to videos table and keep it in sync
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS comments_count bigint NOT NULL DEFAULT 0;

-- Trigger function to update comments_count
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
DROP TRIGGER IF EXISTS trg_video_comments_after_insert ON public.comments;
CREATE TRIGGER trg_video_comments_after_insert
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE PROCEDURE public.video_comments_count_change();

DROP TRIGGER IF EXISTS trg_video_comments_after_delete ON public.comments;
CREATE TRIGGER trg_video_comments_after_delete
  AFTER DELETE ON public.comments
  FOR EACH ROW
  EXECUTE PROCEDURE public.video_comments_count_change();

COMMIT;
