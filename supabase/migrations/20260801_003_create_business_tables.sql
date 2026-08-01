-- 20260801_003_create_business_tables.sql
-- Adds tables to support creator earnings, withdrawals, advertisers and campaigns.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Creator earnings ledger (event-based). Each row represents an earning event.
CREATE TABLE IF NOT EXISTS creator_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  video_id uuid REFERENCES videos(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  event_type text NOT NULL,
  event_ref uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE creator_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "creator_earnings_select_owner" ON creator_earnings FOR SELECT USING (auth.uid() = creator_id);
CREATE POLICY "creator_earnings_insert_system" ON creator_earnings FOR INSERT WITH CHECK (true); -- insertions expected from backend services

CREATE INDEX IF NOT EXISTS idx_creator_earnings_creator ON creator_earnings (creator_id);
CREATE INDEX IF NOT EXISTS idx_creator_earnings_video ON creator_earnings (video_id);

-- Withdrawals / payout requests
CREATE TABLE IF NOT EXISTS withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending', -- pending, processing, completed, rejected
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "withdrawals_select_owner" ON withdrawals FOR SELECT USING (auth.uid() = creator_id);
CREATE POLICY "withdrawals_insert_owner" ON withdrawals FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "withdrawals_update_owner" ON withdrawals FOR UPDATE USING (auth.uid() = creator_id);

CREATE INDEX IF NOT EXISTS idx_withdrawals_creator ON withdrawals (creator_id);

-- Advertisers
CREATE TABLE IF NOT EXISTS advertisers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE advertisers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "advertisers_select_owner" ON advertisers FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "advertisers_insert_owner" ON advertisers FOR INSERT WITH CHECK (auth.uid() = profile_id);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id uuid NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
  name text NOT NULL,
  budget numeric(12,2) NOT NULL DEFAULT 0,
  spent numeric(12,2) NOT NULL DEFAULT 0,
  start_at timestamptz,
  end_at timestamptz,
  status text NOT NULL DEFAULT 'draft', -- draft, running, paused, completed
  target jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
-- Allow advertiser owner to manage their campaigns via advertiser->profile
CREATE POLICY "campaigns_select" ON campaigns FOR SELECT USING (
  EXISTS (SELECT 1 FROM advertisers a WHERE a.id = campaigns.advertiser_id AND a.profile_id = auth.uid())
);
CREATE POLICY "campaigns_insert" ON campaigns FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM advertisers a WHERE a.id = campaigns.advertiser_id AND a.profile_id = auth.uid())
);
CREATE POLICY "campaigns_update" ON campaigns FOR UPDATE USING (
  EXISTS (SELECT 1 FROM advertisers a WHERE a.id = campaigns.advertiser_id AND a.profile_id = auth.uid())
);
CREATE POLICY "campaigns_delete" ON campaigns FOR DELETE USING (
  EXISTS (SELECT 1 FROM advertisers a WHERE a.id = campaigns.advertiser_id AND a.profile_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_campaigns_advertiser ON campaigns (advertiser_id);
