-- Lunar direct OAuth account-continuity migration.
-- Apply in the project's Supabase SQL editor before enabling direct OAuth in Production.
-- This table holds only a direct-provider subject, provider name, and the existing
-- application account scope. It does not store provider access tokens or emails.

begin;

create table if not exists public.lunar_auth_identities (
  provider_subject text primary key,
  provider text not null check (provider in ('google', 'github', 'discord')),
  account_scope text not null check (account_scope ~ '^user_[A-Za-z0-9]+$'),
  linked_via text not null check (linked_via in ('legacy-clerk')),
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider_subject = provider || ':' || split_part(provider_subject, ':', 2))
);

create unique index if not exists lunar_auth_identities_provider_scope_key
  on public.lunar_auth_identities (provider, provider_subject);

alter table public.lunar_auth_identities enable row level security;

revoke all on table public.lunar_auth_identities from anon, authenticated;

drop policy if exists lunar_auth_identities_no_client_access on public.lunar_auth_identities;
create policy lunar_auth_identities_no_client_access
  on public.lunar_auth_identities
  for all
  using (false)
  with check (false);

commit;
