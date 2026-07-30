-- Migration: 20260802_toggle_like_rpc.sql

BEGIN;

-- Toggle like RPC: atomically add or remove a like for the current user on a video.
-- Returns a single row with action = 'liked'|'unliked' and likes_count (current value)

CREATE OR REPLACE FUNCTION public.toggle_like(p_video_id uuid)
RETURNS TABLE(action text, likes_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  v_like_id uuid;
  v_likes bigint;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock the video row to serialize concurrent toggles for the same video
  PERFORM 1 FROM public.videos WHERE id = p_video_id FOR UPDATE;

  -- Check if the like already exists
  SELECT id INTO v_like_id
  FROM public.video_likes
  WHERE video_id = p_video_id AND user_id = uid
  LIMIT 1;

  IF v_like_id IS NOT NULL THEN
    -- remove the like
    DELETE FROM public.video_likes WHERE id = v_like_id;
    action := 'unliked';
  ELSE
    -- insert the like
    INSERT INTO public.video_likes (video_id, user_id) VALUES (p_video_id, uid);
    action := 'liked';
  END IF;

  -- Read the updated likes_count from videos (triggers keep it in sync)
  SELECT likes_count INTO v_likes FROM public.videos WHERE id = p_video_id;

  likes_count := COALESCE(v_likes, 0);
  RETURN NEXT;
END;
$$;

-- Grant execute to authenticated users so clients can call the RPC
GRANT EXECUTE ON FUNCTION public.toggle_like(uuid) TO authenticated;

COMMIT;
