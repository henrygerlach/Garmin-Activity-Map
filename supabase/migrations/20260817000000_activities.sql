-- Activities synced from Garmin Connect (walks and bike rides).
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  garmin_activity_id bigint not null unique,
  name text not null,
  type text not null check (type in ('walk', 'bike')),
  start_time timestamptz not null,
  distance_m double precision not null,
  duration_s integer not null,
  moving_duration_s integer not null,
  avg_speed_mps double precision,
  avg_hr double precision,
  -- Simplified GPS track: [[lat, lng], [lat, lng], ...]
  points jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index activities_start_time_idx on public.activities (start_time desc);

alter table public.activities enable row level security;

-- Frontend reads with the anon key; only the sync backend (service role key,
-- which bypasses RLS) is allowed to write.
create policy "Public read access" on public.activities
  for select
  using (true);

-- RLS policies only take effect once the role also has the underlying
-- table-level privilege; Supabase does not grant this automatically for
-- tables created outside the dashboard.
grant select on public.activities to anon, authenticated;
grant all on public.activities to service_role;
