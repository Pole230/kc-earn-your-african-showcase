-- 006_follows.sql

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);

create unique index if not exists follows_follower_following_idx on public.follows (follower_id, following_id);
create index if not exists follows_follower_idx on public.follows (follower_id);
create index if not exists follows_following_idx on public.follows (following_id);

alter table public.follows enable row level security;

create policy "select_follows_public" on public.follows
  for select using (true);

create policy "insert_follow_authenticated" on public.follows
  for insert with check (auth.uid() = follower_id and auth.role() = 'authenticated');

create policy "delete_own_follow" on public.follows
  for delete using (auth.uid() = follower_id);
