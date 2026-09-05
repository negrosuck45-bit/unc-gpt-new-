-- Optional Discord avatar decoration or custom transparent profile overlay.
alter table public.user_profiles
  add column if not exists avatar_decoration_url text;

alter table public.user_profiles
  drop constraint if exists user_profiles_avatar_decoration_url_length;

alter table public.user_profiles
  add constraint user_profiles_avatar_decoration_url_length
  check (avatar_decoration_url is null or char_length(avatar_decoration_url) <= 2048);
