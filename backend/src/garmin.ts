// garmin-connect is CJS; Node's static named-export detection for it is
// unreliable under `tsx`, so import the whole module and destructure instead.
import garminConnectPkg from "garmin-connect";
const { GarminConnect } = garminConnectPkg;
type GarminConnect = InstanceType<typeof garminConnectPkg.GarminConnect>;

export type ActivityKind = "walk" | "bike";

export interface NormalizedActivity {
  garmin_activity_id: number;
  name: string;
  type: ActivityKind;
  start_time: string;
  start_time_local: string | null;
  timezone_id: string | null;
  location_name: string | null;
  distance_m: number;
  duration_s: number;
  moving_duration_s: number;
  elapsed_duration_s: number | null;
  avg_speed_mps: number | null;
  max_speed_mps: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  min_elevation_m: number | null;
  max_elevation_m: number | null;
  calories: number | null;
  steps: number | null;
  avg_cadence_spm: number | null;
  max_cadence_spm: number | null;
  avg_stride_length_cm: number | null;
  moderate_intensity_min: number | null;
  vigorous_intensity_min: number | null;
  hr_time_in_zone_s: number[] | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  points: [number, number][];
}

/**
 * Per-point sensor streams, as parallel arrays index-aligned with
 * `NormalizedActivity.points` (see `parseDetails` for how that alignment is
 * guaranteed). Entries are null where the sensor reported nothing.
 */
export interface ActivityStreams {
  t_s: number[];
  distance_m: number[];
  speed_mps: number[];
  hr_bpm: (number | null)[];
  elevation_m: (number | null)[];
  cadence_spm: (number | null)[];
}

// Only the fields we actually read from Garmin's activity list response.
interface GarminActivitySummary {
  activityId: number;
  activityName: string | null;
  startTimeGMT: string;
  startTimeLocal: string | null;
  timeZoneId: number | string | null;
  locationName: string | null;
  distance: number | null;
  duration: number | null;
  movingDuration: number | null;
  elapsedDuration: number | null;
  averageSpeed: number | null;
  maxSpeed: number | null;
  averageHR: number | null;
  maxHR: number | null;
  elevationGain: number | null;
  elevationLoss: number | null;
  minElevation: number | null;
  maxElevation: number | null;
  calories: number | null;
  steps: number | null;
  averageRunningCadenceInStepsPerMinute: number | null;
  maxRunningCadenceInStepsPerMinute: number | null;
  avgStrideLength: number | null;
  moderateIntensityMinutes: number | null;
  vigorousIntensityMinutes: number | null;
  hrTimeInZone_1: number | null;
  hrTimeInZone_2: number | null;
  hrTimeInZone_3: number | null;
  hrTimeInZone_4: number | null;
  hrTimeInZone_5: number | null;
  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  activityType: { typeKey: string };
}

interface GarminActivityDetails {
  metricDescriptors?: { metricsIndex: number; key: string }[];
  activityDetailMetrics?: { metrics: (number | null)[] }[];
}

const GC_API_BASE = "https://connectapi.garmin.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const DETAIL_REQUEST_DELAY_MS = 300;
// Garmin downsamples both the sensor series and the polyline to these caps.
// They're equal on purpose: the series is what we derive track points from, so
// a smaller chart cap would silently coarsen the map.
const MAX_SAMPLES = 4000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeType(typeKey: string): ActivityKind | null {
  const key = typeKey.toLowerCase();
  if (key.includes("walk") || key.includes("hik")) return "walk";
  if (key.includes("cycl") || key.includes("bik")) return "bike";
  return null;
}

function round(value: number | null | undefined, decimals: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toInt(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value);
}

/**
 * Turns Garmin's `activityDetailMetrics` — a flat array of numbers per sample,
 * whose meaning is defined by a separate `metricDescriptors` list — into track
 * points and typed streams.
 *
 * Both come out of the same filtered set of samples, so `points[i]` and every
 * stream's `[i]` always describe the same moment. Samples missing coordinates
 * are dropped for a GPS activity (they'd shift the track's points out of step
 * with its streams), but kept for one recorded entirely without GPS, where
 * there is no track to align with and the heart-rate series is the whole point.
 */
