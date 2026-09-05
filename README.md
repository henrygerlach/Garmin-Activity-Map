# Garmin Activity Map

A webapp that maps every walk and bike ride I've logged on Garmin, and turns the history into
a set of stats about how much I move, when, and how that's changed over time.

## Features

* **Map**
    * Blue paths for walks, purple for bike rides. Hovering a line (on the map or in the table)
      shows its Date, Distance, Speed ("in Bewegung" — moving speed, excluding time stopped),
      and Avg. HR, and lifts it above the rest in a lighter tint so it stands out among hundreds
      of overlapping tracks.
    * The hover tooltip also says how often I've been at that particular point of the track —
      how many of the currently shown activities pass within ~25 m of it.
    * Filter by activity type (All / Walk / Bike) and date range (All time / last 30 / 90 days /
      12 months).
    * Heatmap mode swaps the individual paths for a density heatmap of where I've spent the most
      time.
    * **Time-lapse mode** replays the history: a scrubber steps day by day through whatever the
      filters leave visible, drawing tracks as they were logged and keeping everything drawn so
      far, so the map fills in from nothing. A readout counts the activities and distance revealed
      so far. Switching it on rewinds to the first day but doesn't start playing — it waits for the
      play button, so ticking the box never yanks the map away from whatever was being looked at,
      and a date can be scrubbed to directly instead. Playback speed is adjustable (0.25× / 0.5× /
      1× / 2×, changeable mid-run), where 1× puts a year of logging past in about twenty seconds.
      It starts at half speed, because at full speed a walk somewhere new can go by between
      glances.
    * Changing a filter mid-run holds the day you were on rather than jumping: the cursor is a
      date, not a position in the day list, so it still means the same thing after the range is
      rebuilt — and where that date falls outside a narrower range it parks on the nearest end,
      then returns to where it was when the filter is widened again. Scrubbing works the same in
      both directions; the camera re-aims when the frame no longer fits what's drawn *and* when it
      has grown far wider than it, so going back in time zooms in again instead of leaving a few
      early tracks as a speck in a frame sized for a whole year.
    * The camera follows the day being drawn. It frames that day's last track together with
      everything already drawn within about 25 km of it — a radius set well above the span of a
      city's walking routes and well below the distance to the next city. So a new walk in a city
      already full of lines shows the whole city, while a trip somewhere else moves the camera
      there at the same scale, instead of pulling back until both cities are too small to read.
      It aims at rather more than that cluster, so the cluster has to grow appreciably before the
      camera re-aims: across a full year of walking that comes to a handful of moves rather than
      one a day. The reveal pauses while the camera moves and holds for a beat after it lands
      before drawing resumes, so tracks are never drawn across a panning map and arriving somewhere
      new gives a moment to take in where "here" is.
* **History table**, in a sidebar next to the map, listing every logged activity with its date,
  distance, moving time, speed, and average HR. Columns are sortable, and clicking a row pans the
  map to that activity and highlights it (jumping to the Map tab if needed).
* **Statistics tab**
    * At-a-glance tiles: total activities, total distance, total time moving, current streak,
      longest walk, longest bike ride, average heart rate, metres per heartbeat, total climb,
      total steps and total calories.
    * A GitHub-style calendar heatmap of daily activity.
    * Weekly walking and cycling distance across the full logging history.
    * Speed and heart-rate progression over time (walk vs. bike), so I can see whether I'm
      actually getting faster — with GPS-glitch outliers (e.g. walking indoors) automatically
      excluded from the weekly averages.
    * **Efficiency progression** — weekly metres travelled per heartbeat (distance ÷ beats spent
      moving). Rising means more ground for the same cardiac work.
    * **Heart rate against pace** — every sensor sample binned by the pace it was recorded at, with
      the average heart rate in each bin drawn as one line per quarter. A line sitting lower than an
      earlier one means that pace now costs fewer beats per minute, which is the like-for-like
      version of "am I getting fitter" that a plain speed or heart-rate average can't give. The
      first five minutes of each activity are dropped, because heart rate lags pace at the start
      and those samples would drag every band down. Two caveats worth remembering when reading it:
      summer heat raises heart rate on its own, and hills do too, so a season-to-season difference
      isn't purely fitness. The card only appears once there are two quarters to compare.
    * Activity patterns by day of week and hour of day.
* **"Update" button** pulls new activities from Garmin Connect, shows how long ago the last sync
  ran (persisted across reloads), and surfaces Garmin login/sync errors clearly instead of a raw
  error string.

## Architecture

