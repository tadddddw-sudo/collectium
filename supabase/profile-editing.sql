-- Profile editing for Collectium: biography, display name, handle, profile
-- picture, banner and featured collections.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run again: every step checks what already exists.
-- Used by PATCH /api/profiles/me and POST/DELETE /api/profiles/me/{avatar,banner}.

-- 1. Columns. bio, display_name and avatar_url probably exist already;
--    "if not exists" skips them in that case.
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists banner_url text;
alter table public.profiles
  add column if not exists featured_collection_ids uuid[] not null default '{}';

-- 2. Limits, matching the checks in routes/profiles.js. NOT VALID means rows
--    that already break a limit are left alone; new writes are checked.
alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles
  add constraint profiles_bio_length check (bio is null or char_length(bio) <= 500) not valid;

alter table public.profiles drop constraint if exists profiles_display_name_length;
alter table public.profiles
  add constraint profiles_display_name_length
  check (display_name is null or char_length(display_name) <= 50) not valid;

alter table public.profiles drop constraint if exists profiles_featured_max;
alter table public.profiles
  add constraint profiles_featured_max
  check (cardinality(featured_collection_ids) <= 3) not valid;

-- 3. One handle per person, ignoring case ("Alice" and "alice" can't coexist).
--    If two existing handles differ only by case this step is skipped with a
--    notice; rename one of them and run the file again.
do $$
begin
  create unique index if not exists profiles_username_lower_key
    on public.profiles (lower(username));
exception when unique_violation then
  raise notice 'Skipped profiles_username_lower_key: some handles differ only by case.';
end $$;

-- 4. Row Level Security: everyone can read profiles (they are public pages),
--    and a signed-in user can update only their own row.
alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (id = (select public.requesting_user_id()))
  with check (id = (select public.requesting_user_id()));

-- Auth0 users have no signup trigger, so the server inserts their profile row
-- (as the user) on first sign-in. The row id must be the caller's own id.
drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (id = (select public.requesting_user_id()));

-- 5. Storage: profile pictures and banners go to
--    collectibles/<user_id>/profile/<file>. Let users upload only into their
--    own folder (the delete policy is in supabase/account-deletion.sql).
drop policy if exists "Users can upload to their own folder" on storage.objects;
create policy "Users can upload to their own folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'collectibles'
    and (storage.foldername(name))[1] = (select public.requesting_user_id())
  );

-- 6. Let PostgREST see the new columns straight away.
notify pgrst, 'reload schema';
