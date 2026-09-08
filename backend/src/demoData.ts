import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ActivityKind, ActivityStreams, NormalizedActivity } from "./garmin.js";
import type { DailyMetric } from "./wellness.js";
import { HOME_ROUTES, TRIPS, type DemoRoute } from "./demoRoutes.js";

/**
 * Generates a plausible but entirely invented activity history, so the app can
 * be screenshotted and recorded for the README without publishing a real home
 * address or a real training log.
 *
 * The shape of the data matters more than the numbers: the map, the frequency
 * layer, the time-lapse and every chart in the statistics tab only look right
 * if repeated routes overlap the way real GPS traces do, if heart rate tracks
 * pace with a lag, and if there is a slow fitness trend underneath the noise.
 * So the generator produces per-point sensor streams first and derives every
 * summary field from them, rather than inventing summaries and tracks
 * separately and letting the two disagree.
 *
 * Deterministic: a fixed seed means a regenerated database matches screenshots
 * taken from an earlier run. Only the end date moves, because the calendar
 * heatmap and the streak tile are drawn relative to today.
 */

const SEED = 20260905;
/** Share of on-foot outings logged as a run rather than a walk. */
const RUN_SHARE = 0.3;
const HISTORY_DAYS = 730;
const FIRST_ACTIVITY_ID = 8_800_000_000;

// Distance between track points. Garmin downsamples its polylines, and these
// spacings land at a few hundred points per activity — about what the real
// history carries, so the map and the frequency grid get the same input
// density they were tuned against.
const POINT_SPACING_M: Record<ActivityKind, number> = { walk: 25, run: 30, bike: 45 };

// Metres of side-to-side wander around the road centreline the route follows.
// Real traces scatter by this much between passes, and the frequency layer's
// 30 m grid is sized to merge exactly that — a perfectly repeated path would be
// an unrealistically easy case for it.
const GPS_JITTER_M = 4;

const METERS_PER_DEG_LAT = 111_320;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The real streets and paths each route follows, produced by
 * `npm run snap-routes` and committed alongside this file. Read at runtime
 * rather than imported so this stays a plain Node script.
 */
const ROUTE_GEOMETRY: Record<string, [number, number][]> = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "demoRouteGeometry.json"), "utf8"),
);

