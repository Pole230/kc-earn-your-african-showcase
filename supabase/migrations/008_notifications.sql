-- 008_notifications.sql

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade, -- recipient
  actor_id uuid not null references public.profiles(id) on delete cascade, -- actor who caused the notification
  type text not null,
  reference_id uuid,
  message text,
  read boolean default false,
  created_at timestamptz default now()
);

create index if not exists notifications_user_id_idx on public.notifications (user_id);
create index if not exists notifications_created_at_idx on public.notifications (created_at);

alter table public.notifications enable row level security;

-- Only allow recipients to SELECT their own notifications
create policy "select_notifications_owner" on public.notifications
  for select using (auth.uid() = user_id);

-- Allow the actor (current user) to INSERT notifications where they are the actor
create policy "insert_notifications_actor" on public.notifications
  for insert with check (auth.uid() = actor_id and auth.role() = 'authenticated');

-- Allow recipients to UPDATE (mark as read) their own notifications
create policy "update_notifications_owner" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
