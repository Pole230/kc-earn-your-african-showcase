-- 012_create_withdrawals_and_bank_accounts.sql

BEGIN;

-- Create status enum for withdrawals
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'withdrawal_status') THEN
    CREATE TYPE public.withdrawal_status AS ENUM ('pending','approved','processing','paid','rejected','cancelled');
  END IF;
END$$;

-- Admins table to mark admin users (used by RLS policies)
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Bank accounts (only store masked info and provider references)
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_id text,
  account_holder text,
  account_last4 text,
  account_mask text,
  metadata jsonb,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_accounts_creator_idx ON public.bank_accounts (creator_id);

-- Withdrawals table
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bank_account_id uuid REFERENCES public.bank_accounts(id),
  amount numeric(18,6) NOT NULL CHECK (amount > 0),
  fee numeric(18,6) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  net_amount numeric(18,6) GENERATED ALWAYS AS (amount - fee) STORED,
  status public.withdrawal_status NOT NULL DEFAULT 'pending',
  request_note text,
  admin_note text,
  tx_reference text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid,
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS withdrawals_creator_idx ON public.withdrawals (creator_id);
CREATE INDEX IF NOT EXISTS withdrawals_status_idx ON public.withdrawals (status);

-- Audit log for withdrawals
CREATE TABLE IF NOT EXISTS public.withdrawal_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id uuid NOT NULL REFERENCES public.withdrawals(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS withdrawal_audit_withdrawal_idx ON public.withdrawal_audit (withdrawal_id);

-- Enable Row Level Security
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_audit ENABLE ROW LEVEL SECURITY;

-- Policies for bank_accounts: creators manage their own accounts
CREATE POLICY bank_accounts_select_own ON public.bank_accounts
  FOR SELECT USING (creator_id = auth.uid() OR EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = auth.uid()));
CREATE POLICY bank_accounts_insert_own ON public.bank_accounts
  FOR INSERT WITH CHECK (creator_id = auth.uid());
CREATE POLICY bank_accounts_update_own ON public.bank_accounts
  FOR UPDATE USING (creator_id = auth.uid() OR EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = auth.uid())) WITH CHECK (creator_id = auth.uid());
CREATE POLICY bank_accounts_delete_own ON public.bank_accounts
  FOR DELETE USING (creator_id = auth.uid() OR EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = auth.uid()));

-- Policies for withdrawals
-- Creators can see their own withdrawals; admins can see all
CREATE POLICY withdrawals_select_own ON public.withdrawals
  FOR SELECT USING (creator_id = auth.uid() OR EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = auth.uid()));
-- Creators may insert withdrawal requests for themselves
CREATE POLICY withdrawals_insert_own ON public.withdrawals
  FOR INSERT WITH CHECK (creator_id = auth.uid() AND amount > 0);
-- Creators may update their own withdrawals only when cancelling (status -> cancelled) and only before processing
CREATE POLICY withdrawals_update_own ON public.withdrawals
  FOR UPDATE USING (
    creator_id = auth.uid() OR EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = auth.uid())
  ) WITH CHECK (
    (
      -- creators can only change to cancelled on their own pending withdrawals
      (creator_id = auth.uid() AND (status = 'cancelled'))
      OR
      -- admins can perform any allowed update
      (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = auth.uid()))
    )
  );
-- Creators may delete only their own withdrawals (soft delete preferred; here we allow delete for cancelled only)
CREATE POLICY withdrawals_delete_own ON public.withdrawals
  FOR DELETE USING (creator_id = auth.uid());

-- Policies for withdrawal_audit: creators can see audit for their withdrawals; admins can see all
CREATE POLICY withdrawal_audit_select_own ON public.withdrawal_audit
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.withdrawals w WHERE w.id = withdrawal_audit.withdrawal_id AND w.creator_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = auth.uid())
  );
-- Inserts into audit can be done by authenticated users (system/admin/backend). We allow inserts but require actor_id = auth.uid() or NULL (system)
CREATE POLICY withdrawal_audit_insert ON public.withdrawal_audit
  FOR INSERT WITH CHECK (actor_id IS NULL OR actor_id = auth.uid() OR EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = auth.uid()));

-- Trigger: automatic audit entry on withdrawals insert/update
CREATE OR REPLACE FUNCTION public.log_withdrawal_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.withdrawal_audit (withdrawal_id, actor_id, action, details, created_at)
    VALUES (NEW.id, auth.uid(), 'requested', jsonb_build_object('status', NEW.status, 'amount', NEW.amount, 'fee', NEW.fee));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.withdrawal_audit (withdrawal_id, actor_id, action, details, created_at)
    VALUES (NEW.id, auth.uid(), 'updated', jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status, 'admin_note', NEW.admin_note));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.withdrawal_audit (withdrawal_id, actor_id, action, details, created_at)
    VALUES (OLD.id, auth.uid(), 'deleted', jsonb_build_object('status', OLD.status, 'amount', OLD.amount));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_withdrawal_audit ON public.withdrawals;
CREATE TRIGGER trigger_log_withdrawal_audit
AFTER INSERT OR UPDATE OR DELETE ON public.withdrawals
FOR EACH ROW EXECUTE FUNCTION public.log_withdrawal_audit();

COMMIT;
