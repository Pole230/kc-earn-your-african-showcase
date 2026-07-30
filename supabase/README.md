# Supabase setup for KC Earn (Stage 2 backend foundation)

This document describes the manual steps required in the Supabase dashboard (or CLI) to finish Stage 2 backend foundation: storage buckets and applying migrations added to supabase/migrations.

IMPORTANT SECURITY NOTES
- Buckets MUST be created as PRIVATE (not public). The client uses signed URLs to access files temporarily.
- Do NOT create any storage policy that makes all files publicly selectable.
- Do not store service_role keys in the repo. Use Supabase dashboard/CI secrets for privileged operations.

Buckets to create
1) videos
   - Purpose: store original video files (mp4/mov etc.).
   - Privacy: Private
   - Recommended naming: videos (exactly, so client code works)
   - Upload pattern: client uploads to paths like `{user_id}/{timestamp}-{rand}.{ext}`

2) thumbnails
   - Purpose: store small cover images for videos.
   - Privacy: Private
   - Name: thumbnails

Create buckets (Dashboard)
- Go to Supabase project → Storage → Create a new bucket
  - Name: videos
  - Public: OFF (Private)
  - Create
- Repeat for thumbnails

Create buckets (supabase CLI)
- supabase login
- supabase storage create-bucket videos --public false
- supabase storage create-bucket thumbnails --public false

Apply migrations
- The SQL migration files are added under supabase/migrations. You can apply them by:
  Option A (Supabase CLI + db push):
    1. Install and login to supabase CLI
    2. Run: `supabase db push` (or `supabase migration deploy` depending on your workflow)
  Option B (Dashboard SQL editor):
    - Open the SQL editor in Supabase dashboard and run the migration files in order:
      1. supabase/migrations/001_create_profiles.sql
      2. supabase/migrations/002_create_videos_table_and_policies.sql
      3. supabase/migrations/003_auth_trigger_create_profile.sql
      4. supabase/migrations/004_storage_object_rls_policies.sql
      5. supabase/migrations/20260730_add_likes_and_updated_at_to_videos.sql

What the migrations do
- Create a `profiles` table keyed by auth user id. RLS is enabled for profiles; public SELECT is allowed, but insert/update/delete are restricted to the owner.
- Create a `videos` table referencing `profiles(id)` with fields used by the frontend (video_path, thumbnail_path, status, category, duration_seconds, views_count). RLS is enabled with policies that restrict access to published videos or the owner, and only allow inserts where user_id = auth.uid().
- Add RLS on storage.objects so users can only insert/update/delete objects within their own `videos/{user_id}/...` and `thumbnails/{user_id}/...` paths.
- Add `likes_count` and `updated_at` to `videos` (migration `20260730_add_likes_and_updated_at_to_videos.sql`).

Storage object naming convention (important)
- The frontend and storage RLS policies expect uploads to follow this pattern inside each bucket:

  videos/{user_id}/{timestamp}-{random}.{ext}
  thumbnails/{user_id}/{timestamp}-{random}.jpg

- Example: `videos/0e8a6f1c-3c3d-4a2c-9fbd-20260730-8f7a1b.mp4`

Signed URLs and playback
- Buckets are private. Do NOT store signed URLs in the database: signed URLs are short-lived and will expire. Instead, store the permanent storage object path in the database (video_path and thumbnail_path) and generate signed URLs on demand when the frontend needs to display or play a video.
- On the client, use the Supabase client to create signed URLs when rendering a video card or player, for example:

```ts
const { data } = await supabase.storage.from('videos').createSignedUrl(video_path, 60 * 60); // 1 hour
```

Security policies (notes)
- The repo includes `supabase/migrations/004_storage_object_rls_policies.sql` which enforces per-user path restrictions for uploads/updates/deletes. Keep these policies to ensure users can only manage their own objects.

After applying migrations
- Ensure the buckets exist and are private.
- Confirm that the videos and profiles tables exist and that RLS is enabled.
- Confirm that the trigger exists on auth.users.

Client compatibility
- The current frontend expects these table/column names and storage buckets. The frontend stores only storage paths in the `videos` table (`video_path` and `thumbnail_path`) and generates signed URLs on demand for playback.

If you want, I can also add example storage.object RLS SQL policies that restrict uploads to the user's folder; I did not include them automatically to avoid changing storage table policies without confirmation.
