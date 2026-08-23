-- KC Earn safe production schema synchronization
-- Target project: kdcynqebpryaxmvizqwi
--
-- This file is intentionally not executed by the repository. Apply only after
-- reviewing in the Supabase SQL Editor. It contains no user/content/payment
-- data migration and intentionally omits the legacy wallet currency UPDATE.
--
-- Source migrations consolidated:
-- 006_follows.sql, 007_video_comments.sql
-- 20260801230000_create_ai_conversations.sql
-- 20260801231000_add_ai_messages_conversation_id.sql
-- 20260801232000_add_ai_user_preferences.sql
-- 20260801233000_add_ai_creator_analytics.sql
-- 20260801_create_video_likes.sql (supersedes 005_video_likes.sql)
-- 20260802_toggle_like_rpc.sql
-- 20260803_update_video_comments_threaded.sql
-- 20260822120000_external_video_ingestion.sql
-- 20260822130000_video_processing_failed_status.sql
-- 20260822_account_verification.sql
-- 20260822_africa_rewards_foundation.sql (without wallet currency UPDATE)
-- 20260822150000_financial_hardening.sql
-- 20260822160000_verification_bonus_hardening.sql
-- 20260822170000_welcome_payout_boundary.sql

BEGIN;

-- The current production project already has public.profiles and public.videos.
-- These objects were confirmed missing in the production schema audit.

-- Social objects: one final likes definition, replacing both historical likes migrations.
CREATE TABLE IF NOT EXISTS public.video_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_video_likes_video_user ON public.video_likes (video_id, user_id);
CREATE INDEX IF NOT EXISTS idx_video_likes_video_id ON public.video_likes (video_id);
CREATE INDEX IF NOT EXISTS idx_video_likes_user_id ON public.video_likes (user_id);
ALTER TABLE public.video_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_video_likes_public ON public.video_likes;
CREATE POLICY select_video_likes_public ON public.video_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS insert_video_likes_authenticated ON public.video_likes;
CREATE POLICY insert_video_likes_authenticated ON public.video_likes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS delete_video_likes_own ON public.video_likes;
CREATE POLICY delete_video_likes_own ON public.video_likes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS follows_follower_following_idx ON public.follows (follower_id, following_id);
CREATE INDEX IF NOT EXISTS follows_follower_idx ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS follows_following_idx ON public.follows (following_id);
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_follows_public ON public.follows;
CREATE POLICY select_follows_public ON public.follows FOR SELECT USING (true);
DROP POLICY IF EXISTS insert_follow_authenticated ON public.follows;
CREATE POLICY insert_follow_authenticated ON public.follows FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = follower_id AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS delete_own_follow ON public.follows;
CREATE POLICY delete_own_follow ON public.follows FOR DELETE TO authenticated
  USING (auth.uid() = follower_id);

CREATE TABLE IF NOT EXISTS public.video_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS video_comments_video_id_idx ON public.video_comments (video_id);
CREATE INDEX IF NOT EXISTS video_comments_user_id_idx ON public.video_comments (user_id);
ALTER TABLE public.video_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS select_video_comments_public ON public.video_comments;
CREATE POLICY select_video_comments_public ON public.video_comments FOR SELECT USING (true);
DROP POLICY IF EXISTS insert_video_comments_authenticated ON public.video_comments;
CREATE POLICY insert_video_comments_authenticated ON public.video_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS delete_own_video_comment ON public.video_comments;
CREATE POLICY delete_own_video_comment ON public.video_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
ALTER TABLE public.video_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.video_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz DEFAULT NULL;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS comments_count bigint NOT NULL DEFAULT 0;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS likes_count bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_video_comments_parent_id ON public.video_comments (parent_id);
DROP POLICY IF EXISTS update_video_comments_own ON public.video_comments;
CREATE POLICY update_video_comments_own ON public.video_comments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.video_comments_count_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) WHERE id = OLD.video_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_video_comments_after_insert ON public.video_comments;
  SELECT * INTO row_out FROM public.withdrawals WHERE user_id = uid AND idempotency_key = request_key;
  IF row_out.id IS NOT NULL THEN RETURN row_out; END IF;
CREATE TRIGGER trg_video_comments_after_insert AFTER INSERT ON public.video_comments
  FOR EACH ROW EXECUTE FUNCTION public.video_comments_count_change();
    VALUES (uid, _amount, btrim(_method), btrim(_destination), LEAST(COALESCE(fee, 0), _amount), _amount - LEAST(COALESCE(fee, 0), _amount), request_key)
  FOR EACH ROW EXECUTE FUNCTION public.video_comments_count_change();

-- Latest likes count trigger and atomic toggle RPC.
CREATE OR REPLACE FUNCTION public.video_likes_count_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = OLD.video_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_video_likes_after_insert ON public.video_likes;
CREATE TRIGGER trg_video_likes_after_insert AFTER INSERT ON public.video_likes
  FOR EACH ROW EXECUTE FUNCTION public.video_likes_count_change();
DROP TRIGGER IF EXISTS trg_video_likes_after_delete ON public.video_likes;
CREATE TRIGGER trg_video_likes_after_delete AFTER DELETE ON public.video_likes
  FOR EACH ROW EXECUTE FUNCTION public.video_likes_count_change();