* `frontend/` — React + TypeScript app (Vite), map rendered with Leaflet/react-leaflet, reads activities directly from Supabase (anon, read-only key).
* `backend/` — small local Express server. The "Update" button calls its `POST /api/sync`, which logs into Garmin Connect (via the `garmin-connect` npm package) with the credentials in `.env`, fetches new walk/bike activities and their GPS tracks, and writes them into Supabase using the service role key (the only writer — the frontend never sees write access).
* `supabase/` — Supabase CLI project (local Postgres via Docker). Two tables, both public-read with the service role as the only writer:
    * `activities` — one row per activity: the summary figures Garmin returns (distance, durations, speeds, heart rate, elevation, calories, steps, cadence, heart-rate zones, local start time and location) plus a simplified `[[lat, lng], ...]` GPS track.
    * `activity_streams` — the per-point sensor series (time, distance, speed, heart rate, elevation, cadence) as parallel arrays index-aligned with that activity's track. Kept in its own table because the frontend selects every column of `activities` to draw the map and the list, and inlining the streams would triple what a page load downloads for data only the statistics tab reads. It's a few MB in total.

Garmin has no official public API, so browser-side calls aren't viable (would expose credentials and hit CORS) — hence the small local backend as the only thing that talks to Garmin.

## Setup

Prerequisites: Node.js, Docker (for local Supabase), and the Supabase CLI (`brew install supabase/tap/supabase`).

1. Copy `.env.example` to `.env` and fill in `GARMIN_EMAIL` / `GARMIN_PASSWORD`.
2. Start local Supabase and apply the schema:
   ```bash
   supabase start
   supabase db reset
   ```
   `supabase status` prints the local `API_URL`, `ANON_KEY`, and `SERVICE_ROLE_KEY` — put those into `.env` (see `.env.example` for which vars).
3. Install dependencies:
   ```bash
   (cd backend && npm install)
   (cd frontend && npm install)
   ```
4. Run both dev servers (separate terminals):
   ```bash
   (cd backend && npm run dev)   # http://127.0.0.1:8787
   (cd frontend && npm run dev)  # http://localhost:5173
   ```
5. Open http://localhost:5173 and click **Update** to pull your Garmin history into Supabase. The first sync backfills your full history and can take a while (Garmin is called once per new activity, with a small delay between calls to avoid rate limits); later syncs only fetch activities that aren't in Supabase yet, so they're fast.

Everything here runs locally — nothing is deployed. `supabase stop` shuts the local stack down.

## Backfilling sensor data

`npm run backfill` (in `backend/`) re-fetches every activity already in the database that has no
sensor streams yet, filling in the per-point series and the extra summary fields. It's what brings
a history synced before those columns existed up to date.

It's deliberately separate from the "Update" button: a routine sync stops as soon as it hits a page
of activities it already knows about, which is the right thing for an incremental update and
exactly wrong for a backfill, where every activity already exists and the whole history has to be
walked. Garmin is called once per activity, so a full history takes a few minutes. It's safe to
re-run — it skips whatever already has streams, so an interrupted or rate-limited run just picks up
where it stopped.

## Demo data

`npm run seed:demo` (in `backend/`) replaces the database with a synthetic history, so the app can
be screenshotted and recorded for this README without publishing a real home address or a real
training log. `npm run seed:restore` puts the real history back.

The seed backs the real rows up to `backend/.demo-backup.json` (gitignored) before wiping, which is
what makes it safe to run on a working database — restoring is a local file copy rather than a
fresh Garmin sync and backfill. Running the seed a second time keeps the existing backup rather
than overwriting it with the synthetic rows it would otherwise be reading.

The generated history is two years of walking and cycling around Copenhagen, with two trips away so
the time-lapse camera has somewhere else to fly to. It's built to exercise the app rather than to
fill the tables: routes follow real streets and are repeated with realistic GPS scatter, so the
frequency layer has something to merge; heart rate follows pace with a lag and a slow downward
drift, so the efficiency and heart-rate-against-pace charts show a real trend; and activity days
cluster into streaks and thin out over winter, so the calendar heatmap looks like a habit rather
than a coin flip. Every summary figure is derived from the generated sensor streams, so the tiles,
the charts and the tracks all agree. It's deterministic apart from its end date, which follows
today so the streak tile and the calendar stay current.

The routes themselves are hand-placed corners in `demoRoutes.ts`, resolved into the actual streets
and footpaths between them by `npm run snap-routes` and committed as `demoRouteGeometry.json`.
Seeding therefore stays offline and deterministic — a routing service in the seed path would make
every run depend on someone else's uptime — and only that script needs re-running when a route
changes. It uses the OpenStreetMap community's public Valhalla instance, which needs no API key and
has pedestrian and bicycle costings, so a walking loop follows the paths through a park rather than
the ring road around it. A repair pass in the same script pulls corners that sit off the walkable
network (in the middle of a harbour, most often) onto the nearest spot reachable from both of their
neighbours, which is what stops a 4 km loop routing 60 km round the long way to a bridge.

Don't press **Update** while the demo data is loaded — it would sync real Garmin activities into
the middle of it.
