-- 007_video_comments.sql

create table if not exists public.video_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

create index if not exists video_comments_video_id_idx on public.video_comments (video_id);
create index if not exists video_comments_user_id_idx on public.video_comments (user_id);

alter table public.video_comments enable row level security;

create policy "select_video_comments_public" on public.video_comments
  for select using (true);

create policy "insert_video_comments_authenticated" on public.video_comments
  for insert with check (auth.uid() = user_id and auth.role() = 'authenticated');

create policy "delete_own_video_comment" on public.video_comments
  for delete using (auth.uid() = user_id);