CREATE OR REPLACE FUNCTION public.toggle_like(p_video_id uuid)
RETURNS TABLE(action text, likes_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v_like_id uuid; v_likes bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM 1 FROM public.videos WHERE id = p_video_id FOR UPDATE;
  SELECT id INTO v_like_id FROM public.video_likes
    WHERE video_id = p_video_id AND user_id = uid LIMIT 1;
  IF v_like_id IS NOT NULL THEN
    DELETE FROM public.video_likes WHERE id = v_like_id;
    action := 'unliked';
  ELSE
    INSERT INTO public.video_likes (video_id, user_id) VALUES (p_video_id, uid);
    action := 'liked';
  END IF;
  SELECT likes_count INTO v_likes FROM public.videos WHERE id = p_video_id;
  likes_count := COALESCE(v_likes, 0);
  RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.toggle_like(uuid) TO authenticated;

-- AI persistence objects. ai_messages already exists in production; only its
-- missing conversation relationship is added here.
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own AI conversations" ON public.ai_conversations;
CREATE POLICY "Users can view their own AI conversations" ON public.ai_conversations FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own AI conversations" ON public.ai_conversations;
CREATE POLICY "Users can insert their own AI conversations" ON public.ai_conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own AI conversations" ON public.ai_conversations;
CREATE POLICY "Users can update their own AI conversations" ON public.ai_conversations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own AI conversations" ON public.ai_conversations;
CREATE POLICY "Users can delete their own AI conversations" ON public.ai_conversations FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS ai_conversations_user_created_idx ON public.ai_conversations (user_id, created_at);

ALTER TABLE public.ai_messages
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.ai_conversations(id);
CREATE INDEX IF NOT EXISTS ai_messages_conversation_id_idx
  ON public.ai_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.ai_user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_user_preferences_user_key_idx ON public.ai_user_preferences (user_id, key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_user_preferences TO authenticated;
GRANT ALL ON public.ai_user_preferences TO service_role;
ALTER TABLE public.ai_user_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own AI preferences" ON public.ai_user_preferences;
CREATE POLICY "Users can manage their own AI preferences" ON public.ai_user_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.ai_creator_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id uuid REFERENCES public.videos(id),
  views integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  watch_time integer NOT NULL DEFAULT 0,
  completion_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_creator_analytics_user_idx ON public.ai_creator_analytics (user_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_creator_analytics TO authenticated;
GRANT ALL ON public.ai_creator_analytics TO service_role;
ALTER TABLE public.ai_creator_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can access their own analytics" ON public.ai_creator_analytics;
CREATE POLICY "Users can access their own analytics" ON public.ai_creator_analytics FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- External feed objects.
CREATE TABLE IF NOT EXISTS public.external_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_platform text NOT NULL CHECK (source_platform IN ('youtube','tiktok','facebook','instagram','other_authorized_source')),
  original_content_id text NOT NULL,
  original_url text NOT NULL,
  creator_name text NOT NULL,
  creator_attribution text NOT NULL,
  thumbnail_url text,
  embed_url text,
  title text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('Funny','Music','Experience','Sports','Learning','Serious Topics')),
  published_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  authorization_type text NOT NULL CHECK (authorization_type IN ('official_api','official_embed','licensed_feed','creator_authorized_account','user_authorized_import')),
  external_status text NOT NULL DEFAULT 'active' CHECK (external_status IN ('active','unavailable','disabled','revoked')),
  last_synced_at timestamptz,
  country_code text,
  language_code text,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_platform, original_content_id)
);
CREATE INDEX IF NOT EXISTS external_videos_feed_idx ON public.external_videos (external_status, category, published_at DESC);
CREATE INDEX IF NOT EXISTS external_videos_country_idx ON public.external_videos (country_code);
ALTER TABLE public.external_videos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS external_videos_public_read ON public.external_videos;
CREATE POLICY external_videos_public_read ON public.external_videos FOR SELECT USING (external_status = 'active');
GRANT SELECT ON public.external_videos TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.external_ingestion_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  automatic_ingestion_enabled boolean NOT NULL DEFAULT false,
  user_upload_priority numeric(5,2) NOT NULL DEFAULT 0.70 CHECK (user_upload_priority BETWEEN 0 AND 1),
  max_external_feed_ratio numeric(5,2) NOT NULL DEFAULT 0.30 CHECK (max_external_feed_ratio BETWEEN 0 AND 1),
  external_content_limit integer NOT NULL DEFAULT 20 CHECK (external_content_limit > 0),
  ingestion_frequency_minutes integer NOT NULL DEFAULT 360 CHECK (ingestion_frequency_minutes >= 15),
  approved_categories text[] NOT NULL DEFAULT ARRAY['Funny','Music','Experience','Sports','Learning','Serious Topics'],
  supported_countries text[] NOT NULL DEFAULT ARRAY['NG'],
  enabled_providers text[] NOT NULL DEFAULT ARRAY[]::text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.external_ingestion_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.external_ingestion_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.external_ingestion_config FROM anon, authenticated;
CREATE TABLE IF NOT EXISTS public.external_ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  discovered_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  unavailable_count integer NOT NULL DEFAULT 0,
  error_message text
);
ALTER TABLE public.external_ingestion_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.external_ingestion_runs FROM anon, authenticated;

-- The current videos.status column is text in the original schema. Add the
-- required value only when this database uses the repository enum type.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'video_status') THEN
    ALTER TYPE public.video_status ADD VALUE IF NOT EXISTS 'failed';
  END IF;
END $$;

