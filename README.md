# Walkies

A Webapp with a Map showing all the walks if have done in the past (logged on garmin)

## Features

* Map:
    * Blue: walk paths of my walks, when walk line is hovered show details of the walk (Date, Distance, Speed ("in Bewegung"), Avg. HR)
    * Green: bike paths of my biking sessions, when the bike line is hovered show details (Date, Distance, Speed ("in Bewegung"), Avg. HR)
* History of all logged activites in a table at the side, with reference to the map.
* "Update" button, to fetch data from garmin connect

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
