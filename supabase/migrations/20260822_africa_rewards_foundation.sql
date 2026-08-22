BEGIN;

-- Nigeria is the first live market. Other countries can be enabled deliberately later.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'NG';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country_name text NOT NULL DEFAULT 'Nigeria';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_currency text NOT NULL DEFAULT 'NGN';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en-NG';
CREATE TABLE IF NOT EXISTS public.supported_countries (
  country_code text PRIMARY KEY,
  country_name text NOT NULL,
  currency text NOT NULL,
  locale text NOT NULL,
  is_live boolean NOT NULL DEFAULT false
);
INSERT INTO public.supported_countries VALUES ('NG', 'Nigeria', 'NGN', 'en-NG', true)
ON CONFLICT (country_code) DO UPDATE SET currency = EXCLUDED.currency, locale = EXCLUDED.locale, is_live = true;
ALTER TABLE public.supported_countries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS supported_countries_read ON public.supported_countries;
CREATE POLICY supported_countries_read ON public.supported_countries FOR SELECT USING (is_live = true);
GRANT SELECT ON public.supported_countries TO authenticated, anon;
UPDATE public.wallets SET currency = 'NGN' WHERE currency = 'USD';

ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS promotional_bonus_balance numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS referral_bonus_locked numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS referral_bonus_unlocked numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS platform_fee numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS payout_amount numeric(14,2);

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('promotional_bonus','real_earnings','referral_bonus','withdrawable_balance','pending_withdrawal','platform_fee')),
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_ledger_user_created_idx ON public.wallet_ledger (user_id, created_at DESC);
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallet_ledger_select_own ON public.wallet_ledger FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON public.wallet_ledger TO authenticated;

CREATE TABLE IF NOT EXISTS public.platform_reward_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  country_code text NOT NULL DEFAULT 'NG',
  signup_bonus numeric(14,2) NOT NULL DEFAULT 3000,
  referral_target integer NOT NULL DEFAULT 10 CHECK (referral_target > 0),
  referral_reward numeric(14,2) NOT NULL DEFAULT 2000 CHECK (referral_reward >= 0),
  minimum_withdrawal numeric(14,2) NOT NULL DEFAULT 20000 CHECK (minimum_withdrawal > 0),
  withdrawal_fee numeric(14,2) NOT NULL DEFAULT 3000 CHECK (withdrawal_fee >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_reward_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.platform_reward_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY reward_config_read ON public.platform_reward_config FOR SELECT USING (true);
GRANT SELECT ON public.platform_reward_config TO authenticated, anon;

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','qualified','rejected')),
  qualified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (referrer_id <> referred_id)
);
CREATE INDEX IF NOT EXISTS referrals_referrer_status_idx ON public.referrals (referrer_id, status);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY referrals_select_own ON public.referrals FOR SELECT TO authenticated
  USING (referrer_id = auth.uid() OR referred_id = auth.uid());
GRANT SELECT ON public.referrals TO authenticated;

ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS source_provider text NOT NULL DEFAULT 'upload';
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS source_authorized_at timestamptz;
ALTER TABLE public.videos ADD CONSTRAINT videos_source_provider_check
  CHECK (source_provider IN ('upload','youtube','facebook','instagram','tiktok','other'));

-- Promotional signup credit is intentionally kept out of available_balance.
CREATE OR REPLACE FUNCTION public.award_nigeria_signup_bonus()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE reward numeric; currency_code text;
BEGIN
  IF NEW.country_code <> 'NG' THEN RETURN NEW; END IF;
  SELECT signup_bonus INTO reward FROM public.platform_reward_config WHERE id = true AND country_code = 'NG';
  IF reward IS NULL OR reward <= 0 THEN RETURN NEW; END IF;
  SELECT currency INTO currency_code FROM public.wallets WHERE user_id = NEW.id;
  INSERT INTO public.wallets (user_id, currency, promotional_bonus_balance)
    VALUES (NEW.id, COALESCE(currency_code, 'NGN'), reward)
    ON CONFLICT (user_id) DO UPDATE SET promotional_bonus_balance = public.wallets.promotional_bonus_balance + reward;
  INSERT INTO public.wallet_ledger (user_id, entry_type, amount, currency, reference)
    VALUES (NEW.id, 'promotional_bonus', reward, COALESCE(currency_code, 'NGN'), 'signup');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_nigeria_signup_bonus ON public.profiles;
CREATE TRIGGER profiles_nigeria_signup_bonus AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.award_nigeria_signup_bonus();

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  _amount numeric, _method text, _destination text
)
RETURNS public.withdrawals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _available numeric;
  _minimum numeric;
  _fee numeric;
  _currency text;
  _row public.withdrawals;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.account_verifications WHERE user_id = _uid
    AND phone_verified_at IS NOT NULL AND email_verified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Verify your phone number and email before requesting a withdrawal';
  END IF;
  SELECT minimum_withdrawal, withdrawal_fee INTO _minimum, _fee
    FROM public.platform_reward_config WHERE id = true AND country_code = 'NG';
  IF _amount IS NULL OR _amount < COALESCE(_minimum, 20000) THEN
    RAISE EXCEPTION 'Minimum withdrawal is %', COALESCE(_minimum, 20000);
  END IF;
  IF _method IS NULL OR btrim(_method) = '' OR _destination IS NULL OR btrim(_destination) = '' THEN
    RAISE EXCEPTION 'Payout method and destination are required';
  END IF;
  SELECT available_balance, currency INTO _available, _currency
    FROM public.wallets WHERE user_id = _uid FOR UPDATE;
  IF _available IS NULL THEN RAISE EXCEPTION 'Wallet is not ready'; END IF;
  IF _available < _amount THEN RAISE EXCEPTION 'Insufficient eligible earnings'; END IF;
  UPDATE public.wallets SET available_balance = available_balance - _amount,
    pending_balance = pending_balance + _amount, updated_at = now() WHERE user_id = _uid;
  INSERT INTO public.withdrawals (user_id, amount, method, destination, platform_fee, payout_amount)
    VALUES (_uid, _amount, btrim(_method), btrim(_destination), LEAST(COALESCE(_fee, 0), _amount),
      _amount - LEAST(COALESCE(_fee, 0), _amount)) RETURNING * INTO _row;
  INSERT INTO public.wallet_ledger (user_id, entry_type, amount, currency, reference)
    VALUES (_uid, 'pending_withdrawal', -_amount, COALESCE(_currency, 'NGN'), _row.id::text),
           (_uid, 'platform_fee', -LEAST(COALESCE(_fee, 0), _amount), COALESCE(_currency, 'NGN'), _row.id::text);
  RETURN _row;
END;
$$;

COMMIT;