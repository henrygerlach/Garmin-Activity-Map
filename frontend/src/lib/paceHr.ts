import type { Activity, ActivityKind, PaceHrStream } from "../types";
import { findHighSpeedOutlierIds, type SeriesPoint, type WeekBucket } from "./stats";

// ---------------------------------------------------------------------------
// Efficiency index — distance covered per heartbeat
// ---------------------------------------------------------------------------

/**
 * Metres travelled per heartbeat: distance divided by the number of beats spent
 * moving. Rising over time means the same ground is being covered for less
 * cardiac work, which is the single-number version of "getting fitter".
 *
 * Uses moving time rather than elapsed, to match the moving speed shown
 * everywhere else — time spent standing at a crossing still costs beats, but
 * counting it would make the figure depend mostly on traffic lights.
 */
export function metresPerBeat(activity: Activity): number | null {
  if (activity.avg_hr === null || activity.avg_hr <= 0) return null;
  if (activity.moving_duration_s <= 0) return null;
  const beats = activity.avg_hr * (activity.moving_duration_s / 60);
  return activity.distance_m / beats;
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function computeWeeklyEfficiency(
  buckets: WeekBucket[],
  activities: Activity[],
  type: ActivityKind,
): SeriesPoint[] {
  const ofType = activities.filter((a) => a.type === type);
  // The same GPS glitches that inflate speed inflate metres-per-beat, and for
  // the same reason: distance the activity never actually covered.
  const outlierIds = findHighSpeedOutlierIds(ofType);

  return buckets.map((bucket) => {
    const values = ofType
      .filter((a) => {
        if (outlierIds.has(a.id)) return false;
        const t = new Date(a.start_time);
        return t >= bucket.weekStart && t < bucket.weekEnd;
      })
      .map(metresPerBeat)
      .filter((v): v is number => v !== null);
    const avg = average(values);
    return { label: bucket.label, value: avg === null ? null : Math.round(avg * 1000) / 1000 };
  });
}

const TREND_WINDOW_DAYS = 30;

export interface EfficiencyTrend {
  /** Mean metres per beat over the most recent 30 days of logging. */
  current: number | null;
  /** Percentage change against the first 30 days, or null if too little history. */
  changePct: number | null;
}

/**
 * Compares the newest 30 days of logging against the oldest 30. Anchored to the
 * first and last logged activity rather than to today, so a pause in syncing
 * doesn't quietly empty the recent window.
 */
export function computeEfficiencyTrend(activities: Activity[], type: ActivityKind): EfficiencyTrend {
  const ofType = activities.filter((a) => a.type === type);
  const outlierIds = findHighSpeedOutlierIds(ofType);

  const samples = ofType
    .filter((a) => !outlierIds.has(a.id))
    .map((a) => ({ time: new Date(a.start_time).getTime(), value: metresPerBeat(a) }))
    .filter((s): s is { time: number; value: number } => s.value !== null)
    .sort((a, b) => a.time - b.time);

  if (samples.length === 0) return { current: null, changePct: null };

  const windowMs = TREND_WINDOW_DAYS * 86_400_000;
  const firstTime = samples[0].time;
  const lastTime = samples[samples.length - 1].time;

  const recent = average(samples.filter((s) => s.time > lastTime - windowMs).map((s) => s.value));
  const earliest = average(samples.filter((s) => s.time < firstTime + windowMs).map((s) => s.value));

  // Windows that overlap would be comparing a stretch of history against
  // itself, so a change figure only means something once there are two of them.
  const hasTwoWindows = lastTime - firstTime >= 2 * windowMs;

  return {
    current: recent,
    changePct:
      hasTwoWindows && recent !== null && earliest !== null && earliest > 0
        ? ((recent - earliest) / earliest) * 100
        : null,
  };
}

// ---------------------------------------------------------------------------
// Heart rate against pace
// ---------------------------------------------------------------------------

// Heart rate takes a few minutes to catch up with effort at the start of an
// activity. Those samples pair a real pace with a heart rate that hasn't
// arrived yet, so including them would drag every band down by an amount that
// depends on how much of the activity was warm-up — which for these mostly
// half-hour walks is a lot.
const WARMUP_EXCLUDED_S = 300;

// Guards against sensor dropouts reading as a real pulse.
const HR_MIN_BPM = 40;
const HR_MAX_BPM = 220;

// Bands are wide enough to hold a meaningful sample count and narrow enough to
// show the curve's shape; the bounds cut off paces that aren't really the
// activity (standing still, or a GPS jump).
const BANDS: Record<ActivityKind, { stepKmh: number; minKmh: number; maxKmh: number }> = {
  walk: { stepKmh: 0.25, minKmh: 2, maxKmh: 8 },
  bike: { stepKmh: 1, minKmh: 8, maxKmh: 34 },
};

// A band needs this many samples within a period before that period gets a
// point there — otherwise the ends of the curve wander on a handful of samples.
const MIN_SAMPLES_PER_BAND = 60;
// And this many across all periods before the band is drawn at all.
const MIN_SAMPLES_PER_BAND_TOTAL = 300;

export interface HrPaceCurve {
  /** Shared x-axis: the pace band labels, in km/h. */
  bandLabels: string[];
  /** One entry per period, oldest first, each aligned to `bandLabels`. */
  series: { name: string; data: SeriesPoint[] }[];
}

const QUARTER_MONTHS = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"];

function quarterOf(date: Date): { key: number; label: string } {
  const quarter = Math.floor(date.getMonth() / 3);
  return {
    key: date.getFullYear() * 4 + quarter,
    label: `${QUARTER_MONTHS[quarter]} ${date.getFullYear()}`,
  };
}

/**
 * Bins every sensor sample by the pace it was recorded at and averages the
 * heart rate within each bin, one curve per calendar quarter.
 *
 * Reading it: a curve sitting lower than an earlier one means that pace now
 * costs fewer beats per minute — an aerobic improvement — while a curve shifted
 * right means the same heart rate now buys more speed. It is the honest version
 * of "am I getting fitter", because it compares like with like instead of
 * averaging together a flat stroll and a brisk climb.
 *
 * Samples are weighted equally rather than per activity, so a long outing
 * contributes proportionally more than a short one.
 */
export function computeHrPaceCurve(
  activities: Activity[],
  streams: PaceHrStream[],
  type: ActivityKind,
): HrPaceCurve {
  const { stepKmh, minKmh, maxKmh } = BANDS[type];
  const bandCount = Math.round((maxKmh - minKmh) / stepKmh);

  const periodOf = new Map<number, { key: number; label: string }>();
  for (const activity of activities) {
    if (activity.type !== type) continue;
    periodOf.set(activity.garmin_activity_id, quarterOf(new Date(activity.start_time)));
  }

  // [periodKey][bandIndex] -> running mean of heart rate
  const totals = new Map<number, { hrSum: number[]; count: number[] }>();
  const bandTotals = new Array<number>(bandCount).fill(0);

  for (const stream of streams) {
    const period = periodOf.get(stream.garmin_activity_id);
    if (!period) continue;

    let bucket = totals.get(period.key);
    if (!bucket) {
      bucket = { hrSum: new Array(bandCount).fill(0), count: new Array(bandCount).fill(0) };
      totals.set(period.key, bucket);
    }

    for (let i = 0; i < stream.speed_mps.length; i++) {
      if (stream.t_s[i] < WARMUP_EXCLUDED_S) continue;

      const hr = stream.hr_bpm[i];
      if (hr === null || hr < HR_MIN_BPM || hr > HR_MAX_BPM) continue;

      const kmh = stream.speed_mps[i] * 3.6;
      const band = Math.floor((kmh - minKmh) / stepKmh);
      if (band < 0 || band >= bandCount) continue;

      bucket.hrSum[band] += hr;
      bucket.count[band] += 1;
      bandTotals[band] += 1;
    }
  }

  const visibleBands: number[] = [];
  for (let band = 0; band < bandCount; band++) {
    if (bandTotals[band] >= MIN_SAMPLES_PER_BAND_TOTAL) visibleBands.push(band);
  }
  if (visibleBands.length === 0) return { bandLabels: [], series: [] };

  const bandLabels = visibleBands.map((band) => (minKmh + band * stepKmh).toFixed(1));

  const periods = [...new Set([...periodOf.values()].map((p) => p.key))].sort((a, b) => a - b);
  const labelForKey = new Map([...periodOf.values()].map((p) => [p.key, p.label]));

  const series = periods
    .map((key) => {
      const bucket = totals.get(key);
      const data: SeriesPoint[] = visibleBands.map((band, i) => {
        const count = bucket?.count[band] ?? 0;
        return {
          label: bandLabels[i],
          value: count >= MIN_SAMPLES_PER_BAND ? Math.round(bucket!.hrSum[band] / count) : null,
        };
      });
      return { name: labelForKey.get(key) ?? "", data };
    })
    // A quarter with only a handful of activities produces a line of two or
    // three disconnected dots, which reads as noise rather than a curve.
    .filter((s) => s.data.filter((p) => p.value !== null).length >= 3);

  return { bandLabels, series };
}
