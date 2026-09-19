-- Every table so far belonged to one person. This splits the data by
-- `user_id` (a Supabase Auth account) so each family member/friend who signs
-- in only ever sees what they synced.
--
-- `user_id` is added nullable rather than `not null`: this project already has
-- real rows with no account to attach them to yet. RLS below is written so a
-- null `user_id` matches nobody's `auth.uid()`, which makes "not claimed yet"
-- the same as "invisible" rather than a hole. After the existing owner signs
-- up, run `npm run claim-data -- <their email>` in backend/ to attach the
-- pre-existing rows to that account.
alter table public.activities
  add column user_id uuid references auth.users (id) on delete cascade;

alter table public.activity_streams
  add column user_id uuid references auth.users (id) on delete cascade;

alter table public.daily_metrics
  add column user_id uuid references auth.users (id) on delete cascade;

-- `garmin_activity_id` stays globally unique on both tables above: Garmin
-- assigns it from one global counter across every account, not per account,
-- so two different users' rows were never going to collide on it.
--
-- `daily_metrics` is different — two users can each have a Monday — so its
-- old primary key (`calendar_date` alone) has to go. A plain `unique`
-- constraint replaces it rather than a new primary key: a primary key column
-- can't be null, and the existing unclaimed rows still have a null user_id.
alter table public.daily_metrics
  drop constraint daily_metrics_pkey,
  add constraint daily_metrics_user_date_key unique (user_id, calendar_date);

drop policy "Public read access" on public.activities;
create policy "Users read their own activities" on public.activities
  for select
  using (auth.uid() = user_id);

drop policy "Public read access" on public.activity_streams;
create policy "Users read their own activity streams" on public.activity_streams
  for select
  using (auth.uid() = user_id);

drop policy "Public read access" on public.daily_metrics;
create policy "Users read their own daily metrics" on public.daily_metrics
  for select
  using (auth.uid() = user_id);

-- The anon key no longer reads anything: every viewer now signs in, so
-- there's no "logged out" reader left to serve.
revoke select on public.activities, public.activity_streams, public.daily_metrics from anon;

-- Wahoo's refresh token was a singleton (`id boolean primary key check (id)`
-- forced exactly one row). Each user who connects Wahoo now gets their own
-- row instead, keyed by account rather than by a fake boolean.
alter table public.wahoo_tokens
  drop constraint wahoo_tokens_pkey,
  drop column id,
  add column user_id uuid references auth.users (id) on delete cascade unique;

-- Where each user's Garmin login lives. Read only by the sync backend's
-- service role — not even the owning user's browser session reads this
-- table directly, so the encrypted password never has to leave the server.
create table public.garmin_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  -- AES-256-GCM ciphertext, base64: iv (12 bytes) + auth tag (16 bytes) +
  -- ciphertext. Encrypted by the backend (see `crypto.ts`) before it's ever
  -- written here, so a database dump alone doesn't hand out Garmin logins.
  encrypted_password text not null,
  updated_at timestamptz not null default now()
);

alter table public.garmin_credentials enable row level security;
grant all on public.garmin_credentials to service_role;
