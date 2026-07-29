-- 010_creator_earnings.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.creator_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  earning_type text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_earnings_creator_id_idx ON public.creator_earnings (creator_id);
CREATE INDEX IF NOT EXISTS creator_earnings_video_id_idx ON public.creator_earnings (video_id);

-- Enable Row Level Security
ALTER TABLE public.creator_earnings ENABLE ROW LEVEL SECURITY;

-- Allow creators to select only their own earnings
CREATE POLICY "creators_select_own" ON public.creator_earnings
  FOR SELECT USING (
    creator_id = auth.uid()
  );

-- Allow authenticated users to insert earnings for themselves only (service_role can insert from backend)
CREATE POLICY "creators_insert_own" ON public.creator_earnings
  FOR INSERT TO authenticated WITH CHECK (
    creator_id = auth.uid() AND amount >= 0
  );

-- Allow creators to update their own earnings (if needed) with checks
CREATE POLICY "creators_update_own" ON public.creator_earnings
  FOR UPDATE TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid() AND amount >= 0);

-- Allow creators to delete their own earnings
CREATE POLICY "creators_delete_own" ON public.creator_earnings
  FOR DELETE TO authenticated
  USING (creator_id = auth.uid());

COMMIT;
