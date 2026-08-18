import "./env.js";

import cors from "cors";
import express from "express";
import { fetchNewActivities } from "./garmin.js";
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

    const synced = await fetchNewActivities({
      email,
      password,
      knownGarminIds: knownIds,
      onProgress: (message) => console.log(message),
      onActivity: async (activity) => {
        const { error: upsertError } = await supabase
          .from("activities")
          .upsert(activity, { onConflict: "garmin_activity_id" });
        if (upsertError) throw upsertError;
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
