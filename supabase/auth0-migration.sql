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
--    them. This drops EVERY policy on the three tables, including any you
--    added yourself (e.g. "Users can manage own profile"), and prints each
--    definition as a NOTICE (see the Results/Messages panel) before dropping it.
--    The standard ones come back in step 3 of the order above. If you had a
--    custom policy, rewrite it with (select public.requesting_user_id())
--    instead of auth.uid() and create it again.
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'collections', 'collection_items')
  loop
    raise notice 'Dropping policy % on %.%: cmd=%, roles=%, using=%, with check=%',
      pol.policyname, pol.schemaname, pol.tablename, pol.cmd, pol.roles,
      pol.qual, pol.with_check;
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

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