function parseDetails(
  details: GarminActivityDetails,
  startTimeMs: number,
): { points: [number, number][]; streams: ActivityStreams | null } {
  const rows = details.activityDetailMetrics ?? [];
  const descriptors = details.metricDescriptors ?? [];
  if (rows.length === 0 || descriptors.length === 0) return { points: [], streams: null };

  const indexOf = new Map(descriptors.map((d) => [d.key, d.metricsIndex]));
  const at = (metrics: (number | null)[], key: string): number | null => {
    const i = indexOf.get(key);
    if (i === undefined) return null;
    const value = metrics[i];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };

  const latOf = (m: (number | null)[]) => at(m, "directLatitude");
  const lngOf = (m: (number | null)[]) => at(m, "directLongitude");

  const hasGps = rows.some((row) => latOf(row.metrics) !== null && lngOf(row.metrics) !== null);
  const samples = hasGps
    ? rows.filter((row) => latOf(row.metrics) !== null && lngOf(row.metrics) !== null)
    : rows;

  const points: [number, number][] = [];
  const streams: ActivityStreams = {
    t_s: [],
    distance_m: [],
    speed_mps: [],
    hr_bpm: [],
    elevation_m: [],
    cadence_spm: [],
  };

  for (const { metrics } of samples) {
    if (hasGps) points.push([latOf(metrics)!, lngOf(metrics)!]);

    const timestampMs = at(metrics, "directTimestamp");
    streams.t_s.push(timestampMs === null ? 0 : Math.round((timestampMs - startTimeMs) / 1000));
    streams.distance_m.push(toInt(at(metrics, "sumDistance")) ?? 0);
    streams.speed_mps.push(round(at(metrics, "directSpeed"), 2) ?? 0);
    streams.hr_bpm.push(toInt(at(metrics, "directHeartRate")));
    // Garmin's corrected elevation is its barometric/terrain-model fit; the raw
    // reading is the fallback for activities it hasn't corrected.
    streams.elevation_m.push(
      round(at(metrics, "directCorrectedElevation") ?? at(metrics, "directElevation"), 1),
    );
    streams.cadence_spm.push(toInt(at(metrics, "directDoubleCadence")));
  }

  return { points, streams };
}

async function fetchDetails(
  gc: GarminConnect,
  activityId: number,
  startTimeMs: number,
): Promise<{ points: [number, number][]; streams: ActivityStreams | null }> {
  const details = await gc.client.get<GarminActivityDetails>(
    `${GC_API_BASE}/activity-service/activity/${activityId}/details`,
    { params: { maxChartSize: MAX_SAMPLES, maxPolylineSize: MAX_SAMPLES } },
  );
  return parseDetails(details, startTimeMs);
}