-- Application-managed email/phone verification. This does not enable Supabase
-- native phone Auth and does not configure Twilio.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.account_verifications (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number text,
  phone_verified_at timestamptz,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.verification_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('phone', 'email')),
  target text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.verification_bonus_claims (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING_VERIFICATION_BONUS', 'CREDITED', 'EXPIRED')),
  expires_at timestamptz NOT NULL,
  credited_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS verification_challenges_active_idx ON public.verification_challenges (user_id, channel, created_at DESC) WHERE consumed_at IS NULL;
ALTER TABLE public.account_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_bonus_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_verifications_select_own ON public.account_verifications;
CREATE POLICY account_verifications_select_own ON public.account_verifications FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS verification_bonus_claims_select_own ON public.verification_bonus_claims;
CREATE POLICY verification_bonus_claims_select_own ON public.verification_bonus_claims FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON public.verification_bonus_claims TO authenticated;

CREATE OR REPLACE FUNCTION public.normalize_email(p_email text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT lower(btrim(p_email)) $$;
CREATE OR REPLACE FUNCTION public.normalize_registration_phone(p_phone text)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE normalized text := regexp_replace(btrim(p_phone), '[\s().-]', '', 'g');
BEGIN
  IF normalized !~ '^\+[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'Use an international phone number'; END IF;
  RETURN normalized;
END;
$$;
CREATE TABLE IF NOT EXISTS public.blocked_disposable_email_domains (domain text PRIMARY KEY);
INSERT INTO public.blocked_disposable_email_domains (domain) VALUES
  ('10minutemail.com'), ('guerrillamail.com'), ('mailinator.com'), ('tempmail.com'), ('temp-mail.org'), ('yopmail.com') ON CONFLICT DO NOTHING;
REVOKE ALL ON public.blocked_disposable_email_domains FROM anon, authenticated;
CREATE TABLE IF NOT EXISTS public.blocked_phone_prefixes (prefix text PRIMARY KEY);
REVOKE ALL ON public.blocked_phone_prefixes FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.is_disposable_email(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT split_part(public.normalize_email(p_email), '@', 2) IN (SELECT domain FROM public.blocked_disposable_email_domains)
$$;
CREATE OR REPLACE FUNCTION public.is_blocked_phone(p_phone text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.blocked_phone_prefixes WHERE public.normalize_registration_phone(p_phone) LIKE prefix || '%')
$$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_normalized text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS registration_phone text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_normalized_idx ON public.profiles (email_normalized) WHERE email_normalized IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_registration_phone_idx ON public.profiles (registration_phone) WHERE registration_phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS account_verifications_phone_number_idx ON public.account_verifications (phone_number) WHERE phone_number IS NOT NULL;
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE email_value text := public.normalize_email(NEW.email); phone_value text := NULLIF(btrim(NEW.raw_user_meta_data ->> 'phone'), '');
BEGIN
  IF email_value IS NULL OR public.is_disposable_email(email_value) THEN RAISE EXCEPTION 'Disposable email addresses are not accepted'; END IF;
  IF phone_value IS NOT NULL THEN
    phone_value := public.normalize_registration_phone(phone_value);
    IF public.is_blocked_phone(phone_value) THEN RAISE EXCEPTION 'This phone number type is not accepted'; END IF;
  END IF;
  INSERT INTO public.profiles (id, display_name, email_normalized, registration_phone, created_at)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(email_value, '@', 1)), email_value, phone_value, now())
    ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_verification_challenge(p_channel text, p_target text, p_code_hash text, p_expires_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE challenge_id uuid; target_value text := btrim(p_target);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_channel NOT IN ('phone', 'email') THEN RAISE EXCEPTION 'Invalid verification channel'; END IF;
  IF p_channel = 'phone' THEN
    target_value := public.normalize_registration_phone(target_value);
    IF public.is_blocked_phone(target_value) THEN RAISE EXCEPTION 'This phone number type is not accepted'; END IF;
    IF EXISTS (SELECT 1 FROM public.account_verifications WHERE phone_number = target_value AND user_id <> auth.uid()) THEN RAISE EXCEPTION 'This phone number is already in use'; END IF;
  ELSE
    target_value := public.normalize_email(target_value);
    IF public.is_disposable_email(target_value) THEN RAISE EXCEPTION 'Disposable email addresses are not accepted'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.verification_challenges WHERE user_id = auth.uid() AND channel = p_channel AND consumed_at IS NULL AND created_at > now() - interval '60 seconds') THEN RAISE EXCEPTION 'Please wait before requesting another code'; END IF;
  UPDATE public.verification_challenges SET consumed_at = now() WHERE user_id = auth.uid() AND channel = p_channel AND consumed_at IS NULL;
  INSERT INTO public.account_verifications (user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  INSERT INTO public.verification_challenges (user_id, channel, target, code_hash, expires_at) VALUES (auth.uid(), p_channel, target_value, p_code_hash, p_expires_at) RETURNING id INTO challenge_id;
  RETURN challenge_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.complete_verification(p_channel text, p_code_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE challenge public.verification_challenges;
  fully_verified boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO challenge FROM public.verification_challenges WHERE user_id = auth.uid() AND channel = p_channel AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF challenge.id IS NULL OR challenge.expires_at <= now() THEN RAISE EXCEPTION 'Code expired or unavailable'; END IF;
  IF challenge.attempts >= 5 THEN RAISE EXCEPTION 'Too many attempts'; END IF;
  UPDATE public.verification_challenges SET attempts = attempts + 1 WHERE id = challenge.id;
  IF challenge.code_hash <> p_code_hash THEN RAISE EXCEPTION 'Invalid verification code'; END IF;
  UPDATE public.verification_challenges SET consumed_at = now() WHERE id = challenge.id;
  INSERT INTO public.account_verifications (user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  IF p_channel = 'phone' THEN
    UPDATE public.account_verifications SET phone_number = public.normalize_registration_phone(challenge.target), phone_verified_at = now(), updated_at = now() WHERE user_id = auth.uid();
  ELSIF p_channel = 'email' THEN
    UPDATE public.account_verifications SET email_verified_at = now(), updated_at = now() WHERE user_id = auth.uid();
  ELSE RAISE EXCEPTION 'Invalid verification channel'; END IF;
  SELECT phone_verified_at IS NOT NULL AND email_verified_at IS NOT NULL INTO fully_verified
    FROM public.account_verifications WHERE user_id = auth.uid();
  IF fully_verified THEN
    UPDATE public.verification_bonus_claims SET amount = cfg.welcome_bonus_amount, currency = 'NGN'
      FROM public.platform_reward_config cfg
      WHERE verification_bonus_claims.user_id = auth.uid()
        AND verification_bonus_claims.status = 'PENDING_VERIFICATION_BONUS'
        AND cfg.id = true AND cfg.country_code = 'NG';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.start_verification_challenge(text, text, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_verification(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_verification_challenge(text, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_verification(text, text) TO authenticated;

-- Rewards foundation. This deliberately does not update existing wallet rows.
CREATE TABLE IF NOT EXISTS public.supported_countries (
  country_code text PRIMARY KEY, country_name text NOT NULL, currency text NOT NULL, locale text NOT NULL, is_live boolean NOT NULL DEFAULT false
);
INSERT INTO public.supported_countries (country_code, country_name, currency, locale, is_live) VALUES ('NG', 'Nigeria', 'NGN', 'en-NG', true)
ON CONFLICT (country_code) DO UPDATE SET currency = EXCLUDED.currency, locale = EXCLUDED.locale, is_live = true;
ALTER TABLE public.supported_countries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS supported_countries_read ON public.supported_countries;
CREATE POLICY supported_countries_read ON public.supported_countries FOR SELECT USING (is_live = true);
GRANT SELECT ON public.supported_countries TO authenticated, anon;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS promotional_bonus_balance numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS referral_bonus_locked numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS referral_bonus_unlocked numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS platform_fee numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS payout_amount numeric(14,2);
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_user_idempotency_idx ON public.withdrawals (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('promotional_bonus','real_earnings','referral_bonus','withdrawable_balance','pending_withdrawal','platform_fee')),
  amount numeric(14,2) NOT NULL, currency text NOT NULL, reference text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_ledger_user_created_idx ON public.wallet_ledger (user_id, created_at DESC);
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallet_ledger_select_own ON public.wallet_ledger;
CREATE POLICY wallet_ledger_select_own ON public.wallet_ledger FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON public.wallet_ledger TO authenticated;
CREATE TABLE IF NOT EXISTS public.platform_reward_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id), country_code text NOT NULL DEFAULT 'NG', signup_bonus numeric(14,2) NOT NULL DEFAULT 3000,
  referral_target integer NOT NULL DEFAULT 10 CHECK (referral_target > 0), referral_reward numeric(14,2) NOT NULL DEFAULT 2000 CHECK (referral_reward >= 0),
  minimum_withdrawal numeric(14,2) NOT NULL DEFAULT 20000 CHECK (minimum_withdrawal > 0), withdrawal_fee numeric(14,2) NOT NULL DEFAULT 3000 CHECK (withdrawal_fee >= 0), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_reward_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.platform_reward_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reward_config_read ON public.platform_reward_config;
CREATE POLICY reward_config_read ON public.platform_reward_config FOR SELECT USING (true);
GRANT SELECT ON public.platform_reward_config TO authenticated, anon;
ALTER TABLE public.platform_reward_config
  ADD COLUMN IF NOT EXISTS welcome_bonus_amount numeric(14,2) NOT NULL DEFAULT 3000 CHECK (welcome_bonus_amount > 0),
  ADD COLUMN IF NOT EXISTS welcome_bonus_payout_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS welcome_bonus_budget_remaining numeric(14,2) NOT NULL DEFAULT 0 CHECK (welcome_bonus_budget_remaining >= 0);

CREATE OR REPLACE FUNCTION public.create_pending_verification_bonus()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE reward numeric; currency_code text;
BEGIN
  SELECT signup_bonus INTO reward FROM public.platform_reward_config WHERE id = true AND country_code = 'NG';
  SELECT currency INTO currency_code FROM public.wallets WHERE user_id = NEW.id;
  IF reward > 0 THEN
    INSERT INTO public.verification_bonus_claims (user_id, amount, currency, status, expires_at)
      VALUES (NEW.id, reward, COALESCE(currency_code, 'NGN'), 'PENDING_VERIFICATION_BONUS', now() + interval '30 days')
      ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_nigeria_signup_bonus ON public.profiles;
DROP TRIGGER IF EXISTS profiles_pending_verification_bonus ON public.profiles;
CREATE TRIGGER profiles_pending_verification_bonus AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_pending_verification_bonus();
REVOKE ALL ON FUNCTION public.create_pending_verification_bonus() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.platform_promotional_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), expense_type text NOT NULL CHECK (expense_type = 'WELCOME_BONUS_PROMOTIONAL_EXPENSE'),
  amount numeric(14,2) NOT NULL CHECK (amount > 0), currency text NOT NULL, reference text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.welcome_bonus_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id), reference text NOT NULL UNIQUE, provider text NOT NULL,
  provider_reference text, recipient_reference text NOT NULL, amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency = 'NGN'),
  status text NOT NULL CHECK (status IN ('PENDING_VERIFICATION','ELIGIBLE','PAYOUT_QUEUED','PROCESSING','PAID','FAILED','EXPIRED','CANCELLED')),
  consented_at timestamptz, queued_at timestamptz, processing_at timestamptz, paid_at timestamptz, failed_at timestamptz,
  failure_reason text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS welcome_bonus_payouts_status_idx ON public.welcome_bonus_payouts (status);
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS verified_at timestamptz, ADD COLUMN IF NOT EXISTS verification_reference text;
ALTER TABLE public.platform_promotional_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.welcome_bonus_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS welcome_bonus_payouts_select_own ON public.welcome_bonus_payouts;
CREATE POLICY welcome_bonus_payouts_select_own ON public.welcome_bonus_payouts FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.platform_promotional_expenses FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.welcome_bonus_payouts FROM anon, authenticated;
GRANT SELECT ON public.welcome_bonus_payouts TO authenticated;

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE, referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','qualified','rejected')), qualified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), CHECK (referrer_id <> referred_id)
);
CREATE INDEX IF NOT EXISTS referrals_referrer_status_idx ON public.referrals (referrer_id, status);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referrals_select_own ON public.referrals;
CREATE POLICY referrals_select_own ON public.referrals FOR SELECT TO authenticated USING (referrer_id = auth.uid() OR referred_id = auth.uid());
GRANT SELECT ON public.referrals TO authenticated;

CREATE OR REPLACE FUNCTION public.register_referral(p_referral_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); referrer uuid; referral_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO referrer FROM public.profiles WHERE referral_code = upper(btrim(p_referral_code)) AND id <> uid;
  IF referrer IS NULL THEN RAISE EXCEPTION 'Referral code not found'; END IF;
  INSERT INTO public.referrals (referrer_id, referred_id, referral_code)
    VALUES (referrer, uid, upper(btrim(p_referral_code)))
    ON CONFLICT (referred_id) DO NOTHING RETURNING id INTO referral_id;
  RETURN jsonb_build_object('registered', referral_id IS NOT NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.register_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_referral(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.qualify_referral(p_referred_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE referral_row public.referrals; reward numeric; currency_code text; target integer; qualified_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO referral_row FROM public.referrals WHERE referred_id = p_referred_id FOR UPDATE;
  IF referral_row.id IS NULL OR referral_row.status <> 'pending' THEN RETURN jsonb_build_object('qualified', false); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.account_verifications WHERE user_id = referral_row.referred_id AND phone_verified_at IS NOT NULL AND email_verified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Referred account must verify phone and email';
  END IF;
  SELECT referral_reward, referral_target INTO reward, target FROM public.platform_reward_config WHERE id = true AND country_code = 'NG';
  SELECT count(*) INTO qualified_count FROM public.referrals WHERE referrer_id = referral_row.referrer_id AND status = 'qualified';
  UPDATE public.referrals SET status = 'qualified', qualified_at = now() WHERE id = referral_row.id;
  IF qualified_count + 1 >= target AND reward > 0 THEN
    SELECT currency INTO currency_code FROM public.wallets WHERE user_id = referral_row.referrer_id FOR UPDATE;
    PERFORM public.grant_reward(referral_row.referrer_id, 'referral', 'referral-target:' || target::text, reward, 'Referral reward');
  END IF;
  RETURN jsonb_build_object('qualified', true, 'reward_unlocked', qualified_count + 1 >= target);
END;
$$;
REVOKE ALL ON FUNCTION public.qualify_referral(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qualify_referral(uuid) TO authenticated;

-- Latest financial controls and ledger columns. No existing balances are updated.
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS real_earnings_balance numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS withdrawal_reserved_balance numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.wallet_ledger ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'debit' CHECK (direction IN ('credit', 'debit'));
ALTER TABLE public.wallet_ledger ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_idempotency_idx ON public.wallet_ledger (user_id, entry_type, reference) WHERE reference IS NOT NULL;
ALTER TABLE public.earnings ADD COLUMN IF NOT EXISTS external_reference text;
CREATE UNIQUE INDEX IF NOT EXISTS earnings_external_reference_idx ON public.earnings (user_id, external_reference) WHERE external_reference IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.platform_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text NOT NULL CHECK (source IN ('withdrawal_fee','advertising','other')),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0), currency text NOT NULL, reference text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (source, reference)
);
ALTER TABLE public.platform_revenue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_revenue_admin_read ON public.platform_revenue;
CREATE POLICY platform_revenue_admin_read ON public.platform_revenue FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.platform_revenue TO authenticated;
CREATE TABLE IF NOT EXISTS public.platform_financial_controls (
  id boolean PRIMARY KEY DEFAULT true CHECK (id), earnings_enabled boolean NOT NULL DEFAULT true, withdrawals_enabled boolean NOT NULL DEFAULT true,
  require_verified_contacts boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_financial_controls (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.platform_financial_controls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_controls_admin_read ON public.platform_financial_controls;
CREATE POLICY financial_controls_admin_read ON public.platform_financial_controls FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.platform_financial_controls TO authenticated;

-- Latest ledger-backed earnings trigger. It changes future inserts only.
CREATE OR REPLACE FUNCTION public.apply_earning_to_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wallet_currency text;
  ledger_id uuid;
BEGIN
  IF NEW.amount <= 0 THEN RETURN NEW; END IF;
  IF NOT COALESCE((SELECT earnings_enabled FROM public.platform_financial_controls WHERE id), true) THEN
    RAISE EXCEPTION 'Creator earnings are temporarily paused';
  END IF;
  SELECT currency INTO wallet_currency FROM public.wallets WHERE user_id = NEW.user_id FOR UPDATE;
  INSERT INTO public.wallet_ledger (user_id, entry_type, amount, currency, reference, direction, metadata)
    VALUES (NEW.user_id, 'real_earnings', NEW.amount, COALESCE(wallet_currency, 'NGN'), COALESCE(NEW.external_reference, 'earning:' || NEW.id::text), 'credit',
      jsonb_build_object('source', NEW.source, 'video_id', NEW.video_id))
    ON CONFLICT (user_id, entry_type, reference) DO NOTHING
    RETURNING id INTO ledger_id;
  IF ledger_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.wallets (user_id, available_balance, real_earnings_balance, lifetime_earned, currency)
    VALUES (NEW.user_id, NEW.amount, NEW.amount, NEW.amount, COALESCE(wallet_currency, 'NGN'))
    ON CONFLICT (user_id) DO UPDATE SET
      available_balance = public.wallets.available_balance + NEW.amount,
      real_earnings_balance = public.wallets.real_earnings_balance + NEW.amount,
      lifetime_earned = public.wallets.lifetime_earned + NEW.amount,
      updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS earnings_apply_to_wallet ON public.earnings;
CREATE TRIGGER earnings_apply_to_wallet AFTER INSERT ON public.earnings
  FOR EACH ROW EXECUTE FUNCTION public.apply_earning_to_wallet();

CREATE OR REPLACE FUNCTION public.credit_earning(
  _user_id uuid, _amount numeric, _source public.earning_source, _note text DEFAULT NULL,
  _video_id uuid DEFAULT NULL, _reference text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE earning_id uuid;
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0 OR NULLIF(btrim(_reference), '') IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.wallets (user_id) VALUES (_user_id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.earnings (user_id, amount, source, note, video_id, external_reference)
    VALUES (_user_id, _amount, _source, _note, _video_id, btrim(_reference))
    ON CONFLICT (user_id, external_reference) WHERE external_reference IS NOT NULL DO NOTHING
    RETURNING id INTO earning_id;
  IF earning_id IS NULL THEN
    SELECT id INTO earning_id FROM public.earnings
      WHERE user_id = _user_id AND external_reference = btrim(_reference);
  END IF;
  RETURN earning_id;
END;
$$;
REVOKE ALL ON FUNCTION public.credit_earning(uuid, numeric, public.earning_source, text, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.grant_reward(
  _user_id uuid, _kind public.reward_kind, _reference text, _amount numeric, _note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE claim_id uuid;
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0 OR NULLIF(btrim(_reference), '') IS NULL THEN
    RETURN jsonb_build_object('granted', false, 'amount', 0, 'reason', 'invalid');
  END IF;
  INSERT INTO public.reward_claims (user_id, kind, reference, amount)
    VALUES (_user_id, _kind, btrim(_reference), _amount)
    ON CONFLICT (user_id, kind, reference) DO NOTHING
    RETURNING id INTO claim_id;
  IF claim_id IS NULL THEN
    RETURN jsonb_build_object('granted', false, 'amount', 0, 'reason', 'already_claimed');
  END IF;
  PERFORM public.credit_earning(_user_id, _amount,
    CASE WHEN _kind = 'referral' THEN 'referral'::public.earning_source ELSE 'bonus'::public.earning_source END,
    COALESCE(_note, 'KC Earn reward'), NULL, 'reward:' || _kind::text || ':' || btrim(_reference));
  RETURN jsonb_build_object('granted', true, 'amount', _amount);
END;
$$;
REVOKE ALL ON FUNCTION public.grant_reward(uuid, public.reward_kind, text, numeric, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_daily_login()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); cfg public.payout_config;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO cfg FROM public.payout_config WHERE id;
  RETURN public.grant_reward(uid, 'daily_login', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
    cfg.daily_login_reward, 'Daily login reward');
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_daily_login() TO authenticated;

-- Verified-view reward RPC.
CREATE OR REPLACE FUNCTION public.record_video_view(
  _video_id uuid, _watch_seconds integer, _percent_watched numeric,
  _device text DEFAULT NULL, _country text DEFAULT NULL,
  _session_key text DEFAULT NULL, _ip_hash text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg public.payout_config; _viewer uuid := auth.uid(); _creator uuid;
  _duration integer; _dupe boolean := false; _fraud text;
  _valid boolean := true; _amount numeric := 0; _creator_today numeric := 0;
  _viewer_today numeric := 0; _key text; _views integer;
BEGIN
  IF _video_id IS NULL THEN RAISE EXCEPTION 'video_id is required'; END IF;
  _watch_seconds := GREATEST(COALESCE(_watch_seconds, 0), 0);
  _percent_watched := LEAST(GREATEST(COALESCE(_percent_watched, 0), 0), 100);
  SELECT user_id, duration_seconds INTO _creator, _duration FROM public.videos WHERE id = _video_id;
  IF _creator IS NULL THEN RAISE EXCEPTION 'Video not found'; END IF;
  SELECT * INTO cfg FROM public.payout_config WHERE id;
  _key := COALESCE(_viewer::text, _ip_hash, _session_key, 'anon');
  PERFORM pg_advisory_xact_lock(hashtext(_video_id::text || ':' || _key));
  SELECT EXISTS (
    SELECT 1 FROM public.video_views v WHERE v.video_id = _video_id AND v.is_valid
      AND v.created_at > now() - make_interval(mins => cfg.dedup_window_minutes)
      AND ((_viewer IS NOT NULL AND v.viewer_id = _viewer)
        OR (_viewer IS NULL AND _ip_hash IS NOT NULL AND v.ip_hash = _ip_hash)
        OR (_viewer IS NULL AND _ip_hash IS NULL AND _session_key IS NOT NULL AND v.session_key = _session_key))
  ) INTO _dupe;
  IF _dupe THEN _valid := false; _fraud := 'duplicate_window';
  ELSIF _percent_watched <= 0 AND _watch_seconds <= 0 THEN _valid := false; _fraud := 'no_watch_time';
  ELSIF _duration IS NOT NULL AND _duration > 0 AND _watch_seconds > (_duration * 2) THEN _valid := false; _fraud := 'impossible_watch_time';
  ELSIF (SELECT count(*) FROM public.video_views v WHERE v.created_at > now() - interval '1 minute'
    AND ((_viewer IS NOT NULL AND v.viewer_id = _viewer) OR (_viewer IS NULL AND _ip_hash IS NOT NULL AND v.ip_hash = _ip_hash))) > 30
    THEN _valid := false; _fraud := 'rate_limited';
  END IF;
  IF _valid THEN
    IF _viewer IS NOT NULL AND _viewer = _creator THEN _fraud := 'self_view_no_earning';
    ELSIF _watch_seconds < cfg.min_watch_seconds AND _percent_watched < cfg.min_watch_percent THEN _fraud := 'below_min_watch';
    ELSE
      SELECT COALESCE(sum(earned_amount), 0) INTO _creator_today FROM public.video_views
        WHERE creator_id = _creator AND created_at >= date_trunc('day', now());
      SELECT COALESCE(sum(earned_amount), 0) INTO _viewer_today FROM public.video_views
        WHERE created_at >= date_trunc('day', now())
          AND ((_viewer IS NOT NULL AND viewer_id = _viewer) OR (_viewer IS NULL AND _ip_hash IS NOT NULL AND ip_hash = _ip_hash));
      IF _creator_today >= cfg.daily_creator_limit THEN _fraud := 'creator_daily_limit';
      ELSIF _viewer_today >= cfg.per_viewer_daily_limit THEN _fraud := 'viewer_daily_limit';
      ELSE
        _amount := LEAST(cfg.rate_per_view, cfg.daily_creator_limit - _creator_today, cfg.per_viewer_daily_limit - _viewer_today);
        IF _amount < 0 THEN _amount := 0; END IF;
      END IF;
    END IF;
  END IF;
  INSERT INTO public.video_views (video_id, creator_id, viewer_id, session_key, watch_seconds, percent_watched,
    device, ip_hash, country, is_valid, fraud_reason, earned_amount)
  VALUES (_video_id, _creator, _viewer, _session_key, _watch_seconds, _percent_watched,
    _device, _ip_hash, _country, _valid, _fraud, _amount) RETURNING id INTO _view_id;
  IF _valid THEN
    UPDATE public.videos SET views_count = views_count + 1, updated_at = now()
      WHERE id = _video_id RETURNING views_count INTO _views;
    IF _amount > 0 THEN
      PERFORM public.credit_earning(_creator, _amount, 'views', 'Verified view earnings', _video_id, 'view:' || _view_id::text);
    END IF;
    IF _views IN (1000, 10000, 100000, 1000000) THEN
      PERFORM public.grant_reward(_creator, 'milestone', _video_id::text || ':' || _views::text,
        cfg.milestone_reward, _views::text || ' views milestone reached');
    END IF;
  END IF;
  RETURN jsonb_build_object('valid', _valid, 'earned', _amount, 'reason', _fraud);
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_video_view(uuid, integer, numeric, text, text, text, text) TO authenticated, anon;

-- Latest withdrawal authorization from financial_hardening. It only mutates
-- the caller's wallet after eligibility and balance checks succeed.
CREATE OR REPLACE FUNCTION public.request_withdrawal(_amount numeric, _method text, _destination text)
RETURNS public.withdrawals LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); available numeric; minimum numeric; fee numeric; currency_code text; row_out public.withdrawals; request_key text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((SELECT withdrawals_enabled FROM public.platform_financial_controls WHERE id), true) THEN RAISE EXCEPTION 'Withdrawals are temporarily paused'; END IF;
  IF COALESCE((SELECT require_verified_contacts FROM public.platform_financial_controls WHERE id), true)
    AND NOT EXISTS (SELECT 1 FROM public.account_verifications WHERE user_id = uid AND phone_verified_at IS NOT NULL AND email_verified_at IS NOT NULL)
    THEN RAISE EXCEPTION 'Verify your phone number and email before requesting a withdrawal'; END IF;
  SELECT minimum_withdrawal, withdrawal_fee INTO minimum, fee FROM public.platform_reward_config WHERE id = true AND country_code = 'NG';
  IF _amount IS NULL OR _amount < COALESCE(minimum, 20000) THEN RAISE EXCEPTION 'Minimum withdrawal is %', COALESCE(minimum, 20000); END IF;
  IF btrim(COALESCE(_method, '')) = '' OR btrim(COALESCE(_destination, '')) = '' THEN RAISE EXCEPTION 'Payout method and destination are required'; END IF;
  request_key := encode(digest(uid::text || ':' || _amount::text || ':' || btrim(_method) || ':' || btrim(_destination), 'sha256'), 'hex');
  SELECT available_balance, currency INTO available, currency_code FROM public.wallets WHERE user_id = uid FOR UPDATE;
  IF available IS NULL OR available < _amount THEN RAISE EXCEPTION 'Insufficient eligible real earnings'; END IF;
  INSERT INTO public.withdrawals (user_id, amount, method, destination, platform_fee, payout_amount, idempotency_key)
    VALUES (uid, _amount, btrim(_method), btrim(_destination), LEAST(COALESCE(fee, 0), _amount), _amount - LEAST(COALESCE(fee, 0), _amount))
      , request_key
    ON CONFLICT (user_id, idempotency_key) DO NOTHING
    RETURNING * INTO row_out;
  IF row_out.id IS NULL THEN
    SELECT * INTO row_out FROM public.withdrawals WHERE user_id = uid AND idempotency_key = request_key;
    RETURN row_out;
  END IF;
  UPDATE public.wallets SET available_balance = available_balance - _amount,
    pending_balance = pending_balance + _amount, withdrawal_reserved_balance = withdrawal_reserved_balance + _amount, updated_at = now()
    WHERE user_id = uid;
  INSERT INTO public.wallet_ledger (user_id, entry_type, amount, currency, reference, direction)
    VALUES (uid, 'pending_withdrawal', _amount, COALESCE(currency_code, 'NGN'), 'withdrawal:' || row_out.id::text, 'debit'),
      (uid, 'platform_fee', LEAST(COALESCE(fee, 0), _amount), COALESCE(currency_code, 'NGN'), 'withdrawal-fee:' || row_out.id::text, 'debit')
    ON CONFLICT DO NOTHING;
  INSERT INTO public.platform_revenue (source, amount, currency, reference)
    VALUES ('withdrawal_fee', LEAST(COALESCE(fee, 0), _amount), COALESCE(currency_code, 'NGN'), row_out.id::text)
    ON CONFLICT DO NOTHING;
  RETURN row_out;
END;
$$;
REVOKE ALL ON FUNCTION public.request_withdrawal(numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.queue_welcome_bonus_payout(p_bank_account_id uuid, p_consent boolean)
RETURNS public.welcome_bonus_payouts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); claim public.verification_bonus_claims; bank public.bank_accounts;
  cfg public.platform_reward_config; result public.welcome_bonus_payouts; payout_reference text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT p_consent THEN RAISE EXCEPTION 'Automatic welcome payout consent is required'; END IF;
  SELECT * INTO cfg FROM public.platform_reward_config WHERE id = true AND country_code = 'NG' FOR UPDATE;
  IF cfg.welcome_bonus_payout_enabled IS NOT TRUE THEN RAISE EXCEPTION 'Welcome bonus payouts are disabled'; END IF;
  SELECT * INTO claim FROM public.verification_bonus_claims WHERE user_id = uid FOR UPDATE;
  IF claim.id IS NULL OR claim.status <> 'PENDING_VERIFICATION_BONUS' OR claim.expires_at <= now() THEN RAISE EXCEPTION 'Welcome bonus is not eligible'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.account_verifications WHERE user_id = uid AND phone_verified_at IS NOT NULL AND email_verified_at IS NOT NULL) THEN RAISE EXCEPTION 'Phone and email verification are required'; END IF;
  SELECT * INTO bank FROM public.bank_accounts WHERE id = p_bank_account_id AND creator_id = uid FOR UPDATE;
  IF bank.id IS NULL OR bank.provider <> 'paystack' OR bank.verified IS NOT TRUE OR bank.external_id IS NULL THEN RAISE EXCEPTION 'A Paystack-verified bank account is required'; END IF;
  IF cfg.welcome_bonus_budget_remaining < cfg.welcome_bonus_amount THEN RAISE EXCEPTION 'Welcome bonus budget is unavailable'; END IF;
  payout_reference := 'KCEARN-WELCOME-' || upper(replace(gen_random_uuid()::text, '-', ''));
  INSERT INTO public.welcome_bonus_payouts (user_id, bank_account_id, reference, provider, recipient_reference, amount, currency, status, consented_at, queued_at)
    VALUES (uid, bank.id, payout_reference, bank.provider, bank.external_id, cfg.welcome_bonus_amount, 'NGN', 'PAYOUT_QUEUED', now(), now()) RETURNING * INTO result;
  UPDATE public.platform_reward_config SET welcome_bonus_budget_remaining = welcome_bonus_budget_remaining - cfg.welcome_bonus_amount, updated_at = now() WHERE id = true;
  INSERT INTO public.platform_promotional_expenses (expense_type, amount, currency, reference)
    VALUES ('WELCOME_BONUS_PROMOTIONAL_EXPENSE', result.amount, result.currency, result.reference);
  RETURN result;
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO result FROM public.welcome_bonus_payouts WHERE user_id = uid;
  IF result.id IS NULL THEN RAISE; END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_welcome_bonus_payout(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_welcome_bonus_payout(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_welcome_bonus_payout(p_reference text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.welcome_bonus_payouts SET status = 'PROCESSING', processing_at = COALESCE(processing_at, now()), updated_at = now()
    WHERE reference = p_reference AND status = 'PAYOUT_QUEUED';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_welcome_bonus_processing(p_reference text, p_provider_reference text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.welcome_bonus_payouts SET provider_reference = p_provider_reference, updated_at = now()
    WHERE reference = p_reference AND status = 'PROCESSING' AND provider_reference IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_welcome_bonus_provider_reference(p_reference text, p_provider_reference text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN public.mark_welcome_bonus_processing(p_reference, p_provider_reference); END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_welcome_bonus_paid(p_reference text, p_provider_reference text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.welcome_bonus_payouts SET status = 'PAID', provider_reference = COALESCE(p_provider_reference, provider_reference), paid_at = COALESCE(paid_at, now()), updated_at = now()
    WHERE reference = p_reference AND provider = 'paystack' AND status = 'PROCESSING';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_welcome_bonus_payout(p_reference text, p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.welcome_bonus_payouts SET status = 'FAILED', failure_reason = left(NULLIF(btrim(p_reason), ''), 500), failed_at = COALESCE(failed_at, now()), updated_at = now()
    WHERE reference = p_reference AND status IN ('PAYOUT_QUEUED','PROCESSING');
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_welcome_bonus_payout(p_reference text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.welcome_bonus_payouts SET status = 'PAYOUT_QUEUED', failure_reason = NULL, failed_at = NULL, queued_at = now(), updated_at = now()
    WHERE reference = p_reference AND status = 'FAILED' AND provider_reference IS NULL;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_welcome_bonus_payout(text), public.mark_welcome_bonus_processing(text, text), public.set_welcome_bonus_provider_reference(text, text), public.confirm_welcome_bonus_paid(text, text), public.fail_welcome_bonus_payout(text, text), public.retry_welcome_bonus_payout(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_welcome_bonus_payout(text), public.mark_welcome_bonus_processing(text, text), public.set_welcome_bonus_provider_reference(text, text), public.confirm_welcome_bonus_paid(text, text), public.fail_welcome_bonus_payout(text, text), public.retry_welcome_bonus_payout(text) TO service_role;

-- Preserve the latest failed-status enum migration where the repository uses it.
-- There are no migration-time DROP TABLE, TRUNCATE, or DELETE operations.
-- toggle_like contains the repository's intentional DELETE for unliking.

COMMIT;
