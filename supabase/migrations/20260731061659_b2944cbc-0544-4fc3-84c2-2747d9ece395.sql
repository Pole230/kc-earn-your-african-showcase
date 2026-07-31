-- ============ ROLES ============
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- ============ NOTIFICATIONS ============
DO $$ BEGIN
  CREATE TYPE public.notification_kind AS ENUM (
    'earning_credited','withdrawal_requested','withdrawal_approved','withdrawal_rejected',
    'campaign_approved','campaign_completed','reward_received','milestone_achieved','system'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind public.notification_kind NOT NULL DEFAULT 'system',
  title text NOT NULL,
  body text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.push_notification(
  _user_id uuid, _kind public.notification_kind, _title text, _body text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.notifications (user_id, kind, title, body, metadata)
  VALUES (_user_id, _kind, _title, _body, COALESCE(_metadata,'{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.push_notification(uuid, public.notification_kind, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ============ PAYOUT CONFIG ============
CREATE TABLE IF NOT EXISTS public.payout_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  rate_per_view numeric NOT NULL DEFAULT 0.001,
  min_watch_seconds integer NOT NULL DEFAULT 5,
  min_watch_percent numeric NOT NULL DEFAULT 25,
  dedup_window_minutes integer NOT NULL DEFAULT 720,
  daily_creator_limit numeric NOT NULL DEFAULT 25,
  per_viewer_daily_limit numeric NOT NULL DEFAULT 0.25,
  daily_login_reward numeric NOT NULL DEFAULT 0.02,
  referral_reward numeric NOT NULL DEFAULT 0.50,
  milestone_reward numeric NOT NULL DEFAULT 1.00,
  min_withdrawal numeric NOT NULL DEFAULT 5,
  currency text NOT NULL DEFAULT 'USD',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payout_config TO authenticated, anon;
GRANT ALL ON public.payout_config TO service_role;
ALTER TABLE public.payout_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Payout config is readable" ON public.payout_config;
CREATE POLICY "Payout config is readable" ON public.payout_config FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can update payout config" ON public.payout_config;
CREATE POLICY "Admins can update payout config" ON public.payout_config
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.payout_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ============ VERIFIED VIEWS ============
CREATE TABLE IF NOT EXISTS public.video_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL,
  viewer_id uuid,
  session_key text,
  watch_seconds integer NOT NULL DEFAULT 0,
  percent_watched numeric NOT NULL DEFAULT 0,
  device text,
  ip_hash text,
  country text,
  is_valid boolean NOT NULL DEFAULT false,
  fraud_reason text,
  earned_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS video_views_video_created_idx ON public.video_views (video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS video_views_creator_created_idx ON public.video_views (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS video_views_viewer_created_idx ON public.video_views (viewer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS video_views_dedup_idx ON public.video_views (video_id, viewer_id, ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS video_views_country_idx ON public.video_views (creator_id, country);
GRANT SELECT ON public.video_views TO authenticated;
GRANT ALL ON public.video_views TO service_role;
ALTER TABLE public.video_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Creators can view their own video views" ON public.video_views;
CREATE POLICY "Creators can view their own video views" ON public.video_views
  FOR SELECT TO authenticated USING (auth.uid() = creator_id OR public.has_role(auth.uid(),'admin'));

-- ============ REWARD CLAIMS ============
DO $$ BEGIN
  CREATE TYPE public.reward_kind AS ENUM ('daily_login','referral','milestone','trending','challenge','event','promo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.reward_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind public.reward_kind NOT NULL,
  reference text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, reference)
);
CREATE INDEX IF NOT EXISTS reward_claims_user_created_idx ON public.reward_claims (user_id, created_at DESC);
GRANT SELECT ON public.reward_claims TO authenticated;
GRANT ALL ON public.reward_claims TO service_role;
ALTER TABLE public.reward_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own rewards" ON public.reward_claims;
CREATE POLICY "Users can view their own rewards" ON public.reward_claims
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- ============ ADVERTISERS ============
DO $$ BEGIN
  CREATE TYPE public.campaign_status AS ENUM ('draft','pending_review','active','paused','completed','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.ad_event_type AS ENUM ('impression','click');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.advertisers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE,
  company_name text NOT NULL,
  contact_email text NOT NULL,
  country text,
  website text,
  is_approved boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.advertisers TO authenticated;
GRANT ALL ON public.advertisers TO service_role;
ALTER TABLE public.advertisers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Advertisers can view their own account" ON public.advertisers;
CREATE POLICY "Advertisers can view their own account" ON public.advertisers
  FOR SELECT TO authenticated USING (auth.uid() = owner_id OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Users can create their advertiser account" ON public.advertisers;
CREATE POLICY "Users can create their advertiser account" ON public.advertisers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Advertisers can update their own account" ON public.advertisers;
CREATE POLICY "Advertisers can update their own account" ON public.advertisers
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = owner_id OR public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id uuid NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
  name text NOT NULL,
  headline text,
  description text,
  media_path text,
  destination_url text,
  budget numeric NOT NULL DEFAULT 0,
  spent numeric NOT NULL DEFAULT 0,
  cost_per_view numeric NOT NULL DEFAULT 0.01,
  cost_per_click numeric NOT NULL DEFAULT 0.10,
  target_countries text[] NOT NULL DEFAULT '{}',
  target_categories public.video_category[] NOT NULL DEFAULT '{}',
  status public.campaign_status NOT NULL DEFAULT 'pending_review',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_campaigns_advertiser_idx ON public.ad_campaigns (advertiser_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_campaigns_status_idx ON public.ad_campaigns (status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_campaigns TO authenticated;
GRANT ALL ON public.ad_campaigns TO service_role;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.owns_advertiser(_advertiser_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.advertisers WHERE id = _advertiser_id AND owner_id = _user_id)
$$;

DROP POLICY IF EXISTS "Advertisers manage their campaigns" ON public.ad_campaigns;
CREATE POLICY "Advertisers manage their campaigns" ON public.ad_campaigns
  FOR ALL TO authenticated
  USING (public.owns_advertiser(advertiser_id, auth.uid()) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.owns_advertiser(advertiser_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.ad_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  event_type public.ad_event_type NOT NULL,
  viewer_id uuid,
  country text,
  device text,
  cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_events_campaign_idx ON public.ad_events (campaign_id, created_at DESC);
GRANT SELECT ON public.ad_events TO authenticated;
GRANT ALL ON public.ad_events TO service_role;
ALTER TABLE public.ad_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Advertisers can view their campaign events" ON public.ad_events;
CREATE POLICY "Advertisers can view their campaign events" ON public.ad_events
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (
      SELECT 1 FROM public.ad_campaigns c
      WHERE c.id = ad_events.campaign_id AND public.owns_advertiser(c.advertiser_id, auth.uid())
    )
  );

-- ============ WALLET / EARNINGS AUTOMATION ============
DROP TRIGGER IF EXISTS earnings_apply_to_wallet ON public.earnings;
CREATE TRIGGER earnings_apply_to_wallet
  AFTER INSERT ON public.earnings
  FOR EACH ROW EXECUTE FUNCTION public.apply_earning_to_wallet();

DROP TRIGGER IF EXISTS profiles_create_wallet ON public.profiles;
CREATE TRIGGER profiles_create_wallet
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_wallet_for_profile();

CREATE OR REPLACE FUNCTION public.notify_on_earning()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.amount > 0 THEN
    PERFORM public.push_notification(
      NEW.user_id, 'earning_credited', 'Earnings credited',
      COALESCE(NEW.note, 'You earned ' || to_char(NEW.amount, 'FM999999990.0000') || ' on KC Earn'),
      jsonb_build_object('amount', NEW.amount, 'source', NEW.source, 'video_id', NEW.video_id)
    );
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS earnings_notify ON public.earnings;
CREATE TRIGGER earnings_notify AFTER INSERT ON public.earnings
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_earning();

CREATE OR REPLACE FUNCTION public.credit_earning(
  _user_id uuid, _amount numeric, _source public.earning_source, _note text DEFAULT NULL, _video_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN RETURN NULL; END IF;
  INSERT INTO public.wallets (user_id) VALUES (_user_id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.earnings (user_id, amount, source, note, video_id)
  VALUES (_user_id, _amount, _source, _note, _video_id) RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.credit_earning(uuid, numeric, public.earning_source, text, uuid) FROM PUBLIC, anon, authenticated;

-- ============ VERIFIED VIEW ENGINE ============
CREATE OR REPLACE FUNCTION public.record_video_view(
  _video_id uuid,
  _watch_seconds integer,
  _percent_watched numeric,
  _device text DEFAULT NULL,
  _country text DEFAULT NULL,
  _session_key text DEFAULT NULL,
  _ip_hash text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg public.payout_config;
  _viewer uuid := auth.uid();
  _creator uuid;
  _duration integer;
  _dupe boolean := false;
  _fraud text;
  _valid boolean := true;
  _amount numeric := 0;
  _creator_today numeric := 0;
  _viewer_today numeric := 0;
  _key text;
  _views integer;
BEGIN
  IF _video_id IS NULL THEN RAISE EXCEPTION 'video_id is required'; END IF;
  _watch_seconds := GREATEST(COALESCE(_watch_seconds, 0), 0);
  _percent_watched := LEAST(GREATEST(COALESCE(_percent_watched, 0), 0), 100);

  SELECT user_id, duration_seconds INTO _creator, _duration
  FROM public.videos WHERE id = _video_id;
  IF _creator IS NULL THEN RAISE EXCEPTION 'Video not found'; END IF;

  SELECT * INTO cfg FROM public.payout_config WHERE id;

  _key := COALESCE(_viewer::text, _ip_hash, _session_key, 'anon');
  PERFORM pg_advisory_xact_lock(hashtext(_video_id::text || ':' || _key));

  SELECT EXISTS (
    SELECT 1 FROM public.video_views v
    WHERE v.video_id = _video_id
      AND v.is_valid
      AND v.created_at > now() - make_interval(mins => cfg.dedup_window_minutes)
      AND (
        (_viewer IS NOT NULL AND v.viewer_id = _viewer)
        OR (_viewer IS NULL AND _ip_hash IS NOT NULL AND v.ip_hash = _ip_hash)
        OR (_viewer IS NULL AND _ip_hash IS NULL AND _session_key IS NOT NULL AND v.session_key = _session_key)
      )
  ) INTO _dupe;

  IF _dupe THEN
    _valid := false; _fraud := 'duplicate_window';
  ELSIF _percent_watched <= 0 AND _watch_seconds <= 0 THEN
    _valid := false; _fraud := 'no_watch_time';
  ELSIF _duration IS NOT NULL AND _duration > 0 AND _watch_seconds > (_duration * 2) THEN
    _valid := false; _fraud := 'impossible_watch_time';
  ELSIF (
    SELECT count(*) FROM public.video_views v
    WHERE v.created_at > now() - interval '1 minute'
      AND ((_viewer IS NOT NULL AND v.viewer_id = _viewer) OR (_viewer IS NULL AND _ip_hash IS NOT NULL AND v.ip_hash = _ip_hash))
  ) > 30 THEN
    _valid := false; _fraud := 'rate_limited';
  END IF;

  IF _valid THEN
    IF _viewer IS NOT NULL AND _viewer = _creator THEN
      _fraud := 'self_view_no_earning';
    ELSIF _watch_seconds < cfg.min_watch_seconds AND _percent_watched < cfg.min_watch_percent THEN
      _fraud := 'below_min_watch';
    ELSE
      SELECT COALESCE(sum(earned_amount),0) INTO _creator_today FROM public.video_views
        WHERE creator_id = _creator AND created_at >= date_trunc('day', now());
      SELECT COALESCE(sum(earned_amount),0) INTO _viewer_today FROM public.video_views
        WHERE created_at >= date_trunc('day', now())
          AND ((_viewer IS NOT NULL AND viewer_id = _viewer) OR (_viewer IS NULL AND _ip_hash IS NOT NULL AND ip_hash = _ip_hash));
      IF _creator_today >= cfg.daily_creator_limit THEN
        _fraud := 'creator_daily_limit';
      ELSIF _viewer_today >= cfg.per_viewer_daily_limit THEN
        _fraud := 'viewer_daily_limit';
      ELSE
        _amount := LEAST(
          cfg.rate_per_view,
          cfg.daily_creator_limit - _creator_today,
          cfg.per_viewer_daily_limit - _viewer_today
        );
        IF _amount < 0 THEN _amount := 0; END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.video_views (
    video_id, creator_id, viewer_id, session_key, watch_seconds, percent_watched,
    device, ip_hash, country, is_valid, fraud_reason, earned_amount
  ) VALUES (
    _video_id, _creator, _viewer, _session_key, _watch_seconds, _percent_watched,
    _device, _ip_hash, _country, _valid, _fraud, _amount
  );

  IF _valid THEN
    UPDATE public.videos SET views_count = views_count + 1, updated_at = now()
      WHERE id = _video_id RETURNING views_count INTO _views;

    IF _amount > 0 THEN
      PERFORM public.credit_earning(_creator, _amount, 'views', 'Verified view earnings', _video_id);
    END IF;

    -- milestone rewards
    IF _views IN (1000, 10000, 100000, 1000000) THEN
      PERFORM public.grant_reward(_creator, 'milestone', _video_id::text || ':' || _views::text,
        cfg.milestone_reward, _views::text || ' views milestone reached');
    END IF;
  END IF;

  RETURN jsonb_build_object('valid', _valid, 'earned', _amount, 'reason', _fraud);
END $$;
GRANT EXECUTE ON FUNCTION public.record_video_view(uuid, integer, numeric, text, text, text, text) TO authenticated, anon;

-- ============ REWARD ENGINE ============
CREATE OR REPLACE FUNCTION public.grant_reward(
  _user_id uuid, _kind public.reward_kind, _reference text, _amount numeric, _note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _claim_id uuid; _src public.earning_source;
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('granted', false, 'amount', 0, 'reason', 'invalid');
  END IF;
  INSERT INTO public.reward_claims (user_id, kind, reference, amount)
  VALUES (_user_id, _kind, _reference, _amount)
  ON CONFLICT (user_id, kind, reference) DO NOTHING
  RETURNING id INTO _claim_id;
  IF _claim_id IS NULL THEN
    RETURN jsonb_build_object('granted', false, 'amount', 0, 'reason', 'already_claimed');
  END IF;

  _src := CASE WHEN _kind = 'referral' THEN 'referral'::public.earning_source
               ELSE 'bonus'::public.earning_source END;
  PERFORM public.credit_earning(_user_id, _amount, _src, COALESCE(_note, 'KC Earn reward'), NULL);

  IF _kind = 'milestone' THEN
    PERFORM public.push_notification(_user_id, 'milestone_achieved', 'Milestone achieved', _note,
      jsonb_build_object('amount', _amount, 'reference', _reference));
  ELSE
    PERFORM public.push_notification(_user_id, 'reward_received', 'Reward received', _note,
      jsonb_build_object('amount', _amount, 'kind', _kind, 'reference', _reference));
  END IF;

  RETURN jsonb_build_object('granted', true, 'amount', _amount);
END $$;
REVOKE ALL ON FUNCTION public.grant_reward(uuid, public.reward_kind, text, numeric, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_daily_login()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); cfg public.payout_config;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO cfg FROM public.payout_config WHERE id;
  RETURN public.grant_reward(_uid, 'daily_login', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
    cfg.daily_login_reward, 'Daily login reward');
END $$;
GRANT EXECUTE ON FUNCTION public.claim_daily_login() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_grant_reward(
  _user_id uuid, _kind public.reward_kind, _reference text, _amount numeric, _note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN public.grant_reward(_user_id, _kind, _reference, _amount, _note);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_grant_reward(uuid, public.reward_kind, text, numeric, text) TO authenticated;

-- ============ WITHDRAWAL REVIEW ============
CREATE OR REPLACE FUNCTION public.notify_on_withdrawal_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.push_notification(NEW.user_id, 'withdrawal_requested', 'Withdrawal requested',
    'Your payout request is being reviewed.', jsonb_build_object('amount', NEW.amount, 'withdrawal_id', NEW.id));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS withdrawals_notify ON public.withdrawals;
CREATE TRIGGER withdrawals_notify AFTER INSERT ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_withdrawal_request();

DROP POLICY IF EXISTS "Admins can view all withdrawals" ON public.withdrawals;
CREATE POLICY "Admins can view all withdrawals" ON public.withdrawals
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.admin_update_withdrawal(
  _withdrawal_id uuid, _status public.withdrawal_status, _note text DEFAULT NULL
) RETURNS public.withdrawals LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.withdrawals;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO _row FROM public.withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Withdrawal not found'; END IF;
  IF _row.status IN ('paid','rejected') THEN RAISE EXCEPTION 'Withdrawal already finalised'; END IF;

  IF _status = 'rejected' THEN
    UPDATE public.wallets SET pending_balance = GREATEST(pending_balance - _row.amount, 0),
      available_balance = available_balance + _row.amount, updated_at = now()
      WHERE user_id = _row.user_id;
    PERFORM public.push_notification(_row.user_id, 'withdrawal_rejected', 'Withdrawal rejected',
      COALESCE(_note,'Your payout request was rejected and funds were returned.'),
      jsonb_build_object('amount', _row.amount, 'withdrawal_id', _row.id));
  ELSIF _status = 'paid' THEN
    UPDATE public.wallets SET pending_balance = GREATEST(pending_balance - _row.amount, 0), updated_at = now()
      WHERE user_id = _row.user_id;
    PERFORM public.push_notification(_row.user_id, 'withdrawal_approved', 'Withdrawal paid',
      COALESCE(_note,'Your payout has been sent.'),
      jsonb_build_object('amount', _row.amount, 'withdrawal_id', _row.id));
  ELSIF _status = 'processing' THEN
    PERFORM public.push_notification(_row.user_id, 'withdrawal_approved', 'Withdrawal approved',
      COALESCE(_note,'Your payout was approved and is being processed.'),
      jsonb_build_object('amount', _row.amount, 'withdrawal_id', _row.id));
  END IF;

  UPDATE public.withdrawals SET status = _status, note = COALESCE(_note, note), updated_at = now()
    WHERE id = _withdrawal_id RETURNING * INTO _row;
  RETURN _row;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_update_withdrawal(uuid, public.withdrawal_status, text) TO authenticated;

-- ============ CAMPAIGN AUTOMATION ============
CREATE OR REPLACE FUNCTION public.record_ad_event(
  _campaign_id uuid, _event_type public.ad_event_type, _country text DEFAULT NULL, _device text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.ad_campaigns; _cost numeric; _owner uuid;
BEGIN
  SELECT * INTO c FROM public.ad_campaigns WHERE id = _campaign_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Campaign not found'; END IF;
  IF c.status <> 'active' THEN RETURN jsonb_build_object('recorded', false, 'reason', 'inactive'); END IF;

  _cost := CASE WHEN _event_type = 'click' THEN c.cost_per_click ELSE c.cost_per_view END;
  IF c.spent + _cost > c.budget THEN
    UPDATE public.ad_campaigns SET status = 'completed', updated_at = now() WHERE id = c.id;
    SELECT owner_id INTO _owner FROM public.advertisers WHERE id = c.advertiser_id;
    PERFORM public.push_notification(_owner, 'campaign_completed', 'Campaign completed',
      c.name || ' has used its full budget.', jsonb_build_object('campaign_id', c.id));
    RETURN jsonb_build_object('recorded', false, 'reason', 'budget_exhausted');
  END IF;

  INSERT INTO public.ad_events (campaign_id, event_type, viewer_id, country, device, cost)
  VALUES (c.id, _event_type, auth.uid(), _country, _device, _cost);
  UPDATE public.ad_campaigns SET spent = spent + _cost, updated_at = now() WHERE id = c.id;
  RETURN jsonb_build_object('recorded', true, 'cost', _cost);
END $$;
GRANT EXECUTE ON FUNCTION public.record_ad_event(uuid, public.ad_event_type, text, text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.admin_set_campaign_status(_campaign_id uuid, _status public.campaign_status)
RETURNS public.ad_campaigns LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.ad_campaigns; _owner uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.ad_campaigns SET status = _status, updated_at = now()
    WHERE id = _campaign_id RETURNING * INTO _row;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Campaign not found'; END IF;
  SELECT owner_id INTO _owner FROM public.advertisers WHERE id = _row.advertiser_id;
  IF _status = 'active' THEN
    PERFORM public.push_notification(_owner, 'campaign_approved', 'Campaign approved',
      _row.name || ' is now live.', jsonb_build_object('campaign_id', _row.id));
  ELSIF _status = 'completed' THEN
    PERFORM public.push_notification(_owner, 'campaign_completed', 'Campaign completed',
      _row.name || ' has finished.', jsonb_build_object('campaign_id', _row.id));
  END IF;
  RETURN _row;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_set_campaign_status(uuid, public.campaign_status) TO authenticated;

-- ============ ADMIN VISIBILITY ON CORE TABLES ============
DROP POLICY IF EXISTS "Admins can view all earnings" ON public.earnings;
CREATE POLICY "Admins can view all earnings" ON public.earnings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins can view all wallets" ON public.wallets;
CREATE POLICY "Admins can view all wallets" ON public.wallets
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins can view all videos" ON public.videos;
CREATE POLICY "Admins can view all videos" ON public.videos
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ============ ADMIN STATS ============
CREATE OR REPLACE FUNCTION public.admin_platform_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT jsonb_build_object(
    'creators', (SELECT count(*) FROM public.profiles),
    'videos', (SELECT count(*) FROM public.videos),
    'valid_views', (SELECT count(*) FROM public.video_views WHERE is_valid),
    'blocked_views', (SELECT count(*) FROM public.video_views WHERE NOT is_valid),
    'total_paid_out', (SELECT COALESCE(sum(amount),0) FROM public.withdrawals WHERE status = 'paid'),
    'pending_payouts', (SELECT COALESCE(sum(amount),0) FROM public.withdrawals WHERE status IN ('pending','processing')),
    'total_earnings', (SELECT COALESCE(sum(amount),0) FROM public.earnings),
    'ad_revenue', (SELECT COALESCE(sum(cost),0) FROM public.ad_events),
    'active_campaigns', (SELECT count(*) FROM public.ad_campaigns WHERE status = 'active'),
    'advertisers', (SELECT count(*) FROM public.advertisers)
  ) INTO r;
  RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_platform_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.creator_analytics(_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := COALESCE(_user_id, auth.uid()); r jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _uid <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT jsonb_build_object(
    'videos', (SELECT count(*) FROM public.videos WHERE user_id = _uid),
    'views', (SELECT count(*) FROM public.video_views WHERE creator_id = _uid AND is_valid),
    'watch_seconds', (SELECT COALESCE(sum(watch_seconds),0) FROM public.video_views WHERE creator_id = _uid AND is_valid),
    'avg_percent_watched', (SELECT COALESCE(round(avg(percent_watched),1),0) FROM public.video_views WHERE creator_id = _uid AND is_valid),
    'earnings', (SELECT COALESCE(sum(amount),0) FROM public.earnings WHERE user_id = _uid),
    'countries', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT COALESCE(country,'Unknown') AS country, count(*) AS views
        FROM public.video_views WHERE creator_id = _uid AND is_valid
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8) x),
    'daily', (SELECT COALESCE(jsonb_agg(y), '[]'::jsonb) FROM (
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
               count(*) AS views, COALESCE(sum(earned_amount),0) AS earned
        FROM public.video_views WHERE creator_id = _uid AND is_valid
          AND created_at > now() - interval '30 days'
        GROUP BY 1 ORDER BY 1) y)
  ) INTO r;
  RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.creator_analytics(uuid) TO authenticated;

-- updated_at triggers
DROP TRIGGER IF EXISTS advertisers_updated_at ON public.advertisers;
CREATE TRIGGER advertisers_updated_at BEFORE UPDATE ON public.advertisers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS ad_campaigns_updated_at ON public.ad_campaigns;
CREATE TRIGGER ad_campaigns_updated_at BEFORE UPDATE ON public.ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();