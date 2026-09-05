import "./env.js";

import { fetchActivities, login } from "./garmin.js";
import { saveActivity } from "./persist.js";
import { supabase } from "./supabase.js";

/**
 * Re-fetches activities that predate the sensor-stream schema, filling in the
 * per-point streams and the extra summary fields the original sync discarded.
 *
 * Kept separate from `POST /api/sync` rather than folded into it: the sync's
 * fast path stops as soon as a page holds nothing new, which is the right
 * behaviour for a routine update and exactly wrong here, where every activity
 * already exists and the whole history has to be walked.
 *
 * Safe to re-run — it skips whatever already has streams, so an interrupted or
 * rate-limited run resumes where it left off. Usage: `npm run backfill`.
 */
async function main(): Promise<void> {
  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Missing GARMIN_EMAIL/GARMIN_PASSWORD in environment");
  }

  const { data: done, error } = await supabase.from("activity_streams").select("garmin_activity_id");
  if (error) throw error;

  const alreadyBackfilled = new Set((done ?? []).map((row) => row.garmin_activity_id as number));
  console.log(`${alreadyBackfilled.size} activities already have streams; fetching the rest.`);

  let count = 0;
  const gc = await login(email, password);
  const synced = await fetchActivities(gc, {
    shouldFetch: (garminActivityId) => !alreadyBackfilled.has(garminActivityId),
    stopWhenPageFullyKnown: false,
    onProgress: (message) => console.log(`[${++count}] ${message}`),
    onActivity: async (activity, streams) => {
      await saveActivity(activity, streams);
      if (!streams) console.warn(`  no sensor data available for ${activity.garmin_activity_id}`);
    },
  });

  console.log(`Backfilled ${synced} activities.`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
