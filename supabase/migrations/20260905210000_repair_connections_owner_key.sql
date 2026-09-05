-- Repair connections created with a UUID owner key.
-- Lunar uses provider-scoped account IDs (for example, google:123...), while
-- the application owns Supabase writes through a server-side service-role client.

begin;

-- Remove policies before changing the column type because their old UUID
-- comparisons depend on the previous type.
drop policy if exists "Owners can add their own connections" on public.connections;
drop policy if exists "Owners can update their own connections" on public.connections;
drop policy if exists "Owners can remove their own connections" on public.connections;

-- The original schema incorrectly required a Supabase auth.users UUID.
-- Converting retains existing UUID values and accepts the real Lunar account ID.
alter table public.connections
  drop constraint if exists connections_user_id_fkey;

alter table public.connections
  alter column user_id type text using user_id::text;

grant select, insert, update, delete on public.connections to anon, authenticated;

create policy "Owners can add their own connections"
  on public.connections
  for insert
  to authenticated
  with check (auth.uid()::text = user_id);

create policy "Owners can update their own connections"
  on public.connections
  for update
  to authenticated
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Owners can remove their own connections"
  on public.connections
  for delete
  to authenticated
  using (auth.uid()::text = user_id);

commit;
