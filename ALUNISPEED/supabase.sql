-- Uruchom w Supabase: SQL Editor -> New query -> Run.
create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);
create table if not exists public.saved_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  title text not null,
  url text not null,
  source text not null,
  created_at timestamptz not null default now()
);
alter table public.playlists enable row level security;
alter table public.saved_tracks enable row level security;
create policy "Users manage their own playlists" on public.playlists
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage their own saved tracks" on public.saved_tracks
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- To jest schemat startowy. Limit 15/dzień, Premium i jednorazowy kod
-- ALUNISTAR244 muszą być egzekwowane po stronie serwera (Edge Function),
-- a nie samym JavaScriptem w przeglądarce.
