-- Public profile social connections for Lunar.
-- Run through Supabase migrations so ownership and RLS remain enforced at the database layer.

create extension if not exists pgcrypto;

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  -- Lunar accounts are provider-scoped strings such as "google:123...".
  -- They are deliberately not Supabase auth.users UUIDs.
  user_id text not null,
  platform text not null check (platform in ('discord', 'x', 'instagram', 'tiktok', 'github', 'youtube', 'spotify', 'website')),
  mode text not null check (mode in ('username', 'link')),
  value text not null check (char_length(trim(value)) between 1 and 512),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  constraint connections_platform_mode_check check (
    (platform in ('discord', 'x', 'instagram', 'tiktok', 'github') and mode = 'username')
    or (platform in ('youtube', 'spotify', 'website') and mode = 'link')
  ),
  constraint connections_user_platform_value_key unique (user_id, platform, value)
);

create index if not exists connections_user_position_idx
  on public.connections (user_id, position, created_at);

alter table public.connections enable row level security;

grant select, insert, update, delete on public.connections to anon, authenticated;

drop policy if exists "Anyone can read public profile connections" on public.connections;
create policy "Anyone can read public profile connections"
  on public.connections
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Owners can add their own connections" on public.connections;
create policy "Owners can add their own connections"
  on public.connections
  for insert
  to authenticated
  with check (auth.uid()::text = user_id);

drop policy if exists "Owners can update their own connections" on public.connections;
create policy "Owners can update their own connections"
  on public.connections
  for update
  to authenticated
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "Owners can remove their own connections" on public.connections;
create policy "Owners can remove their own connections"
  on public.connections
  for delete
  to authenticated
  using (auth.uid()::text = user_id);
