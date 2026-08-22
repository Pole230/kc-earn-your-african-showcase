BEGIN;

-- Welcome payouts are promotional expenses, never wallet credit or creator earnings.
ALTER TABLE public.platform_reward_config
  ADD COLUMN IF NOT EXISTS welcome_bonus_amount numeric(14,2) NOT NULL DEFAULT 3000 CHECK (welcome_bonus_amount > 0),
  ADD COLUMN IF NOT EXISTS welcome_bonus_payout_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS welcome_bonus_budget_remaining numeric(14,2) NOT NULL DEFAULT 0 CHECK (welcome_bonus_budget_remaining >= 0);

CREATE TABLE IF NOT EXISTS public.platform_promotional_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_type text NOT NULL CHECK (expense_type = 'WELCOME_BONUS_PROMOTIONAL_EXPENSE'),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  reference text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.welcome_bonus_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id),
  reference text NOT NULL UNIQUE,
  provider text NOT NULL,
  provider_reference text,
  recipient_reference text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency = 'NGN'),
  status text NOT NULL CHECK (status IN ('PENDING_VERIFICATION','ELIGIBLE','PAYOUT_QUEUED','PROCESSING','PAID','FAILED','EXPIRED','CANCELLED')),
  consented_at timestamptz,
  queued_at timestamptz,
  processing_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS welcome_bonus_payouts_status_idx ON public.welcome_bonus_payouts (status);

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_reference text;

ALTER TABLE public.platform_promotional_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.welcome_bonus_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY welcome_bonus_payouts_select_own ON public.welcome_bonus_payouts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.platform_promotional_expenses FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.welcome_bonus_payouts FROM anon, authenticated;
GRANT SELECT ON public.welcome_bonus_payouts TO authenticated;

-- Replaces the earlier contact-verification credit path. Verification alone never credits money.
CREATE OR REPLACE FUNCTION public.complete_verification(p_channel text, p_code_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE challenge public.verification_challenges; fully_verified boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO challenge FROM public.verification_challenges
    WHERE user_id = auth.uid() AND channel = p_channel AND consumed_at IS NULL
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
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
REVOKE ALL ON FUNCTION public.complete_verification(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_verification(text, text) TO authenticated;

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
  IF claim.id IS NULL OR claim.status <> 'PENDING_VERIFICATION_BONUS' OR claim.expires_at <= now() THEN
    RAISE EXCEPTION 'Welcome bonus is not eligible';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.account_verifications WHERE user_id = uid AND phone_verified_at IS NOT NULL AND email_verified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Phone and email verification are required';
  END IF;
  SELECT * INTO bank FROM public.bank_accounts WHERE id = p_bank_account_id AND creator_id = uid FOR UPDATE;
  IF bank.id IS NULL OR bank.verified IS NOT TRUE OR bank.external_id IS NULL THEN RAISE EXCEPTION 'A provider-verified bank account is required'; END IF;
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

-- Provider workers/webhooks are the only actors allowed to advance payout state.
CREATE OR REPLACE FUNCTION public.mark_welcome_bonus_processing(p_reference text, p_provider_reference text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.welcome_bonus_payouts SET status = 'PROCESSING', provider_reference = p_provider_reference, processing_at = COALESCE(processing_at, now()), updated_at = now()
    WHERE reference = p_reference AND status = 'PAYOUT_QUEUED';
  RETURN FOUND;
END;
$$;
CREATE OR REPLACE FUNCTION public.confirm_welcome_bonus_paid(p_reference text, p_provider_reference text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.welcome_bonus_payouts SET status = 'PAID', provider_reference = COALESCE(p_provider_reference, provider_reference), paid_at = COALESCE(paid_at, now()), updated_at = now()
    WHERE reference = p_reference AND status IN ('PAYOUT_QUEUED','PROCESSING');
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

REVOKE ALL ON FUNCTION public.mark_welcome_bonus_processing(text, text), public.confirm_welcome_bonus_paid(text, text), public.fail_welcome_bonus_payout(text, text), public.retry_welcome_bonus_payout(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_welcome_bonus_processing(text, text), public.confirm_welcome_bonus_paid(text, text), public.fail_welcome_bonus_payout(text, text), public.retry_welcome_bonus_payout(text) TO service_role;

COMMIT;