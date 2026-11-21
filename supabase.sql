-- ALUNISPEED OWNER + shared playlists
-- Run once in Supabase SQL Editor. Uses RLS; the frontend role badge is not the security boundary.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);

-- Backward compatibility with the earlier ALUNISPEED schema, which used playlists.user_id.
alter table public.playlists add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.playlists add column if not exists user_id uuid references auth.users(id) on delete cascade;
update public.playlists set owner_id = user_id where owner_id is null and user_id is not null;

create table if not exists public.playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  title text not null,
  object_path text not null unique,
  mime_type text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.playlist_shares (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  shared_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (playlist_id, recipient_user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  playlist_id uuid references public.playlists(id) on delete cascade,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.user_playlist_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  bass_percent integer not null default 0 check (bass_percent between 0 and 250),
  primary key (user_id, playlist_id)
);

create table if not exists public.user_track_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  playlist_item_id uuid not null references public.playlist_items(id) on delete cascade,
  bass_percent integer not null default 0 check (bass_percent between 0 and 250),
  primary key (user_id, playlist_item_id)
);

alter table public.profiles enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;
alter table public.playlist_shares enable row level security;
alter table public.notifications enable row level security;
alter table public.user_playlist_settings enable row level security;
alter table public.user_track_settings enable row level security;

-- Profiles: users can register/update their own email row; only OWNER can look up recipients.
drop policy if exists "profile self insert" on public.profiles;
create policy "profile self insert" on public.profiles for insert to authenticated with check (id = auth.uid() and email = auth.jwt()->>'email');
drop policy if exists "profile self update" on public.profiles;
create policy "profile self update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and email = auth.jwt()->>'email');
drop policy if exists "owner reads profiles" on public.profiles;
create policy "owner reads profiles" on public.profiles for select to authenticated using (lower(auth.jwt()->>'email') = 'alunisigma@gmail.com' or id = auth.uid());

-- Playlist owner and recipient can view a playlist; only its creator can edit it.
drop policy if exists "playlist visible to owner or recipient" on public.playlists;
create policy "playlist visible to owner or recipient" on public.playlists for select to authenticated using (
  owner_id = auth.uid() or exists (select 1 from public.playlist_shares s where s.playlist_id = id and s.recipient_user_id = auth.uid())
);
drop policy if exists "user creates own playlists" on public.playlists;
create policy "user creates own playlists" on public.playlists for insert to authenticated with check (owner_id = auth.uid() and (user_id is null or user_id = auth.uid()));
drop policy if exists "creator updates own playlists" on public.playlists;
create policy "creator updates own playlists" on public.playlists for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "creator deletes own playlists" on public.playlists;
create policy "creator deletes own playlists" on public.playlists for delete to authenticated using (owner_id = auth.uid());

-- Playlist items: creator can add; creator and recipient can read.
drop policy if exists "playlist items visible to owner or recipient" on public.playlist_items;
create policy "playlist items visible to owner or recipient" on public.playlist_items for select to authenticated using (
 exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid())
 or exists (select 1 from public.playlist_shares s where s.playlist_id = playlist_id and s.recipient_user_id = auth.uid())
);
drop policy if exists "creator manages playlist items" on public.playlist_items;
create policy "creator manages playlist items" on public.playlist_items for all to authenticated using (
 exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid())
) with check (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid()));

-- Only OWNER can share playlists and create recipient notifications.
drop policy if exists "owner creates playlist shares" on public.playlist_shares;
create policy "owner creates playlist shares" on public.playlist_shares for insert to authenticated with check (
 lower(auth.jwt()->>'email') = 'alunisigma@gmail.com' and shared_by = auth.uid()
 and exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid())
);
drop policy if exists "recipient or owner reads shares" on public.playlist_shares;
create policy "recipient or owner reads shares" on public.playlist_shares for select to authenticated using (
 recipient_user_id = auth.uid() or lower(auth.jwt()->>'email') = 'alunisigma@gmail.com'
);
drop policy if exists "recipient reads own notifications" on public.notifications;
create policy "recipient reads own notifications" on public.notifications for select to authenticated using (recipient_user_id = auth.uid());
drop policy if exists "recipient marks own notifications" on public.notifications;
create policy "recipient marks own notifications" on public.notifications for update to authenticated using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());
drop policy if exists "owner sends notifications" on public.notifications;
create policy "owner sends notifications" on public.notifications for insert to authenticated with check (
 lower(auth.jwt()->>'email') = 'alunisigma@gmail.com'
 and exists (select 1 from public.playlist_shares s where s.playlist_id = notifications.playlist_id and s.recipient_user_id = recipient_user_id)
);

-- Per-user bass preferences for their own received/owned playlists and tracks.
drop policy if exists "users manage own playlist bass" on public.user_playlist_settings;
create policy "users manage own playlist bass" on public.user_playlist_settings for all to authenticated using (user_id = auth.uid()) with check (
 user_id = auth.uid() and exists (select 1 from public.playlists p where p.id = playlist_id and (p.owner_id = auth.uid() or exists (select 1 from public.playlist_shares s where s.playlist_id = p.id and s.recipient_user_id = auth.uid())))
);
drop policy if exists "users manage own track bass" on public.user_track_settings;
create policy "users manage own track bass" on public.user_track_settings for all to authenticated using (user_id = auth.uid()) with check (
 user_id = auth.uid() and exists (select 1 from public.playlist_items i join public.playlists p on p.id = i.playlist_id where i.id = playlist_item_id and (p.owner_id = auth.uid() or exists (select 1 from public.playlist_shares s where s.playlist_id = p.id and s.recipient_user_id = auth.uid())))
);

-- Private bucket for audio. Files are never public; the app creates temporary signed URLs after RLS checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('music', 'music', false, 52428800, array['audio/mpeg','audio/mp3','audio/wav','audio/ogg','audio/mp4','audio/aac','audio/flac','audio/webm','application/octet-stream'])
on conflict (id) do update set public = false;

drop policy if exists "owner uploads playlist audio" on storage.objects;
create policy "owner uploads playlist audio" on storage.objects for insert to authenticated with check (
 bucket_id = 'music' and lower(auth.jwt()->>'email') = 'alunisigma@gmail.com'
 and exists (select 1 from public.playlists p where p.id::text = split_part(name, '/', 1) and p.owner_id = auth.uid())
);
drop policy if exists "playlist recipients read audio" on storage.objects;
create policy "playlist recipients read audio" on storage.objects for select to authenticated using (
 bucket_id = 'music' and exists (
   select 1 from public.playlist_items i join public.playlists p on p.id = i.playlist_id
   where i.object_path = name and (p.owner_id = auth.uid() or exists (select 1 from public.playlist_shares s where s.playlist_id = p.id and s.recipient_user_id = auth.uid()))
 )
);
drop policy if exists "owner deletes playlist audio" on storage.objects;
create policy "owner deletes playlist audio" on storage.objects for delete to authenticated using (
 bucket_id = 'music' and lower(auth.jwt()->>'email') = 'alunisigma@gmail.com'
 and exists (select 1 from public.playlists p where p.id::text = split_part(name, '/', 1) and p.owner_id = auth.uid())
);


-- Enable live sidebar notifications through Supabase Realtime (safe to rerun).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
