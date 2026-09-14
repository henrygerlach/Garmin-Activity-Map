-- Power-meter figures, which Garmin never sees: the meter pairs to the phone,
-- so the Wahoo app records watts for the same outing the watch records GPS for.
-- Both devices run in parallel, so these are not new activities — they are
-- extra columns on the Garmin row the sync matches them to (see `wahoo.ts`).
--
-- Summary figures only. Wahoo's workout JSON carries averages and nothing
-- per-second; the sample-level power lives inside a FIT file we don't download.
alter table public.activities
  -- The Wahoo workout this row's power came from. Unique so a workout can only
  -- ever claim one activity, which makes a re-run of the matcher idempotent.
  add column wahoo_workout_id bigint unique,
  add column avg_power_w double precision,
  -- Wahoo's `power_bike_np_last`: normalised power, the intensity a steady
  -- effort would have had to be to cost what this variable one did.
  add column norm_power_w double precision,
  -- Wahoo's `power_bike_tss_last`: training stress score, unitless.
  add column tss double precision,
  -- Total work, kilojoules (Wahoo reports joules).
  add column work_kj double precision,
  -- Crank revolutions per minute. Deliberately not folded into the existing
  -- `avg_cadence_spm`, which is the watch's steps per minute — same word, and
  -- for a run both are recorded, but they are not the same measurement.
  add column avg_cadence_rpm double precision;

-- Wahoo rotates refresh tokens: every refresh returns a new one and retires
-- the old as soon as the new access token is used. That makes the token state,
-- not configuration, so it cannot live in .env — a deployed backend has no
-- writable .env to put the rotated value back into.
--
-- One row, forced by a primary key that can only hold `true`.
create table public.wahoo_tokens (
  id boolean primary key default true check (id),
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.wahoo_tokens enable row level security;

-- No public read policy and no anon grant, unlike every other table here: this
-- one holds a credential, and the frontend has no business reading it.
grant all on public.wahoo_tokens to service_role;
