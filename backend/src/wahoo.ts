/**
 * Power-meter data from the Wahoo Cloud API.
 *
 * The power meter pairs to the phone rather than the watch, so every outing is
 * recorded twice: the watch for GPS, the Wahoo app for watts. This module
 * fetches the Wahoo side and works out which watch activity each recording
 * belongs to — it never produces activities of its own, because doing so would
 * put every ride on the map twice, once with a good trace and once with the
 * phone's.
 *
 * Summary figures only. `GET /v1/workouts` returns averages and a link to a
 * FIT file; the per-second power is inside that file, and downloading and
 * parsing it is a different job from this one.
 */

const WAHOO_API_BASE = "https://api.wahooligan.com";
const PER_PAGE = 30;
// Production apps get 200 requests per 5 minutes. A page every 300ms is well
// under that even on a first run that walks the entire history.
const REQUEST_DELAY_MS = 300;

/** One Wahoo recording, reduced to the figures the watch has no way to know. */
export interface WahooWorkout {
  wahoo_workout_id: number;
  /** ISO 8601, UTC. */
  start_time: string;
  duration_s: number;
  avg_power_w: number | null;
  norm_power_w: number | null;
  tss: number | null;
  work_kj: number | null;
  avg_cadence_rpm: number | null;
}

/** The part of a stored activity the matcher needs to line recordings up. */
export interface MatchTarget {
  id: string;
  start_time: string;
  duration_s: number;
}

export interface Match {
  activity_id: string;
  workout: WahooWorkout;
}

// Wahoo sends every number as a quoted string, including the ones that are
// plainly numeric, and omits keys entirely for sensors that weren't present.
interface WahooSummary {
  duration_active_accum: string | null;
  power_avg: string | null;
  power_bike_np_last: string | null;
  power_bike_tss_last: string | null;
  work_accum: string | null;
  cadence_avg: string | null;
}

interface WahooWorkoutResponse {
  id: number;
  starts: string;
  minutes: number | null;
  workout_summary: WahooSummary | null;
}

interface WorkoutsPage {
  workouts: WahooWorkoutResponse[];
  total: number;
  page: number;
  per_page: number;
}

function toNum(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value: number | null, decimals: number): number | null {
  if (value === null) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Trades the stored refresh token for a usable access token, and hands back
 * the replacement refresh token that comes with it.
 *
 * The caller must persist the returned refresh token *before* making any API
 * call with the access token: Wahoo keeps the old pair alive until the new
 * access token is first used, so saving first leaves a crash recoverable and
 * saving afterwards can strand the account with no valid token at all.
 */
export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(`${WAHOO_API_BASE}/oauth/token?${params}`, { method: "POST" });
  if (!response.ok) {
    throw new Error(
      `Wahoo token refresh failed (${response.status}). Re-authorise with \`npm run wahoo:auth\`.`,
    );
  }

  const json = (await response.json()) as { access_token: string; refresh_token: string };
  return { accessToken: json.access_token, refreshToken: json.refresh_token };
}

