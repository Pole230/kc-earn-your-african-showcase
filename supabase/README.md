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

What the migrations do
- Create a `profiles` table keyed by auth user id. RLS is enabled for profiles; public SELECT is allowed, but insert/update/delete are restricted to the owner.
- Create a `videos` table referencing `profiles(id)` with fields used by the frontend (video_path, thumbnail_path, status, category, duration_seconds, views_count). RLS is enabled with policies that allow:
  - SELECT: published videos are readable by anyone, or owners can read their own videos.
  - INSERT: authenticated users may insert rows where user_id = their auth.uid().
  - UPDATE / DELETE: owners only.
- Create a trigger that creates a profiles row automatically when a new auth user is created (works for email signups and OAuth). This ensures the frontend sees profile data when joining videos -> profiles.

Storage policies (optional)
- This repo does not add storage policies that make objects public. If you need stricter control that enforces per-folder ownership, you can add storage RLS policies in the SQL editor to restrict insert/update/delete on storage.objects to the folder owner. Example condition: `auth.uid() = split_part(name, '/', 1)`.

After applying migrations
- Ensure the buckets exist and are private.
- Confirm that the videos and profiles tables exist and that RLS is enabled.
- Confirm that the trigger exists on auth.users.

Client compatibility
- The current frontend expects these table/column names and storage buckets. No frontend code changes were made.

If you want, I can also add example storage.object RLS SQL policies that restrict uploads to the user's folder; I did not include them automatically to avoid changing storage table policies without your explicit approval.
