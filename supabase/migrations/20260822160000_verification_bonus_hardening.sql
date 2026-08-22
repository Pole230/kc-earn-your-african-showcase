BEGIN;

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
ALTER TABLE public.verification_bonus_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS verification_bonus_claims_select_own ON public.verification_bonus_claims;
CREATE POLICY verification_bonus_claims_select_own ON public.verification_bonus_claims
  FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON public.verification_bonus_claims TO authenticated;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_normalized text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS registration_phone text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_normalized_idx
  ON public.profiles (email_normalized) WHERE email_normalized IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_registration_phone_idx
  ON public.profiles (registration_phone) WHERE registration_phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS account_verifications_phone_number_idx
  ON public.account_verifications (phone_number) WHERE phone_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.blocked_disposable_email_domains (
  domain text PRIMARY KEY
);
INSERT INTO public.blocked_disposable_email_domains (domain) VALUES
  ('10minutemail.com'), ('guerrillamail.com'), ('mailinator.com'), ('tempmail.com'),
  ('temp-mail.org'), ('yopmail.com')
ON CONFLICT DO NOTHING;
REVOKE ALL ON public.blocked_disposable_email_domains FROM anon, authenticated;
CREATE TABLE IF NOT EXISTS public.blocked_phone_prefixes (
  prefix text PRIMARY KEY
);
REVOKE ALL ON public.blocked_phone_prefixes FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.normalize_email(p_email text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT lower(btrim(p_email))
$$;

CREATE OR REPLACE FUNCTION public.normalize_registration_phone(p_phone text)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE normalized text := regexp_replace(btrim(p_phone), '[\s().-]', '', 'g');
BEGIN
  IF normalized !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Use an international phone number';
  END IF;
  RETURN normalized;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_disposable_email(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT split_part(public.normalize_email(p_email), '@', 2) IN
    (SELECT domain FROM public.blocked_disposable_email_domains)
$$;

CREATE OR REPLACE FUNCTION public.is_blocked_phone(p_phone text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.blocked_phone_prefixes
    WHERE public.normalize_registration_phone(p_phone) LIKE prefix || '%')
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE email_value text := public.normalize_email(NEW.email);
  phone_value text := NULLIF(btrim(NEW.raw_user_meta_data ->> 'phone'), '');
BEGIN
  IF email_value IS NULL OR public.is_disposable_email(email_value) THEN
    RAISE EXCEPTION 'Disposable email addresses are not accepted';
  END IF;
  IF phone_value IS NOT NULL THEN
    phone_value := public.normalize_registration_phone(phone_value);
    IF public.is_blocked_phone(phone_value) THEN RAISE EXCEPTION 'This phone number type is not accepted'; END IF;
  END IF;
  INSERT INTO public.profiles (id, display_name, email_normalized, registration_phone, created_at)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(email_value, '@', 1)),
    email_value, phone_value, now())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_pending_verification_bonus()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE reward numeric; currency_code text;
BEGIN
  SELECT signup_bonus INTO reward FROM public.platform_reward_config WHERE id = true AND country_code = 'NG';
  SELECT currency INTO currency_code FROM public.wallets WHERE user_id = NEW.id;
  IF reward > 0 THEN
    INSERT INTO public.verification_bonus_claims (user_id, amount, currency, status, expires_at)
    VALUES (NEW.id, reward, COALESCE(currency_code, 'NGN'), 'PENDING_VERIFICATION_BONUS',
      now() + interval '30 days') ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_nigeria_signup_bonus ON public.profiles;
CREATE TRIGGER profiles_pending_verification_bonus AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.create_pending_verification_bonus();

