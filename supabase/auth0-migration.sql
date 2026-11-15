-- Migration for an EXISTING Collectium database: allow Auth0 users next to
-- Supabase Auth users.
--
-- What it does: user ids change from uuid to text (the token's `sub`), so
-- 'auth0|...' and 'google-oauth2|...' ids fit. Existing UUIDs convert as they
-- are, so no data is lost and current users keep their collections.
--
-- Order:
--   1. Back up first (Dashboard -> Database -> Backups, or pg_dump).
--   2. Run THIS file.
--   3. Re-run, in this order: schema.sql, profile-editing.sql,
--      account-deletion.sql. They are safe to re-run and they recreate every
--      policy and function with the new text-based versions.
--
-- Fresh databases skip this file: schema.sql already creates the new layout.
-- Everything below runs in one transaction; if anything fails nothing changes.

begin;

-- 1. Policies that mention the id columns block ALTER COLUMN TYPE, so drop
--    them. Step 3 of the order above brings them back.
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Collections are visible if public or owned" on public.collections;
drop policy if exists "Users can create their own collections" on public.collections;
drop policy if exists "Users can update their own collections" on public.collections;
drop policy if exists "Users can delete their own collections" on public.collections;
drop policy if exists "Items are visible with their collection" on public.collection_items;
drop policy if exists "Users can add items to their own collections" on public.collection_items;
drop policy if exists "Users can update their own items" on public.collection_items;
drop policy if exists "Users can delete their own items" on public.collection_items;
-- Storage policies call auth.uid()::text, which would fail for Auth0 ids.
drop policy if exists "Users can list their own images" on storage.objects;
drop policy if exists "Users can upload to their own folder" on storage.objects;
drop policy if exists "Users can delete their own collectible images" on storage.objects;

-- 2. Drop the foreign keys that tie the id columns together (and profiles to
--    auth.users, which Auth0 users are not in).
alter table public.collection_items drop constraint if exists collection_items_user_id_fkey;
alter table public.collections drop constraint if exists collections_user_id_fkey;
alter table public.profiles drop constraint if exists profiles_id_fkey;

-- 3. uuid -> text. The cast keeps every existing value.
alter table public.profiles alter column id type text using id::text;
alter table public.collections alter column user_id type text using user_id::text;
alter table public.collection_items alter column user_id type text using user_id::text;

-- 4. Put the profile links back. No link to auth.users any more.
alter table public.collections
  add constraint collections_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;
alter table public.collection_items
  add constraint collection_items_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- 5. The signup trigger for Supabase Auth users must now write a text id.
--    (schema.sql does this too; doing it here keeps signups working if step 3
--    of the order is delayed.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id::text,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      'user_' || left(replace(new.id::text, '-', ''), 12)
    )
  );
  return new;
end;
$$;

-- 6. Auth0 users insert their own profile row on first sign-in.
grant insert on public.profiles to authenticated;

commit;

notify pgrst, 'reload schema';

-- Loss of cascade: deleting a user from auth.users no longer deletes their
-- profile automatically (the foreign key is gone). The app deletes accounts
-- through delete_my_account(), which removes everything itself. If you delete
-- users by hand in the dashboard, delete their public.profiles row too.
