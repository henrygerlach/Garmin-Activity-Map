-- Day-level wellness figures from Garmin's stats endpoints, one row per
-- calendar day. Deliberately not derived from `activities`: the step count
-- here is Garmin's all-day total, which includes everything walked outside a
-- recorded activity, and resting heart rate and HRV are measured overnight and
-- have no activity to hang off at all.
--
-- Keyed by the calendar date as a bare `date` — these are wall-clock days on
-- the watch, not instants, so a timestamp would invite a timezone shift.
create table public.daily_metrics (
  calendar_date date primary key,
  -- All nullable: Garmin has step counts from long before it had HRV, and a
  -- night without the watch leaves the overnight metrics unrecorded.
  total_steps integer,
  resting_hr smallint,
  -- Overnight average HRV, milliseconds.
  hrv_last_night_avg smallint,
  created_at timestamptz not null default now()
);

alter table public.daily_metrics enable row level security;

-- Same split as the other tables: the frontend reads with the anon key, and
-- only the sync backend's service role writes.
create policy "Public read access" on public.daily_metrics
  for select
  using (true);

grant select on public.daily_metrics to anon, authenticated;
grant all on public.daily_metrics to service_role;
