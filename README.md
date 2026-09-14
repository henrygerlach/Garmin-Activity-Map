# Garmin Activity Map

**A web app that draws every walk, run and bike ride ever logged on Garmin onto one map, with a statistics tab showing the progression behind them.**

![CI](https://github.com/henrygerlach/Garmin-Activity-Map/actions/workflows/ci.yml/badge.svg)
![React](https://img.shields.io/badge/React_19-20232a?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646cff?style=flat-square&logo=vite&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=flat-square&logo=leaflet&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-5fa04e?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ecf8e?style=flat-square&logo=supabase&logoColor=white)
![Postgres](https://img.shields.io/badge/PostgreSQL-4169e1?style=flat-square&logo=postgresql&logoColor=white)
![Coded with Claude Code](https://img.shields.io/badge/Coded_with-Claude_Code-d97757?style=flat-square&logo=anthropic&logoColor=white)

> **I did not write this code — Claude Code did, all of it.** I gave it the tech stack and a initial detailed idea, it built a first draft, and from there we iterated: until the app had every feature I actually needed, and until it stopped looking like generated output and started looking like a real product.

![The map view](docs/map.jpg)

![The statistics tab](docs/statistics.jpg)

> The screenshots use a synthetic demo history rather than my own, since I'd rather not publish my home address or my real training log.

## Why I built it

The Garmin Connect app has no view that shows every route on one map, and no statistics that reveal how my training has progressed over time. This fills both gaps.

## Features

### Map

Every activity is drawn as its own trace over a low-saturation Carto basemap, so the traces are the brightest thing on screen rather than the roads. Walks are vermilion, runs violet, rides teal — not blue, because on a map blue is water.

- **Hover** a trace, on the map or in the sidebar, and it lifts above the mass of overlapping lines in a lighter tint of its own hue, with date, distance, moving speed and average HR. The tooltip also reports how many times I've passed that exact point.
- **Filter** by activity type and date range.
- **Frequency map.** This started as an ordinary heatmap, which looked good and said nothing — after a few hundred activities everything is red. It now collapses overlapping paths into one line per route, coloured and weighted by how many activities that line stands for.
- **Time-lapse** replays the history day by day from the first activity logged, drawing one after the other. The camera follows the day being drawn rather than fitting everything drawn so far, which would only zoom further out as the years pile up.

![Time-lapse replay](docs/timelapse.gif)

### Activity list

Every activity in a sortable sidebar, each row carrying a **miniature of its own GPS trace** — longitude scaled by cos(latitude) so the silhouette stays true and routes are recognisable by shape. Clicking a row flies the map to it.

### Statistics

Twelve summary tiles, then a column of charts: a GitHub-style activity calendar, weekly volume, steps, resting heart rate and HRV, speed and heart-rate progression per activity type, and activity patterns by weekday and hour. Rides recorded with the power meter add three more: power and cadence progression, and weekly training load.

### Sync

One **Sync** button. It pulls new activities from Garmin Connect, reports how long ago the last sync ran, and surfaces login failures as sentences rather than stack traces.

### Power

My power meter pairs to the phone, not to the watch, so every ride gets recorded twice — the watch for GPS, the Wahoo app for watts. The sync pulls the Wahoo side too and writes average power, normalised power, TSS, work and crank cadence onto the *watch's* activity, matched by which recordings overlap in time. Those show up in the statistics charts and in the map tooltip. Nothing new appears on the map: there is still one trace per outing, and it's still the accurate one.

Optional. With no Wahoo credentials in `.env` the step is skipped, and if Wahoo is down the Garmin sync still succeeds and reports the problem separately.

---

## Architecture

```
frontend/  React 19 + TS (Vite) ──reads──> Supabase (anon, read-only)
backend/   Express + tsx        ──writes─> Supabase (service role, sole writer)
                │
                └──logs in to──> Garmin Connect (garmin-connect npm)
supabase/  Local Postgres via Docker, CLI-managed migrations
```

- **`frontend/`** — React + TypeScript, Leaflet via react-leaflet, charts as hand-rolled SVG. Reads Supabase directly with a read-only anon key.
- **`backend/`** — a small local Express server. `POST /api/sync` logs into Garmin Connect, fetches new activities and their GPS tracks, then the daily wellness figures, and writes them with the service role key. It is the only writer; the frontend never holds write access.
- **`supabase/`** — local Postgres in Docker, three public-read tables:
  - `activities` — one row per activity: Garmin's summary figures plus a simplified `[[lat, lng], …]` track.
  - `activity_streams` — per-point sensor series as parallel arrays, index-aligned with the track. Split out because the frontend selects every activity column to draw the map, and inlining the streams would have tripled the page-load payload for data only the statistics tab reads.
  - `daily_metrics` — one row per calendar day: steps, resting heart rate, waking average heart rate, overnight HRV. Keyed by date alone, because these are wall-clock days from a watch rather than instants.

Everything runs locally. Nothing is deployed — this is a tool, not a product.

---

## How it was built

[Claude Code](https://claude.com/claude-code) wrote all of the code, driven through a wrapper and a handful of skills, each doing one job:

| Skill | What it did here |
|---|---|
| **Headroom** and **Graphify** | Token reduction. Headroom compressed tool output and retrieved it on demand; Graphify turned the repo into a dependency graph instead of a pile of file reads. |
| **Ponytail** | Minimalism. Stop at the first solution that holds, no speculative abstraction, no config for a value that never changes. |
| **Frontend-Design** | Keeping the frontend clear of AI slop — one token file, a documented type scale, contrast ratios written next to the tokens that have to hold them. |
| **Conventional-Commits** | Commit discipline. `git log --oneline` reads as a changelog: `feat(map)`, `fix(stats)`, `style(frontend)`. |

---

## Setup

Prerequisites: Node.js, Docker, Supabase CLI (`brew install supabase/tap/supabase`).

```bash
cp .env.example .env          # add GARMIN_EMAIL / GARMIN_PASSWORD
supabase start && supabase db reset
(cd backend  && npm install && npm run dev)   # http://127.0.0.1:8788
(cd frontend && npm install && npm run dev)   # http://localhost:5173
```

`supabase status` prints the local `API_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY` for `.env`. Then open the app and press **Sync** — the first run backfills the full history slowly, since Garmin is called once per activity with a delay to stay under rate limits. Later syncs only fetch what's missing. `supabase stop` shuts it down.

<details>
<summary><strong>Wahoo power</strong> (optional)</summary>

Register an application at [developers.wahooligan.com](https://developers.wahooligan.com/) with the `user_read` and `workouts_read` scopes — Wahoo reviews each request by hand, and a sandbox app cannot be promoted to production later, so ask for what you actually want. Put the client ID, secret and the redirect URI you registered into `.env`, then authorise once:

```bash
(cd backend && npm run wahoo:auth)          # prints a consent URL
(cd backend && npm run wahoo:auth -- CODE)  # CODE from the redirect's address bar
```

The redirect page won't load, and doesn't need to — only the `?code=` in the address bar matters. Wahoo insists the redirect URI be `https`, which is why the example one is, despite there being no TLS listener on that port and no listener at all: the browser fails to connect and keeps the URL, which is the whole job. Wahoo rotates refresh tokens on every use, so the token lives in the database rather than in `.env`, and this is a one-time step unless access is revoked.

</details>

<details>
<summary><strong>Spotlight launcher</strong> (macOS)</summary>

Two `.app` bundles in `~/Applications` start and stop the whole stack — Supabase, backend, frontend, browser — from Spotlight, with each step reported as a notification.

1. Create the two bundles, each with a `Contents/MacOS/` directory and a `Contents/Info.plist` whose `CFBundleExecutable` matches the app name:

   ```
   ~/Applications/Garmin Activity Map.app/
   ~/Applications/Stop Garmin Activity Map.app/
   ```

2. Set `PROJECT_DIR` in `scripts/build-launchers.sh`, `scripts/start-app.sh` and `scripts/stop-app.sh` to wherever the repo lives, and the `PATH` line in `start-app.sh` to your Node install — a Spotlight launch doesn't source `~/.zshrc`.
3. Run `scripts/build-launchers.sh`. It compiles `scripts/launcher.c` into each bundle's executable and ad-hoc signs the app.
4. Grant both apps Full Disk Access under System Settings → Privacy & Security, so they can read the project under `~/Documents`.

The executable is compiled C rather than a shell script because a script-based `.app` is run through `/bin/bash`, and macOS then attributes file access to `com.apple.bash` — the Full Disk Access grant on the app never matches, and reads fail with exit 126 and no visible error. The stub *forks* the helper script instead of `exec`ing it, so the child inherits the app's own code identity and the grant applies.

Re-run `scripts/build-launchers.sh` after changing `launcher.c` or moving the project.

</details>

<details>
<summary><strong>Scripts</strong></summary>

| Command | Directory | What it does |
|---|---|---|
| `npm run dev` | both | Dev servers |
| `npm run backfill` | `backend/` | Re-fetch sensor streams for activities synced before those columns existed |
| `npm run seed:demo` | `backend/` | Replace the DB with the synthetic demo history |
| `npm run seed:restore` | `backend/` | Restore the real history from the local backup |
| `npm run snap-routes` | `backend/` | Resolve hand-placed demo route corners into real street geometry |
| `npm run typecheck` | `backend/` | `tsc --noEmit` |
| `npm run lint` | `frontend/` | oxlint |

`backfill` is deliberately separate from **Sync**: a routine sync stops at the first page of activities it already knows, which is right for an incremental update and exactly wrong for a backfill that must walk the whole history. It's safe to re-run — it skips whatever already has streams.

</details>

---

## Demo data

`npm run seed:demo` replaces the database with a synthetic history so the app can be screenshotted without publishing a real home address or training log; `npm run seed:restore` puts the real data back from a gitignored local backup.

> ⚠️ Don't press **Sync** while the demo data is loaded — it would sync real Garmin activities into the middle of it.

## Testing and Quality

Both projects run on Vitest (`npm test`, `npm run test:coverage`). Backend tests mock Garmin Connect and Supabase to exercise the sync and persistence logic in isolation; frontend tests use React Testing Library, plus a real `react-leaflet` `MapContainer` in jsdom for the map components. Coverage sits around 97% on the backend and 95% on the frontend, excluding CLI scripts and trivial client-init files that aren't worth unit testing.

