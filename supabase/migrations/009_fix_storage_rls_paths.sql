-- 009_fix_storage_rls_paths.sql

BEGIN;

-- Drop existing policies (safe to run multiple times)
DROP POLICY IF EXISTS allow_upload_by_owner ON storage.objects;
DROP POLICY IF EXISTS allow_update_by_owner ON storage.objects;
DROP POLICY IF EXISTS allow_delete_by_owner ON storage.objects;

-- Recreate policies with bucket-aware checks and per-user path matching.
-- This ensures uploads to the `videos` and `thumbnails` buckets are allowed when
-- the object name begins with the authenticated user's UID (i.e., `<uid>/...`).

CREATE POLICY allow_upload_by_owner ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    (bucket_id = (SELECT id FROM storage.buckets WHERE name = 'videos') AND name LIKE auth.uid() || '/%')
    OR
    (bucket_id = (SELECT id FROM storage.buckets WHERE name = 'thumbnails') AND name LIKE auth.uid() || '/%')
  )
);

CREATE POLICY allow_update_by_owner ON storage.objects
FOR UPDATE TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    (bucket_id = (SELECT id FROM storage.buckets WHERE name = 'videos') AND name LIKE auth.uid() || '/%')
    OR
    (bucket_id = (SELECT id FROM storage.buckets WHERE name = 'thumbnails') AND name LIKE auth.uid() || '/%')
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    (bucket_id = (SELECT id FROM storage.buckets WHERE name = 'videos') AND name LIKE auth.uid() || '/%')
    OR
    (bucket_id = (SELECT id FROM storage.buckets WHERE name = 'thumbnails') AND name LIKE auth.uid() || '/%')
  )
);

CREATE POLICY allow_delete_by_owner ON storage.objects
FOR DELETE TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    (bucket_id = (SELECT id FROM storage.buckets WHERE name = 'videos') AND name LIKE auth.uid() || '/%')
    OR
    (bucket_id = (SELECT id FROM storage.buckets WHERE name = 'thumbnails') AND name LIKE auth.uid() || '/%')
  )
);

COMMIT;
