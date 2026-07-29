-- 005_video_likes.sql

create table if not exists public.video_likes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);

create unique index if not exists video_likes_video_user_idx on public.video_likes (video_id, user_id);
create index if not exists video_likes_video_id_idx on public.video_likes (video_id);
create index if not exists video_likes_user_id_idx on public.video_likes (user_id);

alter table public.video_likes enable row level security;

create policy "select_video_likes_public" on public.video_likes
  for select using (true);

create policy "insert_video_likes_authenticated" on public.video_likes
  for insert with check (auth.uid() = user_id and auth.role() = 'authenticated');

create policy "delete_own_video_like" on public.video_likes
  for delete using (auth.uid() = user_id);
