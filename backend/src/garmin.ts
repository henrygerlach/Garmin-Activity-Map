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
  distance_m: number;
  duration_s: number;
  moving_duration_s: number;
  avg_speed_mps: number | null;
  avg_hr: number | null;
  points: [number, number][];
}

// Only the fields we actually read from Garmin's activity list response.
interface GarminActivitySummary {
  activityId: number;
  activityName: string | null;
  startTimeGMT: string;
  distance: number | null;
  duration: number | null;
  movingDuration: number | null;
  averageSpeed: number | null;
  averageHR: number | null;
  hasPolyline: boolean;
  activityType: { typeKey: string };
}

interface GarminActivityDetails {
  geoPolylineDTO?: {
    polyline?: { lat: number; lon: number }[];
  };
}

const GC_API_BASE = "https://connectapi.garmin.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const DETAIL_REQUEST_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeType(typeKey: string): ActivityKind | null {
  const key = typeKey.toLowerCase();
  if (key.includes("walk") || key.includes("hik")) return "walk";
  if (key.includes("cycl") || key.includes("bik")) return "bike";
  return null;
}

async function fetchPoints(
  gc: GarminConnect,
  activityId: number,
): Promise<[number, number][]> {
  const details = await gc.client.get<GarminActivityDetails>(
    `${GC_API_BASE}/activity-service/activity/${activityId}/details`,
    { params: { maxChartSize: 2000, maxPolylineSize: 4000 } },
  );
  const polyline = details.geoPolylineDTO?.polyline ?? [];
  return polyline
    .filter((p) => typeof p.lat === "number" && typeof p.lon === "number")
    .map((p): [number, number] => [p.lat, p.lon]);
}

export async function fetchNewActivities(opts: {
  email: string;
  password: string;
  knownGarminIds: Set<number>;
  onProgress?: (message: string) => void;
  // Called once per new activity as soon as it's fetched, so a long first
  // backfill persists progress incrementally instead of losing everything
  // if it's interrupted partway through.
  onActivity: (activity: NormalizedActivity) => Promise<void>;
}): Promise<number> {
  const gc = new GarminConnect({ username: opts.email, password: opts.password });
  await gc.login();

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

    const newOnes = relevant.filter((x) => !opts.knownGarminIds.has(x.activity.activityId));

    for (const { activity, type } of newOnes) {
      opts.onProgress?.(`Fetching ${type} "${activity.activityName}" (${activity.activityId})`);

      const points = activity.hasPolyline ? await fetchPoints(gc, activity.activityId) : [];

      await opts.onActivity({
        garmin_activity_id: activity.activityId,
        name: activity.activityName || (type === "walk" ? "Walk" : "Bike ride"),
        type,
        start_time: new Date(`${activity.startTimeGMT.replace(" ", "T")}Z`).toISOString(),
        distance_m: activity.distance ?? 0,
        duration_s: Math.round(activity.duration ?? 0),
        moving_duration_s: Math.round(activity.movingDuration ?? activity.duration ?? 0),
        avg_speed_mps: activity.averageSpeed ?? null,
        avg_hr: activity.averageHR ?? null,
        points,
      });

      opts.knownGarminIds.add(activity.activityId);
      syncedCount += 1;
      await sleep(DETAIL_REQUEST_DELAY_MS);
    }

    // Garmin returns activities newest-first. Once a page contributes no new
    // walk/bike activities, everything on later pages is already synced.
    if (relevant.length > 0 && newOnes.length === 0) break;
  }

  return syncedCount;
}
