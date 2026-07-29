-- 003_auth_trigger_create_profile.sql

-- Function to create a profile row when a new auth user is created.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  -- Insert a profiles row using the new user's id. Use display_name from raw_user_meta_data if present,
  -- otherwise fall back to the email prefix. Do nothing on conflict.
  insert into public.profiles (id, display_name, created_at)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'display_name'), split_part(new.email, '@', 1)),
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Attach the trigger to auth.users so it runs whenever a new user is created by Supabase Auth
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();
