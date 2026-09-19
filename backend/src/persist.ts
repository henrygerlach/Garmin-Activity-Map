import { decrypt, encrypt } from "./crypto.js";
import type { ActivityStreams, NormalizedActivity } from "./garmin.js";
import type { Match } from "./wahoo.js";
import type { DailyMetric } from "./wellness.js";
import { supabase } from "./supabase.js";

/**
 * Writes one activity and its streams. The streams row is keyed by the
 * activity's uuid, which only exists once the parent row is in place, so the
 * upsert has to return it rather than the two writes being independent.
 */
export async function saveActivity(
  activity: NormalizedActivity,
  streams: ActivityStreams | null,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("activities")
    .upsert({ ...activity, user_id: userId }, { onConflict: "garmin_activity_id" })
    .select("id")
    .single();
  if (error) throw error;

  if (!streams) return;

  const { error: streamsError } = await supabase.from("activity_streams").upsert(
    {
      activity_id: data.id,
      garmin_activity_id: activity.garmin_activity_id,
      user_id: userId,
      ...streams,
    },
    { onConflict: "activity_id" },
  );
  if (streamsError) throw streamsError;
}

/**
 * Writes matched Wahoo power figures onto the activities they belong to.
 *
 * One update per match rather than an upsert: `activities` has several
 * not-null columns, so an upsert would have to carry the whole row back just
 * to change six fields. A sync matches a handful of workouts, and even a
 * first-run backfill of a full history is a few hundred small updates.
 */
export async function saveActivityPower(matches: Match[]): Promise<void> {
  for (const { activity_id, workout } of matches) {
    const { error } = await supabase
      .from("activities")
      .update({
        wahoo_workout_id: workout.wahoo_workout_id,
        avg_power_w: workout.avg_power_w,
        norm_power_w: workout.norm_power_w,
        tss: workout.tss,
        work_kj: workout.work_kj,
        avg_cadence_rpm: workout.avg_cadence_rpm,
      })
      .eq("id", activity_id);
    if (error) throw error;
  }
}

/** A user's stored Wahoo refresh token, or null before they've authorised one. */
export async function loadWahooRefreshToken(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("wahoo_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.refresh_token as string) ?? null;
}

/** Replaces a user's stored refresh token with the one Wahoo issued in its place. */
export async function saveWahooRefreshToken(userId: string, refreshToken: string): Promise<void> {
  const { error } = await supabase
    .from("wahoo_tokens")
    .upsert(
      { user_id: userId, refresh_token: refreshToken, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}

/**
 * Upserts a run of daily wellness rows, keyed by their calendar date.
 *
 * Two writes, because a sync derives `waking_avg_hr` for only the last day or
 * two: the first omits that column so PostgREST leaves it untouched on the
 * days it holds no answer for, and the second writes the days it does. Sending
 * every row at once would overwrite a settled day's value with null.
 */
export async function saveDailyMetrics(metrics: DailyMetric[], userId: string): Promise<void> {
  if (metrics.length === 0) return;

  const { error } = await supabase
    .from("daily_metrics")
    .upsert(
      metrics.map(({ waking_avg_hr: _waking, ...rest }) => ({ ...rest, user_id: userId })),
      { onConflict: "user_id,calendar_date" },
    );
  if (error) throw error;

  const derived = metrics.filter((metric) => metric.waking_avg_hr !== null);
  if (derived.length === 0) return;

  const { error: wakingError } = await supabase
    .from("daily_metrics")
    .upsert(
      derived.map((metric) => ({ ...metric, user_id: userId })),
      { onConflict: "user_id,calendar_date" },
    );
  if (wakingError) throw wakingError;
}

export interface GarminCredentials {
  email: string;
  password: string;
}

/** A user's stored Garmin login, decrypted, or null before they've connected one. */
export async function loadGarminCredentials(userId: string): Promise<GarminCredentials | null> {
  const { data, error } = await supabase
    .from("garmin_credentials")
    .select("email, encrypted_password")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { email: data.email as string, password: decrypt(data.encrypted_password as string) };
}

/** Replaces a user's stored Garmin login with the one they just submitted. */
export async function saveGarminCredentials(userId: string, email: string, password: string): Promise<void> {
  const { error } = await supabase.from("garmin_credentials").upsert(
    {
      user_id: userId,
      email,
      encrypted_password: encrypt(password),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}
