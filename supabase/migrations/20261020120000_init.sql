-- Spotty: Grundschema
-- Alle fachlichen Tabellen sind nur für eingetragene Mitglieder lesbar und schreibbar (Row Level Security).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Mitglieder und Rollen
-- ---------------------------------------------------------------------------
create table if not exists public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.members m where m.user_id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.members m where m.user_id = auth.uid() and m.role = 'admin');
$$;

revoke all on function public.is_member() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_member() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Setzt updated_at und updated_by bei jeder Änderung.
create or replace function public.touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stammdaten des Patienten (eine Zeile)
-- ---------------------------------------------------------------------------
create table if not exists public.profile (
  id smallint primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- ---------------------------------------------------------------------------
-- Behandlungspläne: Medikamente, Inhalation, Mahlzeiten, Messungen
-- ---------------------------------------------------------------------------
create table if not exists public.regimens (
  id text primary key,
  name text not null,
  category text not null check (category in ('med', 'inh', 'feed', 'mess', 'foto', 'care')),
  purpose text,
  instructions text,
  unit text,
  measure text check (measure is null or measure in ('atem', 'spo2', 'gewicht')),
  slots jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  notify boolean not null default true,
  sort integer not null default 0,
  stock numeric,
  stock_at timestamptz,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- ---------------------------------------------------------------------------
-- Tagesablauf: abgehakte Punkte
-- ---------------------------------------------------------------------------
create table if not exists public.checks (
  day date not null,
  slot text not null,
  time text not null check (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (day, slot)
);

-- ---------------------------------------------------------------------------
-- Protokoll: Einzeleinträge
-- ---------------------------------------------------------------------------
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  time text not null check (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  type text not null check (type in ('atem', 'spo2', 'gewicht', 'trinken', 'futter', 'kot', 'urin', 'gassi', 'erbrechen', 'husten', 'med', 'notiz')),
  data jsonb not null default '{}'::jsonb,
  slot text,
  ack boolean not null default false,
  source text not null default 'app',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
create index if not exists entries_day_idx on public.entries (day);

-- Tagesnotizen, Nacht, Summen vom Papierprotokoll
create table if not exists public.days (
  day date primary key,
  nacht text,
  paper_ml integer,
  paper_g integer,
  note text,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

-- Fotos der Papierprotokolle
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  time text not null,
  path text not null,
  width integer,
  height integer,
  bytes integer,
  note text,
  extraction jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists photos_day_idx on public.photos (day);

-- ---------------------------------------------------------------------------
-- Akte: Dokumente, Laborwerte, Chronologie, Fragen an die Klinik
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id text primary key,
  title text not null,
  doc_date date,
  issuer text,
  kind text not null default 'befund',
  summary text,
  findings jsonb not null default '[]'::jsonb,
  files jsonb not null default '[]'::jsonb,
  status text not null default 'ok' check (status in ('ok', 'original_fehlt', 'ausstehend')),
  source text not null default 'app',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  document_id text references public.documents (id) on delete cascade,
  date date not null,
  grp text,
  param text not null,
  code text,
  value numeric,
  value_text text,
  unit text,
  ref_low numeric,
  ref_high numeric,
  flag text check (flag is null or flag in ('H', 'L')),
  device text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists labs_code_idx on public.labs (code, date);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time text,
  title text not null,
  text text,
  category text not null default 'verlauf',
  document_id text references public.documents (id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists events_date_idx on public.events (date);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  sort integer not null default 0,
  status text not null default 'offen' check (status in ('offen', 'geklaert')),
  answer text,
  answered_by uuid,
  answered_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Claude-Gespräche (privat je Person)
-- ---------------------------------------------------------------------------
create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  thread uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists assistant_messages_user_idx on public.assistant_messages (user_id, thread, created_at);

-- ---------------------------------------------------------------------------
-- Push-Erinnerungen
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  prefs jsonb not null default '{"med": true, "inh": true, "mess": true, "foto": true, "feed": false, "overdue": true}'::jsonb,
  device text,
  created_at timestamptz not null default now(),
  last_ok timestamptz,
  fail_count integer not null default 0
);

create table if not exists public.push_log (
  day date not null,
  slot text not null,
  kind text not null,
  user_id uuid not null,
  sent_at timestamptz not null default now(),
  primary key (day, slot, kind, user_id)
);

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
drop trigger if exists touch_entries on public.entries;
create trigger touch_entries before update on public.entries for each row execute function public.touch_row();
drop trigger if exists touch_days on public.days;
create trigger touch_days before update on public.days for each row execute function public.touch_row();
drop trigger if exists touch_regimens on public.regimens;
create trigger touch_regimens before update on public.regimens for each row execute function public.touch_row();
drop trigger if exists touch_documents on public.documents;
create trigger touch_documents before update on public.documents for each row execute function public.touch_row();
drop trigger if exists touch_profile on public.profile;
create trigger touch_profile before update on public.profile for each row execute function public.touch_row();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['profile', 'regimens', 'checks', 'entries', 'days', 'photos', 'documents', 'labs', 'events', 'questions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Mitglieder lesen" on public.%I', t);
    execute format('drop policy if exists "Mitglieder schreiben" on public.%I', t);
    execute format('drop policy if exists "Mitglieder ändern" on public.%I', t);
    execute format('drop policy if exists "Mitglieder löschen" on public.%I', t);
    execute format('create policy "Mitglieder lesen" on public.%I for select to authenticated using (public.is_member())', t);
    execute format('create policy "Mitglieder schreiben" on public.%I for insert to authenticated with check (public.is_member())', t);
    execute format('create policy "Mitglieder ändern" on public.%I for update to authenticated using (public.is_member()) with check (public.is_member())', t);
    execute format('create policy "Mitglieder löschen" on public.%I for delete to authenticated using (public.is_member())', t);
  end loop;
end
$$;

alter table public.members enable row level security;
drop policy if exists "Mitglieder sehen Mitglieder" on public.members;
create policy "Mitglieder sehen Mitglieder" on public.members for select to authenticated using (public.is_member());
drop policy if exists "Admins verwalten Mitglieder" on public.members;
create policy "Admins verwalten Mitglieder" on public.members for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.assistant_messages enable row level security;
drop policy if exists "Eigene Gespräche" on public.assistant_messages;
create policy "Eigene Gespräche" on public.assistant_messages for all to authenticated
  using (user_id = auth.uid() and public.is_member())
  with check (user_id = auth.uid() and public.is_member());

alter table public.push_subscriptions enable row level security;
drop policy if exists "Eigene Push-Abos" on public.push_subscriptions;
create policy "Eigene Push-Abos" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid() and public.is_member())
  with check (user_id = auth.uid() and public.is_member());

alter table public.push_log enable row level security;
-- push_log: nur serverseitig (kein Zugriff aus der App)

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['profile', 'regimens', 'checks', 'entries', 'days', 'photos', 'documents', 'labs', 'events', 'questions', 'members']
  loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Dateiablage: Protokollfotos und Dokumente (privat)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('photos', 'photos', false, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('documents', 'documents', false, 52428800, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'text/plain'])
on conflict (id) do nothing;

drop policy if exists "Spotty Dateien lesen" on storage.objects;
create policy "Spotty Dateien lesen" on storage.objects for select to authenticated
  using (bucket_id in ('photos', 'documents') and public.is_member());
drop policy if exists "Spotty Dateien hochladen" on storage.objects;
create policy "Spotty Dateien hochladen" on storage.objects for insert to authenticated
  with check (bucket_id in ('photos', 'documents') and public.is_member());
drop policy if exists "Spotty Dateien ändern" on storage.objects;
create policy "Spotty Dateien ändern" on storage.objects for update to authenticated
  using (bucket_id in ('photos', 'documents') and public.is_member())
  with check (bucket_id in ('photos', 'documents') and public.is_member());
drop policy if exists "Spotty Dateien löschen" on storage.objects;
create policy "Spotty Dateien löschen" on storage.objects for delete to authenticated
  using (bucket_id in ('photos', 'documents') and public.is_member());

-- ---------------------------------------------------------------------------
-- Private Konfiguration für den Zeitplan (nicht über die API erreichbar)
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
create table if not exists private.config (
  key text primary key,
  value text not null
);
revoke all on private.config from public;

-- ---------------------------------------------------------------------------
-- Rechte für die API-Rollen (Zugriffsregeln oben begrenzen sie auf Mitglieder)
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
revoke all on public.push_log from authenticated;
