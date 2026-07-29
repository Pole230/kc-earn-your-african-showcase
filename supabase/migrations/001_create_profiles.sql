-- 001_create_profiles.sql
-- Create pgcrypto extension and the profiles table.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key,
  display_name text,
  username text unique,
  location text,
  avatar_path text,
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_idx on public.profiles (username);

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Allow public SELECT on profiles (display info). Owners can insert/update/delete only their own profile.
create policy "select_profiles_public" on public.profiles
  for select using (true);

create policy "insert_own_profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "update_own_profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "delete_own_profile" on public.profiles
  for delete using (auth.uid() = id);
