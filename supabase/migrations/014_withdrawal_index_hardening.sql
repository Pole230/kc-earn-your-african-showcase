-- Migration: 014_withdrawal_index_hardening.sql
-- Purpose: Harden the KC Earn withdrawal system against duplicate pending withdrawals and race conditions.
-- Notes:
-- 1) This migration updates pre-existing duplicate 'pending' withdrawals by keeping the newest and marking older ones as 'cancelled', preserving history via metadata.
-- 2) It then creates a DB-level unique index to ensure a creator can have at most one pending withdrawal.
-- 3) The request_withdrawal RPC already uses advisory locks; the index provides a DB-level enforcement as a last line of defense.

-- ==========================================
-- 1. Detect & resolve duplicate pending withdrawals
-- ==========================================

-- Safety: we do not DELETE rows. We keep the newest pending withdrawal (by created_at, then id) and mark older ones as 'cancelled'.
-- We also append metadata to preserve an audit trail about this automatic resolution.

-- This SELECT is informative and can be run manually prior to applying the UPDATE to inspect duplicates:
-- SELECT creator_id, count(*) AS pending_count
-- FROM public.withdrawals
-- WHERE status = 'pending'
-- GROUP BY creator_id
-- HAVING count(*) > 1;

-- Update older duplicate pending withdrawals to 'cancelled' and attach metadata indicating auto-resolution.
WITH ranked AS (
  SELECT
    id,
    creator_id,
    row_number() OVER (PARTITION BY creator_id ORDER BY created_at DESC NULLS LAST, id DESC) AS rn
  FROM public.withdrawals
  WHERE status = 'pending'
)
UPDATE public.withdrawals w
SET
  status = 'cancelled',
  metadata = (
    -- preserve existing metadata if present, and add our keys
    COALESCE(w.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'auto_resolved_duplicates', true,
      'reason', 'pending_withdrawal_unique_index_cleanup'
    )
  )
FROM ranked r
WHERE w.id = r.id
  AND r.rn > 1
  -- only update if status is still pending (defensive)
  AND w.status = 'pending';

-- ==========================================
-- 2. Create DB-level unique index to prevent more than one pending withdrawal per creator
-- ==========================================

-- NOTE: Creating an index CONCURRENTLY is preferred in high-traffic production environments to avoid long write locks.
-- However, CREATE INDEX CONCURRENTLY cannot be run inside a transaction block. Supabase migration runners often wrap
-- migrations in a transaction, so we create the index using IF NOT EXISTS here. If you have a maintenance window or
-- can run DDL outside a transaction, prefer the CONCURRENTLY form shown in the comment below.

-- Preferred (run manually outside of a transaction):
-- CREATE UNIQUE INDEX CONCURRENTLY ux_withdrawals_creator_pending
--   ON public.withdrawals (creator_id)
--   WHERE status = 'pending';

-- Migration-friendly (safe to run inside a transaction/migration):
CREATE UNIQUE INDEX IF NOT EXISTS ux_withdrawals_creator_pending
  ON public.withdrawals (creator_id)
  WHERE status = 'pending';

-- Add comments documenting why this index exists and how it helps.
COMMENT ON INDEX public.ux_withdrawals_creator_pending IS $$
Prevents a creator from having more than one withdrawal row with status = 'pending'.

This index acts as a database-level enforcement so that even if application code or multiple
concurrent clients race, the DB will guarantee uniqueness of a single pending withdrawal per creator.

The request_withdrawal RPC also takes out a per-user advisory lock (pg_advisory_xact_lock)
and re-checks for pending withdrawals prior to inserting; the advisory lock helps prevent
race windows at the application level. The unique index is a last line of defense.

When deploying to production with heavy write traffic, consider recreating the index using
CREATE UNIQUE INDEX CONCURRENTLY ... outside of a transaction to avoid long locks.
$$;

-- ==========================================
-- 3. Notes / safety checklist
-- ==========================================
-- - This migration does NOT modify authentication, wallet tables, or creator earnings tables.
-- - This migration does NOT delete audit history; it updates older pending rows to 'cancelled' and appends metadata.
-- - Uses IF NOT EXISTS to keep the migration idempotent for the index creation step.
-- - If you prefer the CONCURRENTLY index creation, perform that step manually outside of the migration transaction:
--   1) Ensure duplicates are resolved (see the SELECT above and the UPDATE that ran here).
--   2) Run: CREATE UNIQUE INDEX CONCURRENTLY ux_withdrawals_creator_pending ON public.withdrawals (creator_id) WHERE status = 'pending';
-- - The request_withdrawal RPC already uses an advisory lock; this index reduces risk of race-condition-related duplicate rows
--   even if an application path forgets the lock.

-- End of migration 014