function normalize(activity: GarminActivitySummary, type: ActivityKind): NormalizedActivity {
  const zones = [
    activity.hrTimeInZone_1,
    activity.hrTimeInZone_2,
    activity.hrTimeInZone_3,
    activity.hrTimeInZone_4,
    activity.hrTimeInZone_5,
  ];

  return {
    garmin_activity_id: activity.activityId,
    name: activity.activityName || (type === "walk" ? "Walk" : "Bike ride"),
    type,
    start_time: new Date(`${activity.startTimeGMT.replace(" ", "T")}Z`).toISOString(),
    // Wall-clock time at the location, with no zone attached — stored as a bare
    // `timestamp`, so it must not be run through `new Date()` here or it would
    // be reinterpreted in the *server's* zone and shifted.
    start_time_local: activity.startTimeLocal?.replace(" ", "T") ?? null,
    timezone_id: activity.timeZoneId === null || activity.timeZoneId === undefined ? null : String(activity.timeZoneId),
    location_name: activity.locationName ?? null,
    distance_m: activity.distance ?? 0,
    duration_s: Math.round(activity.duration ?? 0),
    moving_duration_s: Math.round(activity.movingDuration ?? activity.duration ?? 0),
    elapsed_duration_s: toInt(activity.elapsedDuration),
    avg_speed_mps: activity.averageSpeed ?? null,
    max_speed_mps: activity.maxSpeed ?? null,
    avg_hr: activity.averageHR ?? null,
    max_hr: activity.maxHR ?? null,
    elevation_gain_m: round(activity.elevationGain, 1),
    elevation_loss_m: round(activity.elevationLoss, 1),
    min_elevation_m: round(activity.minElevation, 1),
    max_elevation_m: round(activity.maxElevation, 1),
    calories: activity.calories ?? null,
    steps: toInt(activity.steps),
    avg_cadence_spm: round(activity.averageRunningCadenceInStepsPerMinute, 1),
    max_cadence_spm: round(activity.maxRunningCadenceInStepsPerMinute, 1),
    avg_stride_length_cm: round(activity.avgStrideLength, 1),
    moderate_intensity_min: toInt(activity.moderateIntensityMinutes),
    vigorous_intensity_min: toInt(activity.vigorousIntensityMinutes),
    hr_time_in_zone_s: zones.some((z) => typeof z === "number") ? zones.map((z) => z ?? 0) : null,
    start_lat: activity.startLatitude ?? null,
    start_lng: activity.startLongitude ?? null,
    end_lat: activity.endLatitude ?? null,
    end_lng: activity.endLongitude ?? null,
    points: [],
  };
}

export interface SyncCallbacks {
  onProgress?: (message: string) => void;
  // Called once per activity as soon as it's fetched, so a long first
  // backfill persists progress incrementally instead of losing everything
  // if it's interrupted partway through.
  onActivity: (activity: NormalizedActivity, streams: ActivityStreams | null) => Promise<void>;
}

export async function login(email: string, password: string): Promise<GarminConnect> {
  const gc = new GarminConnect({ username: email, password });
  await gc.login();
  return gc;
}

/**
 * Walks Garmin's activity list newest-first and hands back every walk or ride
 * that `shouldFetch` accepts, along with its sensor streams.
 *
 * `stopWhenPageFullyKnown` is the incremental-sync fast path: Garmin returns
 * activities newest-first, so once a whole page is already known there is
 * nothing new on any later page. A backfill re-reading existing rows must turn
 * it off, since for it every page looks "fully known".
 */
export async function fetchActivities(
  gc: GarminConnect,
  opts: SyncCallbacks & {
    shouldFetch: (garminActivityId: number) => boolean;
    stopWhenPageFullyKnown: boolean;
  },
): Promise<number> {
  let syncedCount = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const activities = (await gc.getActivities(
      page * PAGE_SIZE,
      PAGE_SIZE,
    )) as unknown as GarminActivitySummary[];
    if (activities.length === 0) break;

    const relevant = activities
      .map((activity) => ({ activity, type: normalizeType(activity.activityType?.typeKey ?? "") }))
      .filter((x): x is { activity: GarminActivitySummary; type: ActivityKind } => x.type !== null);

    const wanted = relevant.filter((x) => opts.shouldFetch(x.activity.activityId));

    for (const { activity, type } of wanted) {
      opts.onProgress?.(`Fetching ${type} "${activity.activityName}" (${activity.activityId})`);

      const normalized = normalize(activity, type);
      // Details are fetched even when Garmin says there's no polyline: an
      // indoor walk still carries heart rate and cadence, which is exactly the
      // data the pace/heart-rate statistics need.
      const { points, streams } = await fetchDetails(
        gc,
        activity.activityId,
        new Date(normalized.start_time).getTime(),
      );
      normalized.points = points;

      await opts.onActivity(normalized, streams);

      syncedCount += 1;
      await sleep(DETAIL_REQUEST_DELAY_MS);
    }

    if (opts.stopWhenPageFullyKnown && relevant.length > 0 && wanted.length === 0) break;
  }

  return syncedCount;
}
