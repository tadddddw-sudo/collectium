-- Fix: Google (Auth0) users could not upload images ("Invalid key").
--
-- Supabase Storage rejects object names that contain "|", and Auth0 user ids
-- always have one ('google-oauth2|1234...'). Images now go into a folder where
-- "|" is replaced by "_" ('google-oauth2_1234...'). Email users have UUID ids,
-- so their folder name and their existing images are unchanged.
--
-- Run once in the Supabase SQL Editor, after auth0-migration.sql. Safe to run
-- again. Fresh installs don't need it: schema.sql, profile-editing.sql and
-- account-deletion.sql already contain these changes.

begin;

-- 1. The caller's folder in the image bucket.
--    Keep in sync with storageFolder() in validation.js.
create or replace function public.requesting_user_folder()
returns text
language sql
stable
set search_path = ''
as $$
  select replace(public.requesting_user_id(), '|', '_')
$$;

grant execute on function public.requesting_user_folder() to anon, authenticated;

-- 2. The three storage policies, now matching that folder.
drop policy if exists "Users can list their own images" on storage.objects;
create policy "Users can list their own images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'collectibles'
    and (storage.foldername(name))[1] = (select public.requesting_user_folder())
  );

drop policy if exists "Users can upload to their own folder" on storage.objects;
create policy "Users can upload to their own folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'collectibles'
    and (storage.foldername(name))[1] = (select public.requesting_user_folder())
  );

drop policy if exists "Users can delete their own collectible images" on storage.objects;
create policy "Users can delete their own collectible images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'collectibles'
    and (storage.foldername(name))[1] = (select public.requesting_user_folder())
  );

commit;
