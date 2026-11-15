-- Account deletion for Collectium.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Used by DELETE /api/auth/account (routes/auth.js).

-- 1. Let a signed-in user delete their own images in the "collectibles" bucket.
--    Uploads are stored at <user_id>/<collection_id>/<file>, so the first folder
--    must match the caller's id.
drop policy if exists "Users can delete their own collectible images" on storage.objects;
create policy "Users can delete their own collectible images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'collectibles'
    and (storage.foldername(name))[1] = (select public.requesting_user_id())
  );

-- 2. Delete the caller's rows, and their Supabase auth user if they have one,
--    in one transaction. SECURITY DEFINER is needed because the anon key cannot
--    delete from auth.users. The function only ever acts on the caller's own
--    id, so a user can only delete themselves. Auth0 users are not in
--    auth.users; the server removes them from Auth0 itself.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := public.requesting_user_id();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  delete from public.collection_items where user_id = uid;
  delete from public.collections where user_id = uid;
  delete from public.profiles where id = uid;
  -- Only Supabase Auth ids are UUIDs; skip the cast for Auth0 ids.
  if uid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    delete from auth.users where id = uid::uuid;
  end if;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