/** Exchanges the one-time code from the consent redirect for a token pair. */
export async function exchangeAuthorizationCode(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetch(`${WAHOO_API_BASE}/oauth/token?${params}`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Wahoo code exchange failed (${response.status}): ${await response.text()}`);
  }

  const json = (await response.json()) as { access_token: string; refresh_token: string };
  return { accessToken: json.access_token, refreshToken: json.refresh_token };
}

/** The consent URL to open in a browser to start authorisation. */
export function authorizeUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    // `user_read` is not optional even though nothing here reads the profile:
    // without it the API answers 403 to everything.
    scope: "user_read workouts_read",
  });
  return `${WAHOO_API_BASE}/oauth/authorize?${params}`;
}

function normalize(workout: WahooWorkoutResponse): WahooWorkout {
  const summary = workout.workout_summary;
  const joules = toNum(summary?.work_accum);
  return {
    wahoo_workout_id: workout.id,
    start_time: new Date(workout.starts).toISOString(),
    // The summary's active duration is the closest thing to Garmin's timer
    // duration; `minutes` is the fallback for a workout with no summary yet.
    duration_s: Math.round(toNum(summary?.duration_active_accum) ?? (workout.minutes ?? 0) * 60),
    avg_power_w: round(toNum(summary?.power_avg), 1),
    norm_power_w: round(toNum(summary?.power_bike_np_last), 1),
    tss: round(toNum(summary?.power_bike_tss_last), 1),
    work_kj: round(joules === null ? null : joules / 1000, 1),
    avg_cadence_rpm: round(toNum(summary?.cadence_avg), 1),
  };
}

/**
 * Walks the workout list newest-first, stopping once it reaches recordings
 * that start before `since` — which is the newest activity already carrying
 * power, so a routine sync costs one request and a first run costs one per
 * thirty workouts.
 */
export async function fetchWorkouts(
  accessToken: string,
  since: Date | null,
  onProgress: (message: string) => void = () => {},
): Promise<WahooWorkout[]> {
  const collected: WahooWorkout[] = [];

  for (let page = 1; ; page += 1) {
    const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
    const response = await fetch(`${WAHOO_API_BASE}/v1/workouts?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Wahoo workout fetch failed (${response.status}): ${await response.text()}`);
    }

    const body = (await response.json()) as WorkoutsPage;
    const workouts = body.workouts ?? [];
    if (workouts.length === 0) break;

    // The list is always sorted by start time descending, so the first workout
    // older than the cutoff means every workout after it is older too.
    let reachedCutoff = false;
    for (const workout of workouts) {
      if (since && new Date(workout.starts) <= since) {
        reachedCutoff = true;
        break;
      }
      collected.push(normalize(workout));
    }

    onProgress(`Wahoo: ${collected.length} workouts fetched`);
    if (reachedCutoff || page * PER_PAGE >= body.total) break;
    await sleep(REQUEST_DELAY_MS);
  }

  return collected;
}

// How much of the shorter of the two recordings has to overlap the longer for
// them to be the same outing. Matching on start time alone would pair a ride
// with the run that followed it if the watch was started late; requiring the
// spans to overlap makes the ordinary case of starting one device a few
// minutes before the other safe, and back-to-back activities unambiguous.
const MIN_OVERLAP_RATIO = 0.5;

/**
 * Pairs Wahoo recordings with the watch activities they were recorded
 * alongside. Each recording claims at most one activity and vice versa,
 * nearest start time first, so the closer of two plausible pairings wins and
 * the loser falls through to its own next-best candidate.
 */
export function matchWorkouts(workouts: WahooWorkout[], activities: MatchTarget[]): Match[] {
  // ponytail: every workout against every activity. Both sides are a sync's
  // worth of records — index by day if a full-history rematch ever gets slow.
  const candidates: { workout: WahooWorkout; activity: MatchTarget; delta: number }[] = [];

  for (const workout of workouts) {
    const workoutStart = Date.parse(workout.start_time);
    const workoutEnd = workoutStart + workout.duration_s * 1000;

    for (const activity of activities) {
      const activityStart = Date.parse(activity.start_time);
      const activityEnd = activityStart + activity.duration_s * 1000;

      const shorter = Math.min(workoutEnd - workoutStart, activityEnd - activityStart);
      if (shorter <= 0) continue;

      const overlap = Math.min(workoutEnd, activityEnd) - Math.max(workoutStart, activityStart);
      if (overlap < shorter * MIN_OVERLAP_RATIO) continue;

      candidates.push({ workout, activity, delta: Math.abs(workoutStart - activityStart) });
    }
  }

  candidates.sort((a, b) => a.delta - b.delta);

  const claimedWorkouts = new Set<number>();
  const claimedActivities = new Set<string>();
  const matches: Match[] = [];

  for (const { workout, activity } of candidates) {
    if (claimedWorkouts.has(workout.wahoo_workout_id) || claimedActivities.has(activity.id)) continue;
    claimedWorkouts.add(workout.wahoo_workout_id);
    claimedActivities.add(activity.id);
    matches.push({ activity_id: activity.id, workout });
  }

  return matches;
}
