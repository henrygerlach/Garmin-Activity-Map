import type { ActivityStreams, NormalizedActivity } from "./garmin.js";
import { supabase } from "./supabase.js";

/**
 * Writes one activity and its streams. The streams row is keyed by the
 * activity's uuid, which only exists once the parent row is in place, so the
 * upsert has to return it rather than the two writes being independent.
 */
export async function saveActivity(
  activity: NormalizedActivity,
  streams: ActivityStreams | null,
): Promise<void> {
  const { data, error } = await supabase
    .from("activities")
    .upsert(activity, { onConflict: "garmin_activity_id" })
    .select("id")
    .single();
  if (error) throw error;

  if (!streams) return;

  const { error: streamsError } = await supabase.from("activity_streams").upsert(
    {
      activity_id: data.id,
      garmin_activity_id: activity.garmin_activity_id,
      ...streams,
    },
    { onConflict: "activity_id" },
  );
  if (streamsError) throw streamsError;
}
