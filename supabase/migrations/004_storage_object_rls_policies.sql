-- 004_storage_object_rls_policies.sql

-- Enable Row Level Security on storage.objects
alter table if exists storage.objects enable row level security;

-- Allow authenticated users to INSERT into storage.objects for the videos and thumbnails buckets
-- only when they are uploading into their own folder (first path segment is the user id).
create policy if not exists "insert_own_videos_thumbnails" on storage.objects
  for insert with check (
    bucket_id in ('videos','thumbnails')
    and auth.uid() = split_part(name, '/', 1)
  );

-- Allow authenticated users to SELECT their own objects in the videos and thumbnails buckets
-- (owners can list/read metadata if needed). Do NOT allow public select.
create policy if not exists "select_own_videos_thumbnails" on storage.objects
  for select using (
    bucket_id in ('videos','thumbnails')
    and auth.uid() = split_part(name, '/', 1)
  );

-- Allow authenticated users to UPDATE objects only in their own folder for videos and thumbnails
create policy if not exists "update_own_videos_thumbnails" on storage.objects
  for update using (
    bucket_id in ('videos','thumbnails')
    and auth.uid() = split_part(name, '/', 1)
  ) with check (
    bucket_id in ('videos','thumbnails')
    and auth.uid() = split_part(name, '/', 1)
  );

-- Allow authenticated users to DELETE objects only in their own folder for videos and thumbnails
create policy if not exists "delete_own_videos_thumbnails" on storage.objects
  for delete using (
    bucket_id in ('videos','thumbnails')
    and auth.uid() = split_part(name, '/', 1)
  );

-- Note: We intentionally do NOT create any policy that allows public select on storage.objects.
-- Access to private objects for viewing should be done via signed URLs (createSignedUrls) which
-- remain compatible with private buckets.
