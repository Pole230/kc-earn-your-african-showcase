-- 002_create_videos_table_and_policies.sql

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  category text,
  duration_seconds integer,
  views_count bigint default 0 not null,
  status text not null default 'processing', -- processing | published | removed
  video_path text not null,
  thumbnail_path text,
  created_at timestamptz not null default now()
);

create index if not exists videos_created_at_idx on public.videos (created_at desc);
create index if not exists videos_category_idx on public.videos (category);
create index if not exists videos_status_idx on public.videos (status);

-- Enable Row Level Security
alter table public.videos enable row level security;

-- Allow SELECT if video is published OR the requesting user is the owner
create policy "select_published_or_owner" on public.videos
  for select using (
    (status = 'published') OR (user_id = auth.uid())
  );

-- Allow authenticated users to insert only rows where user_id matches their own uid
create policy "insert_own_videos" on public.videos
  for insert with check (
    user_id = auth.uid()
  );

-- Allow owners to update their own videos
create policy "update_own_videos" on public.videos
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Allow owners to delete their own videos
create policy "delete_own_videos" on public.videos
  for delete using (user_id = auth.uid());
