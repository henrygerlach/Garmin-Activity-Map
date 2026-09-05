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
* **History table**, in a sidebar next to the map, listing every logged activity with its date,
  distance, moving time, speed, and average HR. Columns are sortable, and clicking a row pans the
  map to that activity and highlights it (jumping to the Map tab if needed).
* **Statistics tab**
    * At-a-glance tiles: total activities, total distance, total time moving, current streak,
      longest walk, longest bike ride, average heart rate.
    * A GitHub-style calendar heatmap of daily activity.
    * Weekly walking and cycling distance across the full logging history.
    * Speed and heart-rate progression over time (walk vs. bike), so I can see whether I'm
      actually getting faster — with GPS-glitch outliers (e.g. walking indoors) automatically
      excluded from the weekly averages.
    * Activity patterns by day of week and hour of day.
* **"Update" button** pulls new activities from Garmin Connect, shows how long ago the last sync
  ran (persisted across reloads), and surfaces Garmin login/sync errors clearly instead of a raw
  error string.

## Architecture

* `frontend/` — React + TypeScript app (Vite), map rendered with Leaflet/react-leaflet, reads activities directly from Supabase (anon, read-only key).
* `backend/` — small local Express server. The "Update" button calls its `POST /api/sync`, which logs into Garmin Connect (via the `garmin-connect` npm package) with the credentials in `.env`, fetches new walk/bike activities and their GPS tracks, and writes them into Supabase using the service role key (the only writer — the frontend never sees write access).
* `supabase/` — Supabase CLI project (local Postgres via Docker). One table, `activities`, holding activity summaries and a simplified `[[lat, lng], ...]` GPS track per activity. Row Level Security allows public read, and only the service role can write.

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
