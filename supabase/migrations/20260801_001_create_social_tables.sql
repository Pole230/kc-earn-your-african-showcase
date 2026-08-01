-- 20260801_001_create_social_tables.sql
-- Adds likes, comments, and follows tables with basic RLS policies.

-- Ensure pgcrypto for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Likes: a simple mapping of user -> video
CREATE TABLE IF NOT EXISTS likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, user_id)
);

ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

-- Allow anyone to SELECT likes (public read)
CREATE POLICY "likes_select_public" ON likes FOR SELECT USING (true);
-- Allow inserts only when auth.uid() = user_id
CREATE POLICY "likes_insert_owner" ON likes FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Allow delete only by the owner
CREATE POLICY "likes_delete_owner" ON likes FOR DELETE USING (auth.uid() = user_id);


-- Comments: threaded comments for videos
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_select_public" ON comments FOR SELECT USING (true);
CREATE POLICY "comments_insert_owner" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_update_owner" ON comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "comments_delete_owner" ON comments FOR DELETE USING (auth.uid() = user_id);


-- Follows: follower -> following mapping
CREATE TABLE IF NOT EXISTS follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follows_select_public" ON follows FOR SELECT USING (true);
CREATE POLICY "follows_insert_owner" ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "follows_delete_owner" ON follows FOR DELETE USING (auth.uid() = follower_id);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_likes_video_id ON likes (video_id);
CREATE INDEX IF NOT EXISTS idx_comments_video_id ON comments (video_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows (following_id);
