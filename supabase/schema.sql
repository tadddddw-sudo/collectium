-- Base schema for Collectium: tables, signup trigger, Row Level Security and
-- the image bucket.
-- Run this FIRST in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Then run supabase/profile-editing.sql and supabase/account-deletion.sql.
-- Safe to run again: tables are only created if missing, and policies,
-- the trigger and the bucket settings are replaced with the versions below.

-- 0. Who is calling? ----------------------------------------------------------
-- User ids are TEXT: the `sub` claim of the caller's token. Supabase Auth
-- tokens carry a UUID there, Auth0 tokens carry something like 'auth0|abc123'
-- or 'google-oauth2|123'. auth.uid() would fail on the second kind (it casts
-- to uuid), so every policy uses this function instead.
create or replace function public.requesting_user_id()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

grant execute on function public.requesting_user_id() to anon, authenticated;

-- 1. Tables ------------------------------------------------------------------

-- One row per user. Supabase Auth users get theirs from the trigger in
-- section 2; Auth0 users get theirs from the server on first sign-in.
-- No foreign key to auth.users: Auth0 users are not in that table.
create table if not exists public.profiles (
  id text primary key,
  username text not null unique,
  display_name text,
  bio text,
  avatar_url text,
  banner_url text,
  featured_collection_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Binders and display cases. user_id points at profiles (not auth.users) so
-- the API can embed profiles(username, display_name) in one query.
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null default '',
  type text not null check (type in ('binder', 'display_case')),
  layout_config jsonb not null default '{}'::jsonb,
  is_public boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists collections_user_id_idx on public.collections (user_id);

-- The cards/figures inside a collection.
create table if not exists public.collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  user_id text not null references public.profiles (id) on delete cascade,
  name text not null default 'Untitled Item',
  description text not null default '',
  image_url text not null,
  page_number integer not null default 1,
  slot_index integer,
  position_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists collection_items_collection_id_idx
  on public.collection_items (collection_id);
create index if not exists collection_items_user_id_idx
  on public.collection_items (user_id);

-- The API only uses the anon key, so these roles need table access.
-- Row Level Security below decides which rows they can touch.
grant select on public.profiles, public.collections, public.collection_items
  to anon, authenticated;
grant update, insert on public.profiles to authenticated;
grant insert, update, delete on public.collections, public.collection_items
  to authenticated;

-- 2. Signup trigger (Supabase Auth users only) --------------------------------
-- POST /api/auth/signup passes the handle as user metadata ("username").
-- This copies it into public.profiles when Supabase creates the auth user.
-- Users added from the dashboard have no username, so they get user_<id>.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Row Level Security --------------------------------------------------------
-- Profile policies are in supabase/profile-editing.sql. Profiles get no
-- delete policy: delete_my_account() removes them.
alter table public.profiles enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;

-- Collections: anyone sees public ones, owners also see their private ones.
drop policy if exists "Collections are visible if public or owned" on public.collections;
create policy "Collections are visible if public or owned"
  on public.collections
  for select
  to anon, authenticated
  using (is_public or user_id = (select public.requesting_user_id()));

drop policy if exists "Users can create their own collections" on public.collections;
create policy "Users can create their own collections"
  on public.collections
  for insert
  to authenticated
  with check (user_id = (select public.requesting_user_id()));

drop policy if exists "Users can update their own collections" on public.collections;
create policy "Users can update their own collections"
  on public.collections
  for update
  to authenticated
  using (user_id = (select public.requesting_user_id()))
  with check (user_id = (select public.requesting_user_id()));

drop policy if exists "Users can delete their own collections" on public.collections;
create policy "Users can delete their own collections"
  on public.collections
  for delete
  to authenticated
  using (user_id = (select public.requesting_user_id()));

-- Items: visible when their collection is visible; only the owner of the
-- collection can add, edit or delete them.
drop policy if exists "Items are visible with their collection" on public.collection_items;
create policy "Items are visible with their collection"
  on public.collection_items
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_id
        and (c.is_public or c.user_id = (select public.requesting_user_id()))
    )
  );

drop policy if exists "Users can add items to their own collections" on public.collection_items;
create policy "Users can add items to their own collections"
  on public.collection_items
  for insert
  to authenticated
  with check (
    user_id = (select public.requesting_user_id())
    and exists (
      select 1 from public.collections c
      where c.id = collection_id and c.user_id = (select public.requesting_user_id())
    )
  );

drop policy if exists "Users can update their own items" on public.collection_items;
create policy "Users can update their own items"
  on public.collection_items
  for update
  to authenticated
  using (user_id = (select public.requesting_user_id()))
  with check (
    user_id = (select public.requesting_user_id())
    and exists (
      select 1 from public.collections c
      where c.id = collection_id and c.user_id = (select public.requesting_user_id())
    )
  );

drop policy if exists "Users can delete their own items" on public.collection_items;
create policy "Users can delete their own items"
  on public.collection_items
  for delete
  to authenticated
  using (user_id = (select public.requesting_user_id()));

-- 4. Image storage -------------------------------------------------------------
-- Public bucket: the app shows images through public URLs. Uploads are
-- limited to 5 MB of PNG, WebP or JPEG, matching the server's checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'collectibles', 'collectibles', true, 5242880,
  array['image/png', 'image/webp', 'image/jpeg']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Users can list their own folder. Account deletion lists and removes a
-- user's files, and removing needs this. Public URLs work without it.
-- Upload and delete policies are in profile-editing.sql and account-deletion.sql.
drop policy if exists "Users can list their own images" on storage.objects;
create policy "Users can list their own images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'collectibles'
    and (storage.foldername(name))[1] = (select public.requesting_user_id())
  );

-- 5. Let PostgREST see the changes straight away.
notify pgrst, 'reload schema';
