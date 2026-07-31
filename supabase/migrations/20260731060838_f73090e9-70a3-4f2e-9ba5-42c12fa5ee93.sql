-- WALLETS
CREATE TABLE public.wallets (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  available_balance numeric(14,2) NOT NULL DEFAULT 0,
  pending_balance numeric(14,2) NOT NULL DEFAULT 0,
  lifetime_earned numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own wallet" ON public.wallets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER wallets_set_updated_at BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- EARNINGS
CREATE TYPE public.earning_source AS ENUM ('views', 'engagement', 'bonus', 'referral');

CREATE TABLE public.earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id uuid REFERENCES public.videos(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL,
  source public.earning_source NOT NULL DEFAULT 'views',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX earnings_user_created_idx ON public.earnings (user_id, created_at DESC);
GRANT SELECT ON public.earnings TO authenticated;
GRANT ALL ON public.earnings TO service_role;
ALTER TABLE public.earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own earnings" ON public.earnings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- WITHDRAWALS
CREATE TYPE public.withdrawal_status AS ENUM ('pending', 'processing', 'paid', 'rejected');

CREATE TABLE public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL,
  destination text NOT NULL,
  status public.withdrawal_status NOT NULL DEFAULT 'pending',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX withdrawals_user_created_idx ON public.withdrawals (user_id, created_at DESC);
GRANT SELECT, INSERT ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own withdrawals" ON public.withdrawals
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can request their own withdrawals" ON public.withdrawals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER withdrawals_set_updated_at BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- WALLET SYNC ON EARNINGS
CREATE OR REPLACE FUNCTION public.apply_earning_to_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallets (user_id, available_balance, lifetime_earned)
  VALUES (NEW.user_id, NEW.amount, GREATEST(NEW.amount, 0))
  ON CONFLICT (user_id) DO UPDATE
    SET available_balance = public.wallets.available_balance + NEW.amount,
        lifetime_earned = public.wallets.lifetime_earned + GREATEST(NEW.amount, 0),
        updated_at = now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_earning_to_wallet() FROM public, anon, authenticated;

CREATE TRIGGER earnings_apply_to_wallet AFTER INSERT ON public.earnings
  FOR EACH ROW EXECUTE FUNCTION public.apply_earning_to_wallet();

-- WALLET FOR NEW AND EXISTING USERS
CREATE OR REPLACE FUNCTION public.create_wallet_for_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallets (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_wallet_for_profile() FROM public, anon, authenticated;

CREATE TRIGGER profiles_create_wallet AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_wallet_for_profile();

INSERT INTO public.wallets (user_id)
SELECT id FROM public.profiles ON CONFLICT (user_id) DO NOTHING;

-- WITHDRAWAL RPC
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  _amount numeric,
  _method text,
  _destination text
)
RETURNS public.withdrawals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _available numeric;
  _row public.withdrawals;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be greater than zero';
  END IF;
  IF _method IS NULL OR btrim(_method) = '' OR _destination IS NULL OR btrim(_destination) = '' THEN
    RAISE EXCEPTION 'Payout method and destination are required';
  END IF;

  SELECT available_balance INTO _available FROM public.wallets WHERE user_id = _uid FOR UPDATE;
  IF _available IS NULL THEN
    INSERT INTO public.wallets (user_id) VALUES (_uid)
      ON CONFLICT (user_id) DO NOTHING;
    _available := 0;
  END IF;

  IF _available < _amount THEN
    RAISE EXCEPTION 'Insufficient available balance';
  END IF;

  UPDATE public.wallets
    SET available_balance = available_balance - _amount,
        pending_balance = pending_balance + _amount,
        updated_at = now()
  WHERE user_id = _uid;

  INSERT INTO public.withdrawals (user_id, amount, method, destination)
  VALUES (_uid, _amount, btrim(_method), btrim(_destination))
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text) TO authenticated;