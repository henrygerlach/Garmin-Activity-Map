import "./env.js";

import cors from "cors";
import express from "express";
import { fetchActivities, login } from "./garmin.js";
import {
  loadWahooRefreshToken,
  saveActivity,
  saveActivityPower,
  saveDailyMetrics,
  saveWahooRefreshToken,
} from "./persist.js";
import { supabase } from "./supabase.js";
import type { MatchTarget } from "./wahoo.js";
import { fetchWorkouts, matchWorkouts, refreshAccessToken } from "./wahoo.js";
import { addDays, fetchDailyMetrics, toCalendarDate } from "./wellness.js";

// Today's step count is still growing, and last night's resting heart rate and
// HRV can land hours after the watch syncs, so a sync always refetches the tail
// of what it already has rather than starting where it stopped.
const DAILY_METRICS_OVERLAP_DAYS = 7;
// How far back the first sync reaches when the table is empty and there are no
// activities to date it from.
const DAILY_METRICS_MAX_HISTORY_DAYS = 730;
// How many days back the waking heart rate is re-derived. It is the one
// wellness figure with no range endpoint — a day costs a samples call plus two
// sleep calls — so re-deriving the whole overlap window is most of a sync's
// wall clock. Today is still growing and yesterday's samples can land late;
// beyond that a day only changes if it was never stored.
const WAKING_HR_RECOMPUTE_DAYS = 2;

/**
 * The day to start fetching wellness data from: just behind what's stored, or
 * — on a first run — the start of the activity history, so the two cover the
 * same span. Days Garmin has nothing for are skipped on write, so the empty
 * stretch before the watch existed is walked once and never again.
 */
async function dailyMetricsStartDate(): Promise<Date> {
  const { data: latest, error: latestError } = await supabase
    .from("daily_metrics")
    .select("calendar_date")
    .order("calendar_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  if (latest) {
    const [y, m, d] = (latest.calendar_date as string).split("-").map(Number);
    return addDays(new Date(y, m - 1, d), -DAILY_METRICS_OVERLAP_DAYS);
  }

  const { data: earliest, error: earliestError } = await supabase
    .from("activities")
    .select("start_time")
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (earliestError) throw earliestError;
  return earliest
    ? new Date(earliest.start_time as string)
    : addDays(new Date(), -DAILY_METRICS_MAX_HISTORY_DAYS);
}

/**
 * The days in `[from, to]` whose waking heart rate is worth deriving: the last
 * couple, which are still filling in, and any the table has no value for yet —
 * so a week between syncs still fills its gap, and a settled day is never paid
 * for twice.
 */
async function wakingHrDates(from: Date, to: Date): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("daily_metrics")
    .select("calendar_date")
    .gte("calendar_date", toCalendarDate(from))
    .lte("calendar_date", toCalendarDate(to))
    .not("waking_avg_hr", "is", null);
  if (error) throw error;

  const stored = new Set((data ?? []).map((row) => row.calendar_date as string));
  const dates = new Set<string>();
  for (let day = new Date(from); day <= to; day = addDays(day, 1)) {
    const key = toCalendarDate(day);
    if (!stored.has(key)) dates.add(key);
  }
  for (let back = 0; back < WAKING_HR_RECOMPUTE_DAYS; back++) {
    dates.add(toCalendarDate(addDays(to, -back)));
  }
  return dates;
}

/**
 * Pulls power-meter figures from Wahoo and writes them onto the watch
 * activities they were recorded alongside. Returns how many activities gained
 * power, or null when Wahoo isn't configured.
 *
 * Runs after the Garmin sync on purpose: an activity recorded minutes ago has
 * to exist as a row before there is anything for its watts to attach to.
 */
async function syncWahooPower(): Promise<number | null> {
  const clientId = process.env.WAHOO_CLIENT_ID;
  const clientSecret = process.env.WAHOO_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const storedToken = await loadWahooRefreshToken();
  if (!storedToken) {
    throw new Error("No Wahoo refresh token stored. Run `npm run wahoo:auth` in backend/.");
  }

  const { accessToken, refreshToken } = await refreshAccessToken(clientId, clientSecret, storedToken);
  // Before the first API call, never after: Wahoo only retires the old token
  // once the new one is used, so a crash here is recoverable and a crash after
  // a successful call would not be.
  await saveWahooRefreshToken(refreshToken);

  // The newest activity already carrying power is where the last run got to.
  const { data: newestMatched, error: matchedError } = await supabase
    .from("activities")
    .select("start_time")
    .not("wahoo_workout_id", "is", null)
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (matchedError) throw matchedError;
  const since = newestMatched ? new Date(newestMatched.start_time as string) : null;

  const workouts = await fetchWorkouts(accessToken, since, (message) => console.log(message));
  if (workouts.length === 0) return 0;

  let query = supabase
    .from("activities")
    .select("id, start_time, duration_s")
    .is("wahoo_workout_id", null);
  if (since) query = query.gte("start_time", since.toISOString());
  const { data: candidates, error: candidatesError } = await query;
  if (candidatesError) throw candidatesError;

  const matches = matchWorkouts(workouts, (candidates ?? []) as MatchTarget[]);
  await saveActivityPower(matches);
  console.log(`Wahoo: ${matches.length} of ${workouts.length} workouts matched to an activity`);
  return matches.length;
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/sync", async (_req, res) => {
  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;
  if (!email || !password) {
    res.status(500).json({ error: "Missing GARMIN_EMAIL/GARMIN_PASSWORD in environment" });
    return;
  }

  try {
    const { data: existing, error: fetchError } = await supabase
      .from("activities")
      .select("garmin_activity_id");
    if (fetchError) throw fetchError;

    const knownIds = new Set((existing ?? []).map((row) => row.garmin_activity_id as number));

    const gc = await login(email, password);
    const synced = await fetchActivities(gc, {
      shouldFetch: (garminActivityId) => !knownIds.has(garminActivityId),
      stopWhenPageFullyKnown: true,
      onProgress: (message) => console.log(message),
      onActivity: async (activity, streams) => {
        await saveActivity(activity, streams);
        knownIds.add(activity.garmin_activity_id);
      },
    });

    const from = await dailyMetricsStartDate();
    const to = new Date();
    const metrics = await fetchDailyMetrics(
      gc,
      from,
      to,
      (message) => console.log(message),
      await wakingHrDates(from, to),
    );
    await saveDailyMetrics(metrics);
    console.log(`${metrics.length} days of wellness data from ${toCalendarDate(from)}`);

    // Wahoo is a second, optional source. A failure there shouldn't fail a
    // sync that has already written everything Garmin had, so it reports its
    // problem alongside the result instead of throwing away the good news.
    let power: number | null = null;
    let wahooError: string | null = null;
    try {
      power = await syncWahooPower();
    } catch (err) {
      wahooError = err instanceof Error ? err.message : "Wahoo sync failed";
      console.error("Wahoo sync failed:", err);
    }

    res.json({ synced, dailyMetrics: metrics.length, power, wahooError });
  } catch (err) {
    console.error("Sync failed:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Sync failed" });
  }
});

const port = Number(process.env.PORT) || 8788;
const server = app.listen(port, () => {
  console.log(`Walkies sync backend listening on http://127.0.0.1:${port}`);
});

// Exported for tests, which hit the routes over a real ephemeral port rather
// than exercising Express's internals directly.
export { app, server };