CREATE OR REPLACE FUNCTION public.expire_verification_bonuses()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE expired_count integer;
BEGIN
  UPDATE public.verification_bonus_claims
  SET status = 'EXPIRED', expired_at = now()
  WHERE status = 'PENDING_VERIFICATION_BONUS' AND expires_at <= now();
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_verification_bonuses() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.credit_verification_bonus(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE claim public.verification_bonus_claims;
BEGIN
  SELECT * INTO claim FROM public.verification_bonus_claims
  WHERE user_id = p_user_id FOR UPDATE;
  IF claim.status <> 'PENDING_VERIFICATION_BONUS' THEN RETURN false; END IF;
  IF claim.expires_at <= now() THEN
    UPDATE public.verification_bonus_claims SET status = 'EXPIRED', expired_at = now() WHERE user_id = p_user_id;
    RETURN false;
  END IF;
  UPDATE public.wallets SET promotional_bonus_balance = promotional_bonus_balance + claim.amount,
    updated_at = now() WHERE user_id = p_user_id;
  INSERT INTO public.wallet_ledger (user_id, entry_type, amount, currency, reference, direction, metadata)
    VALUES (p_user_id, 'promotional_bonus', claim.amount, claim.currency,
      'verification-bonus:' || p_user_id::text, 'credit', jsonb_build_object('kind', 'verification_bonus'))
    ON CONFLICT (user_id, entry_type, reference) DO NOTHING;
  UPDATE public.verification_bonus_claims SET status = 'CREDITED', credited_at = now() WHERE user_id = p_user_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.credit_verification_bonus(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_verification_challenge(
  p_channel text, p_target text, p_code_hash text, p_expires_at timestamptz
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE challenge_id uuid; target_value text := btrim(p_target);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_channel NOT IN ('phone', 'email') THEN RAISE EXCEPTION 'Invalid verification channel'; END IF;
  IF p_channel = 'phone' THEN
    target_value := public.normalize_registration_phone(target_value);
    IF public.is_blocked_phone(target_value) THEN RAISE EXCEPTION 'This phone number type is not accepted'; END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE registration_phone = target_value AND id <> auth.uid())
      OR EXISTS (SELECT 1 FROM public.account_verifications WHERE phone_number = target_value AND user_id <> auth.uid())
      THEN RAISE EXCEPTION 'This phone number is already in use'; END IF;
  ELSE
    target_value := public.normalize_email(target_value);
    IF public.is_disposable_email(target_value) THEN RAISE EXCEPTION 'Disposable email addresses are not accepted'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.verification_challenges
    WHERE user_id = auth.uid() AND channel = p_channel AND consumed_at IS NULL
      AND created_at > now() - interval '60 seconds') THEN
    RAISE EXCEPTION 'Please wait before requesting another code';
  END IF;
  UPDATE public.verification_challenges SET consumed_at = now()
    WHERE user_id = auth.uid() AND channel = p_channel AND consumed_at IS NULL;
  INSERT INTO public.account_verifications (user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  INSERT INTO public.verification_challenges (user_id, channel, target, code_hash, expires_at)
    VALUES (auth.uid(), p_channel, target_value, p_code_hash, p_expires_at) RETURNING id INTO challenge_id;
  RETURN challenge_id;
END;
$$;
REVOKE ALL ON FUNCTION public.start_verification_challenge(text, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_verification_challenge(text, text, text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_verification(p_channel text, p_code_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE challenge public.verification_challenges;
  fully_verified boolean;
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
    UPDATE public.account_verifications SET phone_number = public.normalize_registration_phone(challenge.target),
      phone_verified_at = now(), updated_at = now() WHERE user_id = auth.uid();
  ELSIF p_channel = 'email' THEN
    UPDATE public.account_verifications SET email_verified_at = now(), updated_at = now() WHERE user_id = auth.uid();
  ELSE RAISE EXCEPTION 'Invalid verification channel'; END IF;
  SELECT phone_verified_at IS NOT NULL AND email_verified_at IS NOT NULL INTO fully_verified
  FROM public.account_verifications WHERE user_id = auth.uid();
  IF fully_verified THEN PERFORM public.credit_verification_bonus(auth.uid()); END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_verification(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_verification(text, text) TO authenticated;

COMMIT;