import "./env.js";

import cors from "cors";
import express from "express";
import { fetchActivities, login } from "./garmin.js";
import { saveActivity } from "./persist.js";
import { supabase } from "./supabase.js";

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

    res.json({ synced });
  } catch (err) {
    console.error("Sync failed:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Sync failed" });
  }
});

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`Walkies sync backend listening on http://127.0.0.1:${port}`);
});
