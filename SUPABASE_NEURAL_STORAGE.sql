-- Run after the existing Supabase setup. Auth0 remains the identity provider;
-- user_id stores the Auth0 subject (for example, auth0|... or google-oauth2|...).

insert into storage.buckets (id, name, public)
values ('chat-uploads', 'chat-uploads', true)
on conflict (id) do update set public = true;

create table if not exists public.chat_attachments (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  chat_id text,
  file_name text not null,
  file_path text not null unique,
  public_url text not null,
  mime_type text not null,
  file_size bigint not null,
  vision_summary text,
  created_at timestamptz default now()
);

create index if not exists chat_attachments_user_id_idx on public.chat_attachments(user_id);
create index if not exists chat_attachments_chat_id_idx on public.chat_attachments(chat_id);

create table if not exists public.neural_memories (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  project_id text,
  chat_id text,
  content text not null,
  memory_type text not null default 'conversation',
  source text not null default 'auto-summary',
  importance real not null default 0.5,
  access_count integer not null default 0,
  tags text[] default '{}',
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz default now(),
  last_accessed_at timestamptz default now()
);

create index if not exists neural_memories_user_idx on public.neural_memories(user_id);
create index if not exists neural_memories_project_idx on public.neural_memories(user_id, project_id);
create index if not exists neural_memories_tags_idx on public.neural_memories using gin(tags);

alter table public.chat_attachments enable row level security;
alter table public.neural_memories enable row level security;

-- The application writes through the server with the service-role key, so these
-- policies are intentionally restrictive. Public bucket reads are needed for
-- model vision URLs; the metadata itself remains server-owned.
drop policy if exists chat_attachments_no_client_access on public.chat_attachments;
create policy chat_attachments_no_client_access on public.chat_attachments
  for all using (false) with check (false);

drop policy if exists neural_memories_no_client_access on public.neural_memories;
create policy neural_memories_no_client_access on public.neural_memories
  for all using (false) with check (false);

-- Existing broad storage policies can remain for compatibility with the current
-- client fallback. New uploads are namespaced under users/<Auth0 subject>/images.
drop policy if exists chat_uploads_public_read on storage.objects;
create policy chat_uploads_public_read on storage.objects
  for select using (bucket_id = 'chat-uploads');

drop policy if exists chat_uploads_anon_insert on storage.objects;
create policy chat_uploads_anon_insert on storage.objects
  for insert with check (bucket_id = 'chat-uploads');
