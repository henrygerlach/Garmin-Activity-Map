import type { Activity, ActivityKind } from "../types";
import { movingSpeedMps } from "./format";

export interface Bucket {
  label: string;
  value: number;
}

// `value` is null for weeks with no matching activity — a progression line
// should show a gap there, not drop to zero.
export interface SeriesPoint {
  label: string;
  value: number | null;
}

export interface WeekBucket {
  label: string;
  weekStart: Date;
  weekEnd: Date;
}

export interface DayActivity {
  date: Date;
  distanceM: number;
  count: number;
}

// One entry per calendar day from the earliest activity through today
// (inclusive of zero-activity days) — the full range a calendar heatmap needs
// to draw a contiguous grid.
export function computeDailyActivity(activities: Activity[]): DayActivity[] {
  if (activities.length === 0) return [];

  const byDay = new Map<string, { distanceM: number; count: number }>();
  for (const activity of activities) {
    const key = new Date(activity.start_time).toDateString();
    const existing = byDay.get(key) ?? { distanceM: 0, count: 0 };
    existing.distanceM += activity.distance_m;
    existing.count += 1;
    byDay.set(key, existing);
  }

  const earliestTime = Math.min(...activities.map((a) => new Date(a.start_time).getTime()));
  const cursor = new Date(earliestTime);
  cursor.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: DayActivity[] = [];
  while (cursor <= today) {
    const entry = byDay.get(cursor.toDateString());
    days.push({ date: new Date(cursor), distanceM: entry?.distanceM ?? 0, count: entry?.count ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export interface Summary {
  totalActivities: number;
  totalWalkDistanceM: number;
  totalBikeDistanceM: number;
  totalMovingSeconds: number;
  currentStreakDays: number;
  longestWalkM: number;
  longestBikeM: number;
  avgHr: number | null;
}

export function computeSummary(activities: Activity[]): Summary {
  let totalWalkDistanceM = 0;
  let totalBikeDistanceM = 0;
  let totalMovingSeconds = 0;
  let longestWalkM = 0;
  let longestBikeM = 0;
  let hrSum = 0;
  let hrCount = 0;

  for (const activity of activities) {
    totalMovingSeconds += activity.moving_duration_s;
    if (activity.type === "walk") {
      totalWalkDistanceM += activity.distance_m;
      longestWalkM = Math.max(longestWalkM, activity.distance_m);
    } else {
      totalBikeDistanceM += activity.distance_m;
      longestBikeM = Math.max(longestBikeM, activity.distance_m);
    }
    if (activity.avg_hr !== null) {
      hrSum += activity.avg_hr;
      hrCount += 1;
    }
  }

  return {
    totalActivities: activities.length,
    totalWalkDistanceM,
    totalBikeDistanceM,
    totalMovingSeconds,
    currentStreakDays: computeCurrentStreakDays(activities),
    longestWalkM,
    longestBikeM,
    avgHr: hrCount > 0 ? hrSum / hrCount : null,
  };
}

// Consecutive calendar days with at least one activity, counted backward from
// the most recently logged day (not necessarily "today").
export function computeCurrentStreakDays(activities: Activity[]): number {
  if (activities.length === 0) return 0;

  const dayKeys = new Set(activities.map((a) => new Date(a.start_time).toDateString()));
  const days = [...dayKeys].map((key) => new Date(key)).sort((a, b) => b.getTime() - a.getTime());

  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const diffDays = Math.round((days[i - 1].getTime() - days[i].getTime()) / 86_400_000);
    if (diffDays === 1) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

// One bucket per ISO week (Mon-Sun) from the week of the earliest activity
// through the current week — the full logging history, not a fixed window.
export function computeWeekBuckets(activities: Activity[]): WeekBucket[] {
  if (activities.length === 0) return [];

  const earliestTime = Math.min(...activities.map((a) => new Date(a.start_time).getTime()));
  const firstWeekStart = startOfWeek(new Date(earliestTime));
  const lastWeekStart = startOfWeek(new Date());

  const buckets: WeekBucket[] = [];
  const cursor = new Date(firstWeekStart);
  while (cursor <= lastWeekStart) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 7);
    buckets.push({
      label: weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      weekStart,
      weekEnd,
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  return buckets;
}

function activitiesInWeek(activities: Activity[], type: ActivityKind, bucket: WeekBucket): Activity[] {
  return activities.filter((a) => {
    if (a.type !== type) return false;
    const t = new Date(a.start_time);
    return t >= bucket.weekStart && t < bucket.weekEnd;
  });
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const OUTLIER_MODIFIED_Z_THRESHOLD = 3.5;
const MIN_SAMPLE_FOR_OUTLIER_CHECK = 5;

// Flags activities whose moving speed is anomalously HIGH relative to the
// rest of that activity type's history — e.g. GPS confusion walking indoors
// can make a short indoor loop look like it covered far more ground than it
// did, spiking the computed speed. Uses a MAD-based modified z-score
// (Iglewicz & Hoaglin) rather than a mean/stddev z-score: median and MAD are
// themselves resistant to the outliers being tested for, so a couple of bad
// readings can't drag the "normal" band out to cover themselves the way they
// would with a mean and standard deviation. Only the high tail is flagged —
// a slow walk is plausible on its own and isn't a sign of a GPS glitch.
function findHighSpeedOutlierIds(activities: Activity[]): Set<string> {
  const withSpeed = activities
    .map((a) => ({ id: a.id, speed: movingSpeedMps(a) }))
    .filter((x): x is { id: string; speed: number } => x.speed !== null);

  if (withSpeed.length < MIN_SAMPLE_FOR_OUTLIER_CHECK) return new Set();

  const speeds = withSpeed.map((x) => x.speed);
  const med = median(speeds);
  const mad = median(speeds.map((s) => Math.abs(s - med)));
  if (mad === 0) return new Set();

  const outlierIds = new Set<string>();
  for (const { id, speed } of withSpeed) {
    const modifiedZ = (0.6745 * (speed - med)) / mad;
    if (modifiedZ > OUTLIER_MODIFIED_Z_THRESHOLD) outlierIds.add(id);
  }
  return outlierIds;
}

export function computeWeeklyDistanceKm(buckets: WeekBucket[], activities: Activity[], type: ActivityKind): Bucket[] {
  return buckets.map((bucket) => {
    const distanceM = activitiesInWeek(activities, type, bucket).reduce((sum, a) => sum + a.distance_m, 0);
    return { label: bucket.label, value: Math.round((distanceM / 1000) * 10) / 10 };
  });
}

// Mean of each activity's moving speed (distance / moving_duration_s) within
// the week — moving speed rather than raw average, so traffic-light stops on
// a bike ride don't drag the number down.
export function computeWeeklyAvgSpeedKmh(buckets: WeekBucket[], activities: Activity[], type: ActivityKind): SeriesPoint[] {
  const outlierIds = findHighSpeedOutlierIds(activities.filter((a) => a.type === type));

  return buckets.map((bucket) => {
    const speeds = activitiesInWeek(activities, type, bucket)
      .filter((a) => !outlierIds.has(a.id))
      .map((a) => movingSpeedMps(a))
      .filter((v): v is number => v !== null)
      .map((v) => v * 3.6);
    const avg = average(speeds);
    return { label: bucket.label, value: avg === null ? null : Math.round(avg * 10) / 10 };
  });
}

export function computeWeeklyAvgHr(buckets: WeekBucket[], activities: Activity[], type: ActivityKind): SeriesPoint[] {
  return buckets.map((bucket) => {
    const hrs = activitiesInWeek(activities, type, bucket)
      .map((a) => a.avg_hr)
      .filter((v): v is number => v !== null);
    const avg = average(hrs);
    return { label: bucket.label, value: avg === null ? null : Math.round(avg) };
  });
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function computeByDayOfWeek(activities: Activity[]): Bucket[] {
  const counts = new Array(7).fill(0);
  for (const activity of activities) {
    const jsDay = new Date(activity.start_time).getDay(); // 0 = Sunday
    const mondayFirstIndex = (jsDay + 6) % 7;
    counts[mondayFirstIndex] += 1;
  }
  return DAY_LABELS.map((label, i) => ({ label, value: counts[i] }));
}

export function computeByHourOfDay(activities: Activity[]): Bucket[] {
  const counts = new Array(24).fill(0);
  for (const activity of activities) {
    const hour = new Date(activity.start_time).getHours();
    counts[hour] += 1;
  }
  return counts.map((value, hour) => ({ label: String(hour), value }));
}
