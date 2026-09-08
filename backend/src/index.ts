import "./env.js";

import cors from "cors";
import express from "express";
import { fetchActivities, login } from "./garmin.js";
import { saveActivity, saveDailyMetrics } from "./persist.js";
import { supabase } from "./supabase.js";
import { addDays, fetchDailyMetrics, toCalendarDate } from "./wellness.js";

// Today's step count is still growing, and last night's resting heart rate and
// HRV can land hours after the watch syncs, so a sync always refetches the tail
// of what it already has rather than starting where it stopped.
const DAILY_METRICS_OVERLAP_DAYS = 7;
// How far back the first sync reaches when the table is empty and there are no
// activities to date it from.
const DAILY_METRICS_MAX_HISTORY_DAYS = 730;

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
    const metrics = await fetchDailyMetrics(gc, from, new Date(), (message) => console.log(message));
    await saveDailyMetrics(metrics);
    console.log(`${metrics.length} days of wellness data from ${toCalendarDate(from)}`);

    res.json({ synced, dailyMetrics: metrics.length });
  } catch (err) {
    console.error("Sync failed:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Sync failed" });
  }
});

const port = Number(process.env.PORT) || 8788;
app.listen(port, () => {
  console.log(`Walkies sync backend listening on http://127.0.0.1:${port}`);
});
