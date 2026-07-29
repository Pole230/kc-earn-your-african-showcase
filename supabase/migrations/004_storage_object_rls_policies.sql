-- Migration: Add RLS policies on storage.objects to restrict uploads/updates/deletes to per-user folders
-- Keeps videos and thumbnails buckets private; viewing remains via signed URLs

BEGIN;

-- Ensure the videos and thumbnails buckets are private
UPDATE storage.buckets
SET public = false
WHERE name IN ('videos', 'thumbnails');

-- Enable Row Level Security on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (safe to run multiple times)
DROP POLICY IF EXISTS allow_upload_by_owner ON storage.objects;
DROP POLICY IF EXISTS allow_update_by_owner ON storage.objects;
DROP POLICY IF EXISTS allow_delete_by_owner ON storage.objects;

--
-- Policy: allow inserts (uploads) only when the object path is within the authenticated user's folder
-- Paths allowed: videos/<user_id>/*  or thumbnails/<user_id>/*
--
CREATE POLICY allow_upload_by_owner ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    name LIKE 'videos/' || auth.uid() || '/%' OR
    name LIKE 'thumbnails/' || auth.uid() || '/%'
  )
);

--
-- Policy: allow updates only when the existing object belongs to the authenticated user
-- and the updated object's path (name) also remains within the user's folder
--
CREATE POLICY allow_update_by_owner ON storage.objects
FOR UPDATE TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    name LIKE 'videos/' || auth.uid() || '/%' OR
    name LIKE 'thumbnails/' || auth.uid() || '/%'
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    name LIKE 'videos/' || auth.uid() || '/%' OR
    name LIKE 'thumbnails/' || auth.uid() || '/%'
  )
);

--
-- Policy: allow deletes only when the existing object belongs to the authenticated user
--
CREATE POLICY allow_delete_by_owner ON storage.objects
FOR DELETE TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    name LIKE 'videos/' || auth.uid() || '/%' OR
    name LIKE 'thumbnails/' || auth.uid() || '/%'
  )
);

COMMIT;

-- Down (rollback): drop the policies added above. Do not change bucket privacy here to avoid exposing data.

-- Note: Some migration runners expect a single-file up/down split; if your runner requires a separate down migration file,
-- extract the statements below into the appropriate rollback file.

-- DROP POLICY IF EXISTS allow_upload_by_owner ON storage.objects;
-- DROP POLICY IF EXISTS allow_update_by_owner ON storage.objects;
-- DROP POLICY IF EXISTS allow_delete_by_owner ON storage.objects;
