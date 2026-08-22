BEGIN;

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

CREATE INDEX IF NOT EXISTS verification_challenges_active_idx
  ON public.verification_challenges (user_id, channel, created_at DESC)
  WHERE consumed_at IS NULL;

ALTER TABLE public.account_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_verifications_select_own ON public.account_verifications;
CREATE POLICY account_verifications_select_own ON public.account_verifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.start_verification_challenge(
  p_channel text,
  p_target text,
  p_code_hash text,
  p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  challenge_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_channel NOT IN ('phone', 'email') THEN RAISE EXCEPTION 'Invalid verification channel'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.verification_challenges
    WHERE user_id = auth.uid() AND channel = p_channel AND consumed_at IS NULL
      AND created_at > now() - interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'Please wait before requesting another code';
  END IF;

  UPDATE public.verification_challenges
  SET consumed_at = now()
  WHERE user_id = auth.uid() AND channel = p_channel AND consumed_at IS NULL;

  INSERT INTO public.account_verifications (user_id)
  VALUES (auth.uid()) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.verification_challenges (user_id, channel, target, code_hash, expires_at)
  VALUES (auth.uid(), p_channel, p_target, p_code_hash, p_expires_at)
  RETURNING id INTO challenge_id;
  RETURN challenge_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_verification(
  p_channel text,
  p_code_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  challenge public.verification_challenges;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO challenge FROM public.verification_challenges
  WHERE user_id = auth.uid() AND channel = p_channel AND consumed_at IS NULL
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF challenge.id IS NULL OR challenge.expires_at <= now() THEN
    RAISE EXCEPTION 'Code expired or unavailable';
  END IF;
  IF challenge.attempts >= 5 THEN RAISE EXCEPTION 'Too many attempts'; END IF;

  UPDATE public.verification_challenges SET attempts = attempts + 1 WHERE id = challenge.id;
  IF challenge.code_hash <> p_code_hash THEN RAISE EXCEPTION 'Invalid verification code'; END IF;

  UPDATE public.verification_challenges SET consumed_at = now() WHERE id = challenge.id;
  INSERT INTO public.account_verifications (user_id) VALUES (auth.uid())
    ON CONFLICT (user_id) DO NOTHING;
  IF p_channel = 'phone' THEN
    UPDATE public.account_verifications SET phone_number = challenge.target,
      phone_verified_at = now(), updated_at = now()
    WHERE user_id = auth.uid();
  ELSE
    UPDATE public.account_verifications SET email_verified_at = now(), updated_at = now()
    WHERE user_id = auth.uid();
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.start_verification_challenge(text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_verification(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_verification_challenge(text, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_verification(text, text) TO authenticated;

-- Financial eligibility is intentionally enforced in the database, not only in the client.
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  _amount numeric, _method text, _destination text
)
RETURNS public.withdrawals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _available numeric; _row public.withdrawals;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.account_verifications WHERE user_id = _uid
    AND phone_verified_at IS NOT NULL AND email_verified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Verify your phone number and email before requesting a withdrawal';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Withdrawal amount must be greater than zero'; END IF;
  IF _method IS NULL OR btrim(_method) = '' OR _destination IS NULL OR btrim(_destination) = '' THEN
    RAISE EXCEPTION 'Payout method and destination are required';
  END IF;
  SELECT available_balance INTO _available FROM public.wallets WHERE user_id = _uid FOR UPDATE;
  IF _available IS NULL THEN
    INSERT INTO public.wallets (user_id) VALUES (_uid) ON CONFLICT (user_id) DO NOTHING; _available := 0;
  END IF;
  IF _available < _amount THEN RAISE EXCEPTION 'Insufficient available balance'; END IF;
  UPDATE public.wallets SET available_balance = available_balance - _amount,
    pending_balance = pending_balance + _amount, updated_at = now() WHERE user_id = _uid;
  INSERT INTO public.withdrawals (user_id, amount, method, destination)
    VALUES (_uid, _amount, btrim(_method), btrim(_destination)) RETURNING * INTO _row;
  RETURN _row;
END;
$$;

COMMIT;