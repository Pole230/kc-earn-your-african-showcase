-- Migration: add likes_count and updated_at to videos
-- File: supabase/migrations/20260730_add_likes_and_updated_at_to_videos.sql

BEGIN;

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS likes_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Create or replace trigger function to set updated_at on modifications
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Attach trigger to videos
DROP TRIGGER IF EXISTS set_videos_updated_at ON public.videos;
CREATE TRIGGER set_videos_updated_at
  BEFORE UPDATE ON public.videos
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE PROCEDURE public.set_updated_at();

-- Optional index to help ordering by update time
CREATE INDEX IF NOT EXISTS videos_updated_at_idx ON public.videos (updated_at desc);

COMMIT;