function geometryFor(route: DemoRoute): [number, number][] {
  const curve = ROUTE_GEOMETRY[route.id];
  if (!curve) throw new Error(`No snapped geometry for "${route.id}" — run \`npm run snap-routes\``);
  return curve;
}

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  private next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  float(): number {
    return this.next();
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  /** Standard normal, via Box-Muller. */
  gauss(): number {
    const u = Math.max(this.next(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
  }

  weighted<T extends { weight: number }>(items: T[]): T {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let target = this.next() * total;
    for (const item of items) {
      target -= item.weight;
      if (target <= 0) return item;
    }
    return items[items.length - 1];
  }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function lngScale(lat: number): number {
  return METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

function metresBetween(a: [number, number], b: [number, number]): number {
  const dLat = (b[0] - a[0]) * METERS_PER_DEG_LAT;
  const dLng = (b[1] - a[1]) * lngScale((a[0] + b[0]) / 2);
  return Math.hypot(dLat, dLng);
}

/**
 * Walks `targetMeters` around a closed curve at even spacing, wrapping past the
 * start if the target is longer than one lap — which is how a route gets walked
 * "one and a bit times" on a day with more time.
 */
function resampleLoop(curve: [number, number][], targetMeters: number, spacingM: number): [number, number][] {
  const steps = Math.max(2, Math.round(targetMeters / spacingM));
  const lapMeters = curve.reduce(
    (sum, point, i) => sum + metresBetween(point, curve[(i + 1) % curve.length]),
    0,
  );
  const stride = targetMeters / steps;

  const points: [number, number][] = [curve[0]];
  let index = 0;
  let carried = 0; // metres already covered along the segment starting at `index`
  for (let step = 0; step < steps; step++) {
    let remaining = stride;
    for (;;) {
      const from = curve[index % curve.length];
      const to = curve[(index + 1) % curve.length];
      const segment = metresBetween(from, to);
      if (carried + remaining < segment) {
        carried += remaining;
        const t = carried / segment;
        points.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
        break;
      }
      remaining -= segment - carried;
      carried = 0;
      index += 1;
    }
  }
  // A target longer than the loop is fine (extra laps); a curve of zero length
  // would spin forever, and only a malformed route could produce one.
  if (lapMeters <= 0) throw new Error("degenerate route");
  return points;
}

/**
 * Adds GPS wander as a smoothed random walk rather than independent per-point
 * noise: consecutive samples of a real trace drift together, and independent
 * noise would produce a visibly fuzzy line instead of a slightly wrong one.
 */
function addJitter(points: [number, number][], rng: Rng): [number, number][] {
  let offLat = 0;
  let offLng = 0;
  return points.map(([lat, lng]) => {
    offLat = offLat * 0.9 + rng.gauss() * GPS_JITTER_M * 0.45;
    offLng = offLng * 0.9 + rng.gauss() * GPS_JITTER_M * 0.45;
    return [lat + offLat / METERS_PER_DEG_LAT, lng + offLng / lngScale(lat)] as [number, number];
  });
}

// Smooth pseudo-terrain, on a wavelength of a couple of kilometres. Copenhagen
// is flat, and this keeps a walk's total climb in the tens of metres rather
// than inventing an alpine profile out of high-frequency noise.
function elevationAt(lat: number, lng: number): number {
  return 14 + 7 * Math.sin(lat * 260) + 5 * Math.cos(lng * 200) + 3 * Math.sin(lat * 90 + lng * 70);
}

// ---------------------------------------------------------------------------
// Time zones
// ---------------------------------------------------------------------------

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneOffsetMs(instant: number, timeZone: string): number {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    zoneFormatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant;
}

/**
 * Turns a wall-clock time in a zone into the UTC instant it names. Two passes,
 * because the offset to apply depends on the instant being solved for — one
 * correction is enough everywhere outside the hour a DST change lands in.
 */
function utcFromLocal(fields: { y: number; m: number; d: number; h: number; min: number }, timeZone: string): number {
  const naive = Date.UTC(fields.y, fields.m, fields.d, fields.h, fields.min, 0);
  let instant = naive - zoneOffsetMs(naive, timeZone);
  instant = naive - zoneOffsetMs(instant, timeZone);
  return instant;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// One activity
// ---------------------------------------------------------------------------

interface ActivityContext {
  route: DemoRoute;
  local: { y: number; m: number; d: number; h: number; min: number };
  /** Usually the route's own type; walking routes are also run. */
  type: ActivityKind;
  /** 0 at the start of the history, 1 at its end — drives the fitness trend. */
  progress: number;
  garminActivityId: number;
}

// Everyday pace, before fitness, season and per-day variation.
const BASE_SPEED_MPS: Record<ActivityKind, number> = { walk: 1.36, run: 2.95, bike: 5.1 };
// Metres covered between stops (a crossing, a junction, a photo), how much
// speed a gradient costs, and how many beats it buys.
const METERS_PER_STOP: Record<ActivityKind, number> = { walk: 750, run: 1100, bike: 1400 };
const GRADE_SPEED_PENALTY: Record<ActivityKind, number> = { walk: 3, run: 5, bike: 8 };
const GRADE_HR_COST: Record<ActivityKind, number> = { walk: 260, run: 380, bike: 420 };
// Heart rate as a line through pace: `base` bpm at `refKmh`, moving by
// `perKmh` either side of it.
const HR_MODEL: Record<ActivityKind, { base: number; perKmh: number; refKmh: number }> = {
  walk: { base: 95, perKmh: 9, refKmh: 5 },
  run: { base: 150, perKmh: 6, refKmh: 10.6 },
  bike: { base: 105, perKmh: 2.2, refKmh: 18 },
};
// Cadence the same way, hinged on that kind's everyday pace: steps per minute
// on foot, crank revolutions on a bike.
const CADENCE_MODEL: Record<ActivityKind, { base: number; perMps: number }> = {
  walk: { base: 108, perMps: 26 },
  run: { base: 168, perMps: 6 },
  bike: { base: 76, perMps: 2.4 },
};
const CALORIES_PER_MIN: Record<ActivityKind, number> = { walk: 4.6, run: 11.5, bike: 8.4 };
const ACTIVITY_NAME: Record<ActivityKind, string> = { walk: "Walking", run: "Running", bike: "Cycling" };
// How much faster the same effort goes by the end of the history.
const FITNESS_SPEED_GAIN = 0.05;
// And how many fewer beats per minute that pace costs by then.
const FITNESS_HR_DROP_BPM = 7;

function buildActivity(ctx: ActivityContext, rng: Rng): { activity: NormalizedActivity; streams: ActivityStreams } {
  const { route, type, local, progress } = ctx;

  const startMs = utcFromLocal(local, route.place.timezone);
  // Northern-hemisphere summer: more daylight, faster, and hotter — the last of
  // which raises heart rate on its own, which is a caveat the statistics tab
  // explicitly calls out, so the data had better contain it.
  const seasonal = Math.sin(((local.m + local.d / 30 - 3) / 12) * 2 * Math.PI);

  const curve = geometryFor(route);
  const lapMeters = curve.reduce((sum, p, i) => sum + metresBetween(p, curve[(i + 1) % curve.length]), 0);
  const targetMeters = lapMeters * rng.range(0.78, 1.22);
  const points = addJitter(resampleLoop(curve, targetMeters, POINT_SPACING_M[type]), rng);

  const dayFactor = 1 + rng.gauss() * 0.07;
  const speedTarget =
    BASE_SPEED_MPS[type] * dayFactor * (1 + FITNESS_SPEED_GAIN * progress) * (1 + 0.03 * seasonal);

  // Stopping every so often is what makes moving time differ from elapsed.
  const metersPerStop = METERS_PER_STOP[type];
  const hrOffset = rng.gauss() * 3 - FITNESS_HR_DROP_BPM * progress + 4 * Math.max(seasonal, 0);

  const streams: ActivityStreams = { t_s: [], distance_m: [], speed_mps: [], hr_bpm: [], elevation_m: [], cadence_spm: [] };

  let elapsedS = 0;
  let movingS = 0;
  let stoppedS = 0;
  let distanceM = 0;
  let speedWander = 0;
  // Heart rate is carried across samples and eased toward its target, because
  // it lags effort by a minute or two — the whole reason the heart-rate/pace
  // chart drops each activity's first five minutes.
  let hr = HR_MODEL[type].base - 7 + hrOffset;

  for (let i = 0; i < points.length; i++) {
    const step = i === 0 ? 0 : metresBetween(points[i - 1], points[i]);
    const grade =
      i === 0 || step === 0 ? 0 : (elevationAt(...points[i]) - elevationAt(...points[i - 1])) / step;

    speedWander = speedWander * 0.85 + rng.gauss() * 0.15;
    // Climbing costs speed and buys heart rate; both scale with the gradient.
    const speed = Math.max(0.4, speedTarget * (1 + speedWander * 0.12 - grade * GRADE_SPEED_PENALTY[type]));

    const stopped = i > 0 && rng.float() < step / metersPerStop;
    const stopS = stopped ? rng.range(15, 55) : 0;
    const movingStepS = step / speed;

    elapsedS += movingStepS + stopS;
    movingS += movingStepS;
    stoppedS += stopS;
    distanceM += step;

    const hrTarget =
      HR_MODEL[type].base + HR_MODEL[type].perKmh * (speed * 3.6 - HR_MODEL[type].refKmh) +
      hrOffset +
      grade * GRADE_HR_COST[type] +
      // Cardiac drift: the same pace costs a little more the longer it goes on.
      (elapsedS / 60) * 0.06;
    // Ease toward the target with a ~50 s time constant, then add sensor noise.
    hr += (hrTarget - hr) * Math.min(1, (movingStepS + stopS) / 50);

    streams.t_s.push(Math.round(elapsedS));
    streams.distance_m.push(Math.round(distanceM));
    streams.speed_mps.push(stopped ? 0 : Math.round(speed * 100) / 100);
    streams.hr_bpm.push(Math.round(hr + rng.gauss() * 1.6));
    streams.elevation_m.push(Math.round(elevationAt(...points[i]) * 10) / 10);
    streams.cadence_spm.push(
      Math.round(
        stopped
          ? 0
          : CADENCE_MODEL[type].base +
            (speed - BASE_SPEED_MPS[type]) * CADENCE_MODEL[type].perMps +
            rng.gauss() * (type === "bike" ? 3 : 2),
      ),
    );
  }

  const hrValues = streams.hr_bpm.filter((v): v is number => v !== null);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < streams.elevation_m.length; i++) {
    const delta = (streams.elevation_m[i] ?? 0) - (streams.elevation_m[i - 1] ?? 0);
    if (delta > 0) gain += delta;
    else loss -= delta;
  }

  // Garmin's timer duration sits between moving and elapsed: auto-pause drops
  // the longer stops but not the brief ones.
  const durationS = Math.round(movingS + stoppedS * 0.55);
  const steps =
    type === "bike"
      ? null
      : Math.round(streams.cadence_spm.reduce<number>((sum, c, i) => {
          const dt = i === 0 ? 0 : streams.t_s[i] - streams.t_s[i - 1];
          return sum + ((c ?? 0) * dt) / 60;
        }, 0));

  const zoneBounds = [105, 125, 145, 165];
  const zones = [0, 0, 0, 0, 0];
  let moderateS = 0;
  let vigorousS = 0;
  for (let i = 1; i < hrValues.length; i++) {
    const dt = streams.t_s[i] - streams.t_s[i - 1];
    const beat = streams.hr_bpm[i] ?? 0;
    const zone = zoneBounds.findIndex((bound) => beat < bound);
    zones[zone === -1 ? 4 : zone] += dt;
    if (beat >= 125) vigorousS += dt;
    else if (beat >= 100) moderateS += dt;
  }

  const activity: NormalizedActivity = {
    garmin_activity_id: ctx.garminActivityId,
    name: `${route.place.name} ${ACTIVITY_NAME[type]}`,
    type,
    start_time: new Date(startMs).toISOString(),
    start_time_local: `${local.y}-${pad(local.m + 1)}-${pad(local.d)}T${pad(local.h)}:${pad(local.min)}:00`,
    timezone_id: route.place.timezone,
    location_name: route.place.name,
    distance_m: Math.round(distanceM * 100) / 100,
    duration_s: durationS,
    moving_duration_s: Math.round(movingS),
    elapsed_duration_s: Math.round(elapsedS),
    avg_speed_mps: Math.round((distanceM / durationS) * 1000) / 1000,
    max_speed_mps: Math.round(Math.max(...streams.speed_mps) * 1000) / 1000,
    avg_hr: Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length),
    max_hr: Math.max(...hrValues),
    elevation_gain_m: Math.round(gain * 10) / 10,
    elevation_loss_m: Math.round(loss * 10) / 10,
    min_elevation_m: Math.round(Math.min(...streams.elevation_m.map((v) => v ?? 0)) * 10) / 10,
    max_elevation_m: Math.round(Math.max(...streams.elevation_m.map((v) => v ?? 0)) * 10) / 10,
    calories: Math.round((durationS / 60) * CALORIES_PER_MIN[type] * rng.range(0.94, 1.06)),
    steps,
    avg_cadence_spm:
      Math.round((streams.cadence_spm.reduce<number>((sum, c) => sum + (c ?? 0), 0) / streams.cadence_spm.length) * 10) /
      10,
    max_cadence_spm: Math.max(...streams.cadence_spm.map((v) => v ?? 0)),
    avg_stride_length_cm: steps ? Math.round(((distanceM * 100) / steps) * 10) / 10 : null,
    moderate_intensity_min: Math.round(moderateS / 60),
    vigorous_intensity_min: Math.round(vigorousS / 60),
    hr_time_in_zone_s: zones.map((s) => Math.round(s)),
    start_lat: points[0][0],
    start_lng: points[0][1],
    end_lat: points[points.length - 1][0],
    end_lng: points[points.length - 1][1],
    points: points.map(([lat, lng]) => [
      Math.round(lat * 1e6) / 1e6,
      Math.round(lng * 1e6) / 1e6,
    ]),
  };

  return { activity, streams };
}

// ---------------------------------------------------------------------------
// The history
// ---------------------------------------------------------------------------

/** Time of day an activity starts, in local wall-clock hours. */
const START_HOUR_RANGE: Record<ActivityKind, { weekend: [number, number]; weekday: [number, number] }> = {
  walk: { weekend: [10, 16], weekday: [17, 20] },
  // Runs go out before the day starts, or straight after work.
  run: { weekend: [8, 11], weekday: [17, 19.5] },
  bike: { weekend: [9, 13], weekday: [16.5, 19] },
};

function startHour(type: ActivityKind, isWeekend: boolean, rng: Rng): { h: number; min: number } {
  const [from, to] = START_HOUR_RANGE[type][isWeekend ? "weekend" : "weekday"];
  const hour = rng.range(from, to);
  return { h: Math.floor(hour), min: Math.floor((hour % 1) * 60) };
}

export function generateDemoHistory(): { activity: NormalizedActivity; streams: ActivityStreams }[] {
  const rng = new Rng(SEED);
  const out: { activity: NormalizedActivity; streams: ActivityStreams }[] = [];

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - HISTORY_DAYS);

  const tripRouteFor = (dayOffset: number): DemoRoute[] | null => {
    const trip = TRIPS.find(
      (t) => dayOffset >= t.startDayOffset && dayOffset < t.startDayOffset + t.lengthDays,
    );
    return trip ? trip.routes : null;
  };

  // Whether yesterday was active feeds into today, so the calendar heatmap
  // shows runs of consecutive days and the odd fallow week, instead of the
  // even scatter that independent coin flips would give.
  let wasActive = true;

  for (let dayOffset = 0; dayOffset <= HISTORY_DAYS; dayOffset++) {
    const day = new Date(start);
    day.setDate(day.getDate() + dayOffset);
    const month = day.getMonth();
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const progress = dayOffset / HISTORY_DAYS;

    const tripRoutes = tripRouteFor(dayOffset);
    // Light and weather: summer days get walked far more than January ones.
    const seasonal = 0.13 * Math.sin(((month + day.getDate() / 30 - 3) / 12) * 2 * Math.PI);
    const activeChance = tripRoutes ? 0.95 : (wasActive ? 0.78 : 0.5) + seasonal;

    if (rng.float() > activeChance) {
      wasActive = false;
      continue;
    }
    wasActive = true;

    const count = rng.float() < (tripRoutes ? 0.45 : isWeekend ? 0.25 : 0.12) ? 2 : 1;
    for (let n = 0; n < count; n++) {
      const pool = tripRoutes ?? HOME_ROUTES;
      // Bikes are a weekend and summer thing; walks and runs happen whenever.
      const wantBike = rng.float() < 0.22 + (isWeekend ? 0.14 : 0) + Math.max(seasonal, 0);
      const candidates = pool.filter((r) => (wantBike ? r.type === "bike" : r.type === "walk"));
      const route = rng.weighted(candidates.length > 0 ? candidates : pool);
      // Runs follow the same pedestrian network as walks, so they reuse the
      // walking routes rather than needing snapped geometry of their own.
      const type: ActivityKind = route.type === "walk" && rng.float() < RUN_SHARE ? "run" : route.type;

      const { h, min } = startHour(type, isWeekend, rng);
      out.push(
        buildActivity(
          {
            route,
            type,
            local: { y: day.getFullYear(), m: month, d: day.getDate(), h: h + n * 3, min },
            progress,
            garminActivityId: FIRST_ACTIVITY_ID + out.length,
          },
          rng,
        ),
      );
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Daily wellness metrics
// ---------------------------------------------------------------------------

// Steps taken over an ordinary day with no activity recorded — commuting,
// shopping, pacing around the flat.
const BASE_DAILY_STEPS: [number, number] = [2800, 5400];
// Resting heart rate at the start of the history and how far the two years of
// training pull it down; HRV moves the other way.
const RESTING_HR_START = 58;
const RESTING_HR_FITNESS_DROP = 6;
const HRV_START_MS = 46;
const HRV_FITNESS_GAIN_MS = 11;
// How far the waking average heart rate sits above the resting one on a day
// with nothing recorded, and how much a full day's training adds on top. The
// gap is this wide because sleep is excluded: it is a day's average, not a
// day-and-night one.
const WAKING_HR_OVER_RESTING = 22;
const WAKING_HR_PER_LOAD = 6;
// The watch that records overnight HRV was bought a year into the history, so
// that chart starts a year later than the others — which is what Garmin data
// actually looks like, and gives the leading gap something to render.
const HRV_HISTORY_DAYS = 365;

/**
 * Day-level wellness figures to match the generated history.
 *
 * Derived from the activities rather than invented beside them: the all-day
 * step count is the day's recorded activity steps plus ordinary daily-life
 * walking, so the total can never come out below what the activities alone
 * already account for. Yesterday's training load leaks into today's resting
 * heart rate and HRV, because that lag is the whole reason the charts are
 * worth looking at.
 */
export function generateDemoDailyMetrics(
  history: { activity: NormalizedActivity; streams: ActivityStreams }[],
): DailyMetric[] {
  const rng = new Rng(SEED + 1);

  const stepsByDate = new Map<string, number>();
  const movingMinutesByDate = new Map<string, number>();
  for (const { activity } of history) {
    const date = (activity.start_time_local ?? activity.start_time).slice(0, 10);
    stepsByDate.set(date, (stepsByDate.get(date) ?? 0) + (activity.steps ?? 0));
    movingMinutesByDate.set(date, (movingMinutesByDate.get(date) ?? 0) + activity.moving_duration_s / 60);
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - HISTORY_DAYS);

  const metrics: DailyMetric[] = [];
  let yesterdayLoad = 0;

  for (let dayOffset = 0; dayOffset <= HISTORY_DAYS; dayOffset++) {
    const day = new Date(start);
    day.setDate(day.getDate() + dayOffset);
    const date = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    const progress = dayOffset / HISTORY_DAYS;

    // A hard day yesterday costs a few beats and some variability today.
    const load = Math.min((movingMinutesByDate.get(date) ?? 0) / 90, 1.5);
    const restingHr =
      RESTING_HR_START - RESTING_HR_FITNESS_DROP * progress + yesterdayLoad * 1.6 + rng.gauss() * 1.2;
    const hrv = HRV_START_MS + HRV_FITNESS_GAIN_MS * progress - yesterdayLoad * 3.4 + rng.gauss() * 4;
    // Today's own training shows up here, where yesterday's showed up above:
    // an average over the waking day follows what the day was spent doing.
    const wakingHr = restingHr + WAKING_HR_OVER_RESTING + load * WAKING_HR_PER_LOAD + rng.gauss() * 1.5;
    yesterdayLoad = load;

    metrics.push({
      calendar_date: date,
      total_steps: Math.round((stepsByDate.get(date) ?? 0) + rng.range(...BASE_DAILY_STEPS)),
      resting_hr: Math.round(restingHr),
      waking_avg_hr: Math.round(wakingHr),
      hrv_last_night_avg:
        dayOffset >= HISTORY_DAYS - HRV_HISTORY_DAYS ? Math.round(Math.max(20, hrv)) : null,
    });
  }

  return metrics;
}
