-- 20260801_004_create_notifications_and_reports.sql
-- Adds notifications and reports tables used by moderation, in-app notifications, and admin workflows.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES profiles(id),
  type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_select_owner" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifications_insert_system" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notifications_update_owner" ON notifications FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id);

-- Reports for moderation
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES profiles(id),
  video_id uuid REFERENCES videos(id),
  reason text,
  details text,
  status text NOT NULL DEFAULT 'open', -- open, reviewed, actioned, dismissed
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
-- Allow public insert of reports (any logged-in user). Reads restricted to admin role in future (for now allow select true to not block functionality)
CREATE POLICY "reports_insert_auth" ON reports FOR INSERT WITH CHECK (auth.role() <> 'anon');
CREATE POLICY "reports_select_public" ON reports FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_reports_video ON reports (video_id);
