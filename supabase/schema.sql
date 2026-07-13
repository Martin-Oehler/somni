-- Somni database schema.
-- Run once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
--
-- Manual dashboard steps that go with this script:
--   1. Authentication -> Sign In / Up -> disable "Allow new users to sign up"
--   2. Authentication -> Users -> create exactly two users (email + password)

-- ============================================================
-- Tables
-- ============================================================
create table if not exists public.sessions (
  id uuid primary key,
  start_ts timestamptz not null,
  end_ts timestamptz,                       -- null = actively sleeping
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                    -- tombstone; soft delete
);

create table if not exists public.feedings (
  id uuid primary key,
  ts timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Single shared row of app settings (targetNapMins, cycleTimeMins, dayStart).
create table if not exists public.shared_settings (
  id int primary key check (id = 1),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists sessions_start_idx on public.sessions (start_ts);
create index if not exists feedings_ts_idx on public.feedings (ts);

-- ============================================================
-- updated_at maintained server-side (last-write-wins clock)
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sessions_updated_at on public.sessions;
create trigger sessions_updated_at before insert or update on public.sessions
  for each row execute function public.set_updated_at();

drop trigger if exists feedings_updated_at on public.feedings;
create trigger feedings_updated_at before insert or update on public.feedings
  for each row execute function public.set_updated_at();

drop trigger if exists shared_settings_updated_at on public.shared_settings;
create trigger shared_settings_updated_at before insert or update on public.shared_settings
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security: any authenticated user (signups are closed,
-- so "authenticated" = the two household accounts), nobody else.
-- ============================================================
alter table public.sessions enable row level security;
alter table public.feedings enable row level security;
alter table public.shared_settings enable row level security;

drop policy if exists "authenticated only" on public.sessions;
create policy "authenticated only" on public.sessions
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated only" on public.feedings;
create policy "authenticated only" on public.feedings
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated only" on public.shared_settings;
create policy "authenticated only" on public.shared_settings
  for all to authenticated using (true) with check (true);

-- ============================================================
-- Realtime: broadcast row changes to the other device
-- ============================================================
alter publication supabase_realtime add table public.sessions;
alter publication supabase_realtime add table public.feedings;
alter publication supabase_realtime add table public.shared_settings;
