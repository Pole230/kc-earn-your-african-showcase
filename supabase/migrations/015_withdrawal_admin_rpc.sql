-- Migration: 015_withdrawal_admin_rpc.sql
-- Purpose: Add admin RPCs to approve, reject, and mark withdrawals as paid.
-- Notes:
-- - These functions are SECURITY DEFINER and validate that the caller is an admin user
--   by checking membership in public.admin_users via auth.uid().
-- - They update withdrawal rows only when in the expected states to prevent double processing.
-- - They create audit records and notifications for creators.

-- ==========================================
-- 1) approve_withdrawal
-- ==========================================

create or replace function public.approve_withdrawal(
  p_withdrawal_id uuid,
  p_admin_note text default null
)
returns public.withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  is_admin boolean := false;
  w public.withdrawals%rowtype;
  updated public.withdrawals%rowtype;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select exists(select 1 from public.admin_users where id = uid) into is_admin;
  if not is_admin then
    raise exception 'Unauthorized: admin only';
  end if;

  -- Lock the row for update to avoid races
  select *
  into w
  from public.withdrawals
  where id = p_withdrawal_id
  for update nowait;

  if not found then
    raise exception 'Withdrawal not found';
  end if;

  if w.status <> 'pending' then
    raise exception 'Only pending withdrawals can be approved';
  end if;

  update public.withdrawals
  set
    status = 'approved',
    admin_note = p_admin_note,
    processed_by = uid,
    processed_at = now(),
    updated_at = now()
  where id = p_withdrawal_id
  returning *
  into updated;

  -- Audit
  insert into public.withdrawal_audit(
    withdrawal_id,
    actor_id,
    action,
    details
  ) values (
    updated.id,
    uid,
    'approved',
    jsonb_build_object('admin_note', p_admin_note)
  );

  -- Notification
  insert into public.notifications(
    user_id,
    type,
    message,
    reference_id,
    created_at
  ) values (
    updated.creator_id,
    'withdrawal',
    'Your withdrawal has been approved',
    updated.id,
    now()
  );

  return updated;
end;
$$;

grant execute on function public.approve_withdrawal(uuid, text) to authenticated;

-- ==========================================
-- 2) reject_withdrawal
-- ==========================================

create or replace function public.reject_withdrawal(
  p_withdrawal_id uuid,
  p_admin_note text
)
returns public.withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  is_admin boolean := false;
  w public.withdrawals%rowtype;
  updated public.withdrawals%rowtype;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select exists(select 1 from public.admin_users where id = uid) into is_admin;
  if not is_admin then
    raise exception 'Unauthorized: admin only';
  end if;

  select *
  into w
  from public.withdrawals
  where id = p_withdrawal_id
  for update nowait;

  if not found then
    raise exception 'Withdrawal not found';
  end if;

  if w.status <> 'pending' then
    raise exception 'Only pending withdrawals can be rejected';
  end if;

  update public.withdrawals
  set
    status = 'rejected',
    admin_note = p_admin_note,
    processed_by = uid,
    processed_at = now(),
    updated_at = now()
  where id = p_withdrawal_id
  returning *
  into updated;

  -- Audit
  insert into public.withdrawal_audit(
    withdrawal_id,
    actor_id,
    action,
    details
  ) values (
    updated.id,
    uid,
    'rejected',
    jsonb_build_object('admin_note', p_admin_note)
  );

  -- Notification
  insert into public.notifications(
    user_id,
    type,
    message,
    reference_id,
    created_at
  ) values (
    updated.creator_id,
    'withdrawal',
    'Your withdrawal request was rejected',
    updated.id,
    now()
  );

  return updated;
end;
$$;

grant execute on function public.reject_withdrawal(uuid, text) to authenticated;

-- ==========================================
-- 3) mark_withdrawal_paid
-- ==========================================

create or replace function public.mark_withdrawal_paid(
  p_withdrawal_id uuid,
  p_tx_reference text
)
returns public.withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  is_admin boolean := false;
  w public.withdrawals%rowtype;
  updated public.withdrawals%rowtype;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select exists(select 1 from public.admin_users where id = uid) into is_admin;
  if not is_admin then
    raise exception 'Unauthorized: admin only';
  end if;

  select *
  into w
  from public.withdrawals
  where id = p_withdrawal_id
  for update nowait;

  if not found then
    raise exception 'Withdrawal not found';
  end if;

  if w.status not in ('approved','processing') then
    raise exception 'Only approved or processing withdrawals can be marked as paid';
  end if;

  update public.withdrawals
  set
    status = 'paid',
    tx_reference = p_tx_reference,
    processed_by = uid,
    processed_at = now(),
    updated_at = now()
  where id = p_withdrawal_id
  returning *
  into updated;

  -- Audit
  insert into public.withdrawal_audit(
    withdrawal_id,
    actor_id,
    action,
    details
  ) values (
    updated.id,
    uid,
    'paid',
    jsonb_build_object('tx_reference', p_tx_reference)
  );

  -- Notification
  insert into public.notifications(
    user_id,
    type,
    message,
    reference_id,
    created_at
  ) values (
    updated.creator_id,
    'withdrawal',
    'Your withdrawal has been paid',
    updated.id,
    now()
  );

  return updated;
end;
$$;

grant execute on function public.mark_withdrawal_paid(uuid, text) to authenticated;
