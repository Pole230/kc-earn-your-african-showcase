BEGIN;

-- Keep user wallet balances as a read model; every financial mutation also gets
-- one immutable, idempotent ledger entry.
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS real_earnings_balance numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withdrawal_reserved_balance numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.wallet_ledger
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'debit'
    CHECK (direction IN ('credit', 'debit')),
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_idempotency_idx
  ON public.wallet_ledger (user_id, entry_type, reference)
  WHERE reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.platform_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('withdrawal_fee', 'advertising', 'other')),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL,
  reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, reference)
);
ALTER TABLE public.platform_revenue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_revenue_admin_read ON public.platform_revenue;
CREATE POLICY platform_revenue_admin_read ON public.platform_revenue
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.platform_revenue TO authenticated;

CREATE TABLE IF NOT EXISTS public.platform_financial_controls (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  earnings_enabled boolean NOT NULL DEFAULT true,
  withdrawals_enabled boolean NOT NULL DEFAULT true,
  require_verified_contacts boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_financial_controls (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.platform_financial_controls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_controls_admin_read ON public.platform_financial_controls;
CREATE POLICY financial_controls_admin_read ON public.platform_financial_controls
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.platform_financial_controls TO authenticated;

-- Legacy client-side writes would bypass eligibility and idempotency rules.
DROP POLICY IF EXISTS "creators_insert_own" ON public.creator_earnings;
DROP POLICY IF EXISTS "creators_update_own" ON public.creator_earnings;
DROP POLICY IF EXISTS "creators_delete_own" ON public.creator_earnings;
DROP POLICY IF EXISTS "Users can insert their own earnings" ON public.earnings;
DROP POLICY IF EXISTS "Users can update their own earnings" ON public.earnings;
DROP POLICY IF EXISTS "Users can delete their own earnings" ON public.earnings;
REVOKE INSERT, UPDATE, DELETE ON public.earnings, public.creator_earnings FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.wallets, public.wallet_ledger FROM authenticated, anon;

-- Replace the legacy wallet trigger with a ledger-backed real-earnings credit.
CREATE OR REPLACE FUNCTION public.apply_earning_to_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wallet_currency text;
BEGIN
  IF NEW.amount <= 0 THEN RETURN NEW; END IF;
  IF NOT COALESCE((SELECT earnings_enabled FROM public.platform_financial_controls WHERE id), true) THEN
    RAISE EXCEPTION 'Creator earnings are temporarily paused';
  END IF;
  SELECT currency INTO wallet_currency FROM public.wallets WHERE user_id = NEW.user_id FOR UPDATE;
  INSERT INTO public.wallets (user_id, available_balance, real_earnings_balance, lifetime_earned, currency)
    VALUES (NEW.user_id, NEW.amount, NEW.amount, NEW.amount, COALESCE(wallet_currency, 'NGN'))
    ON CONFLICT (user_id) DO UPDATE SET
      available_balance = public.wallets.available_balance + NEW.amount,
      real_earnings_balance = public.wallets.real_earnings_balance + NEW.amount,
      lifetime_earned = public.wallets.lifetime_earned + NEW.amount,
      updated_at = now();
  INSERT INTO public.wallet_ledger (user_id, entry_type, amount, currency, reference, direction, metadata)
    VALUES (NEW.user_id, 'real_earnings', NEW.amount, COALESCE(wallet_currency, 'NGN'),
      'earning:' || NEW.id::text, 'credit', jsonb_build_object('source', NEW.source, 'video_id', NEW.video_id))
    ON CONFLICT (user_id, entry_type, reference) DO NOTHING;
  RETURN NEW;
END;
$$;

-- A referral is locked until the referred creator has a completed, verified account.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text;
UPDATE public.profiles SET referral_code = upper(substr(md5(id::text), 1, 8))
WHERE referral_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_idx ON public.profiles (referral_code);

CREATE OR REPLACE FUNCTION public.register_referral(p_referral_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); referrer uuid; new_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO referrer FROM public.profiles
    WHERE referral_code = upper(btrim(p_referral_code)) AND id <> uid;
  IF referrer IS NULL THEN RAISE EXCEPTION 'Referral code not found'; END IF;
  INSERT INTO public.referrals (referrer_id, referred_id, referral_code)
    VALUES (referrer, uid, upper(btrim(p_referral_code)))
    ON CONFLICT (referred_id) DO NOTHING RETURNING id INTO new_id;
  RETURN jsonb_build_object('registered', new_id IS NOT NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.register_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_referral(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.qualify_referral(p_referred_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.referrals; reward numeric; currency_code text; target integer; count_qualified integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO r FROM public.referrals WHERE referred_id = p_referred_id FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'pending' THEN RETURN jsonb_build_object('qualified', false); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.account_verifications WHERE user_id = r.referred_id
    AND phone_verified_at IS NOT NULL AND email_verified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Referred account must verify phone and email';
  END IF;
  SELECT referral_reward, referral_target INTO reward, target FROM public.platform_reward_config
    WHERE id = true AND country_code = 'NG';
  SELECT count(*) INTO count_qualified FROM public.referrals
    WHERE referrer_id = r.referrer_id AND status = 'qualified';
  UPDATE public.referrals SET status = 'qualified', qualified_at = now() WHERE id = r.id;
  IF count_qualified + 1 >= target AND reward > 0 THEN
    SELECT currency INTO currency_code FROM public.wallets WHERE user_id = r.referrer_id FOR UPDATE;
    INSERT INTO public.wallets (user_id, available_balance, referral_bonus_unlocked)
      VALUES (r.referrer_id, reward, reward)
      ON CONFLICT (user_id) DO UPDATE SET
        available_balance = public.wallets.available_balance + reward,
        referral_bonus_unlocked = public.wallets.referral_bonus_unlocked + reward,
        updated_at = now();
    INSERT INTO public.wallet_ledger (user_id, entry_type, amount, currency, reference, direction)
      VALUES (r.referrer_id, 'referral_bonus', reward, COALESCE(currency_code, 'NGN'),
        'referral-target:' || target::text, 'credit') ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('qualified', true, 'reward_unlocked', count_qualified + 1 >= target);
END;
$$;
REVOKE ALL ON FUNCTION public.qualify_referral(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qualify_referral(uuid) TO authenticated;

-- Rebuild withdrawal authorization around real balances and make fee revenue explicit.
CREATE OR REPLACE FUNCTION public.request_withdrawal(_amount numeric, _method text, _destination text)
RETURNS public.withdrawals LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); available numeric; minimum numeric; fee numeric; currency_code text; row_out public.withdrawals;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT COALESCE((SELECT withdrawals_enabled FROM public.platform_financial_controls WHERE id), true)
    THEN RAISE EXCEPTION 'Withdrawals are temporarily paused'; END IF;
  IF COALESCE((SELECT require_verified_contacts FROM public.platform_financial_controls WHERE id), true)
    AND NOT EXISTS (SELECT 1 FROM public.account_verifications WHERE user_id = uid
      AND phone_verified_at IS NOT NULL AND email_verified_at IS NOT NULL)
    THEN RAISE EXCEPTION 'Verify your phone number and email before requesting a withdrawal'; END IF;
  SELECT minimum_withdrawal, withdrawal_fee INTO minimum, fee FROM public.platform_reward_config
    WHERE id = true AND country_code = 'NG';
  IF _amount IS NULL OR _amount < COALESCE(minimum, 20000) THEN
    RAISE EXCEPTION 'Minimum withdrawal is %', COALESCE(minimum, 20000);
  END IF;
  IF btrim(COALESCE(_method, '')) = '' OR btrim(COALESCE(_destination, '')) = ''
    THEN RAISE EXCEPTION 'Payout method and destination are required'; END IF;
  SELECT available_balance, currency INTO available, currency_code FROM public.wallets WHERE user_id = uid FOR UPDATE;
  IF available IS NULL OR available < _amount THEN RAISE EXCEPTION 'Insufficient eligible real earnings'; END IF;
  UPDATE public.wallets SET available_balance = available_balance - _amount,
    pending_balance = pending_balance + _amount, withdrawal_reserved_balance = withdrawal_reserved_balance + _amount,
    updated_at = now() WHERE user_id = uid;
  INSERT INTO public.withdrawals (user_id, amount, method, destination, platform_fee, payout_amount)
    VALUES (uid, _amount, btrim(_method), btrim(_destination), LEAST(COALESCE(fee, 0), _amount),
      _amount - LEAST(COALESCE(fee, 0), _amount)) RETURNING * INTO row_out;
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

CREATE OR REPLACE FUNCTION public.admin_set_financial_controls(
  p_earnings_enabled boolean, p_withdrawals_enabled boolean, p_require_verified_contacts boolean
) RETURNS public.platform_financial_controls LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.platform_financial_controls;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.platform_financial_controls SET earnings_enabled = p_earnings_enabled,
    withdrawals_enabled = p_withdrawals_enabled, require_verified_contacts = p_require_verified_contacts,
    updated_at = now() WHERE id = true RETURNING * INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_financial_controls(boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_financial_controls(boolean, boolean, boolean) TO authenticated;

COMMIT;