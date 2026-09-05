-- Garmin returns far more per activity than the original schema kept. These are
-- the fields that come back in the activity *list* response we already fetch,
-- so recording them costs no extra requests.
--
-- All nullable: activities synced before this migration have them unset until
-- the backfill script refetches them, and Garmin itself omits several of these
-- for activities recorded without GPS or a heart-rate strap.
alter table public.activities
  -- Wall-clock time where the activity happened. `start_time` is UTC, and the
  -- frontend's hour-of-day chart currently reads it through the *browser's*
  -- timezone — which is right at home and wrong for anything logged abroad.
  add column start_time_local timestamp,
  add column timezone_id text,
  add column location_name text,
  -- Garmin's `duration` (already stored as duration_s) is the timer duration;
  -- elapsed includes time the timer was paused.
  add column elapsed_duration_s integer,
  add column elevation_gain_m double precision,
  add column elevation_loss_m double precision,
  add column min_elevation_m double precision,
  add column max_elevation_m double precision,
  add column max_speed_mps double precision,
  add column max_hr double precision,
  add column calories double precision,
  add column steps integer,
  add column avg_cadence_spm double precision,
  add column max_cadence_spm double precision,
  add column avg_stride_length_cm double precision,
  add column moderate_intensity_min integer,
  add column vigorous_intensity_min integer,
  -- Seconds spent in heart-rate zones 1..5, in order.
  add column hr_time_in_zone_s double precision[],
  add column start_lat double precision,
  add column start_lng double precision,
  add column end_lat double precision,
  add column end_lng double precision;

-- Per-point sensor streams, kept out of `activities` on purpose: the frontend
-- selects every column of that table to draw the map and the history list, and
-- inlining ~167k points' worth of streams would triple what every page load
-- downloads for data only the statistics tab reads.
--
-- Stored as parallel arrays rather than an array of objects — one entry per
-- point, index-aligned with `activities.points` — because the columnar layout
-- avoids repeating a key name per sample and keeps the whole set a few MB.
create table public.activity_streams (
  activity_id uuid primary key references public.activities (id) on delete cascade,
  garmin_activity_id bigint not null unique,
  -- Seconds since the activity started, not absolute timestamps: the offsets
  -- are 3-4 digits where epoch milliseconds would be 13, and start_time on the
  -- parent row already carries the absolute reference.
  t_s integer[] not null,
  -- Cumulative distance from the start, whole metres.
  distance_m integer[] not null,
  speed_mps real[] not null,
  -- Null where the sensor reported nothing for that sample; Postgres arrays
  -- hold nulls, so the index alignment survives gaps in any single stream.
  hr_bpm smallint[],
  elevation_m real[],
  cadence_spm smallint[],
  created_at timestamptz not null default now()
);

create index activity_streams_garmin_id_idx on public.activity_streams (garmin_activity_id);

alter table public.activity_streams enable row level security;

-- Same split as `activities`: the frontend reads with the anon key, and only
-- the sync backend's service role writes.
create policy "Public read access" on public.activity_streams
  for select
  using (true);

grant select on public.activity_streams to anon, authenticated;
grant all on public.activity_streams to service_role;
