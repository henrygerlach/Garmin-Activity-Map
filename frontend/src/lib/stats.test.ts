import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeActivity, makeDailyMetric } from "../test/fixtures";
import {
  computeByDayOfWeek,
  computeByHourOfDay,
  computeDailyActivity,
  computeSummary,
  computeWeekBuckets,
  computeWeeklyAvgHr,
  computeWeeklyAvgSpeedKmh,
  computeWeeklyDailyAvg,
  computeWeeklyDistanceKm,
  computeWeeklySteps,
  computeWellnessSummary,
  findHighSpeedOutlierIds,
} from "./stats";

describe("computeDailyActivity", () => {
  it("returns an empty array for no activities", () => {
    expect(computeDailyActivity([])).toEqual([]);
  });

  it("fills every day from the earliest activity through today, zero-filled", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-04T12:00:00Z"));
    const activities = [
      makeActivity({ start_time: "2026-01-01T08:00:00Z", distance_m: 1000 }),
      makeActivity({ start_time: "2026-01-01T18:00:00Z", distance_m: 500 }),
      makeActivity({ start_time: "2026-01-03T08:00:00Z", distance_m: 2000 }),
    ];
    const days = computeDailyActivity(activities);
    expect(days).toHaveLength(4); // Jan 1, 2, 3, 4
    expect(days[0]).toMatchObject({ distanceM: 1500, count: 2 });
    expect(days[1]).toMatchObject({ distanceM: 0, count: 0 });
    expect(days[2]).toMatchObject({ distanceM: 2000, count: 1 });
    expect(days[3]).toMatchObject({ distanceM: 0, count: 0 });
    vi.useRealTimers();
  });
});

describe("computeSummary", () => {
  it("aggregates totals and longest distance per activity type", () => {
    const activities = [
      makeActivity({ type: "walk", distance_m: 3000, moving_duration_s: 1000, elevation_gain_m: 10 }),
      makeActivity({ type: "walk", distance_m: 5000, moving_duration_s: 1500, elevation_gain_m: 20 }),
      makeActivity({ type: "run", distance_m: 8000, moving_duration_s: 2000, elevation_gain_m: null }),
    ];
    const summary = computeSummary(activities);
    expect(summary.totalActivities).toBe(3);
    expect(summary.totalDistanceM).toEqual({ walk: 8000, run: 8000, bike: 0 });
    expect(summary.longestM).toEqual({ walk: 5000, run: 8000, bike: 0 });
    expect(summary.totalMovingSeconds).toBe(4500);
    expect(summary.totalElevationGainM).toBe(30);
  });
});

describe("computeWeekBuckets", () => {
  it("returns an empty array with no activities", () => {
    expect(computeWeekBuckets([])).toEqual([]);
  });

  it("buckets from the Monday of the earliest activity through the current week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-19T12:00:00Z")); // a Monday
    // 2026-01-05 is a Monday.
    const activities = [makeActivity({ start_time: "2026-01-07T08:00:00Z" })];
    const buckets = computeWeekBuckets(activities);
    expect(buckets).toHaveLength(3);
    // Compared via local getters, not toISOString, since weekStart is built from
    // local date components.
    const localDate = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    expect(localDate(buckets[0].weekStart)).toBe("2026-1-5");
    expect(localDate(buckets[2].weekStart)).toBe("2026-1-19");
    vi.useRealTimers();
  });
});

describe("computeWeeklyDistanceKm / computeWeeklyAvgHr", () => {
  it("sums distance and averages heart rate per week, per type", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-05T12:00:00Z")); // Monday
    const activities = [
      makeActivity({ type: "walk", start_time: "2026-01-05T08:00:00Z", distance_m: 3000, avg_hr: 100 }),
      makeActivity({ type: "walk", start_time: "2026-01-06T08:00:00Z", distance_m: 2000, avg_hr: 120 }),
      makeActivity({ type: "run", start_time: "2026-01-05T08:00:00Z", distance_m: 10000, avg_hr: 150 }),
    ];
    const buckets = computeWeekBuckets(activities);
    const walkDistance = computeWeeklyDistanceKm(buckets, activities, "walk");
    expect(walkDistance).toEqual([{ label: buckets[0].label, value: 5 }]);

    const walkHr = computeWeeklyAvgHr(buckets, activities, "walk");
    expect(walkHr).toEqual([{ label: buckets[0].label, value: 110 }]);

    const bikeHr = computeWeeklyAvgHr(buckets, activities, "bike");
    expect(bikeHr).toEqual([{ label: buckets[0].label, value: null }]);
    vi.useRealTimers();
  });
});

describe("findHighSpeedOutlierIds", () => {
  it("returns an empty set below the minimum sample size", () => {
    const activities = [makeActivity({ id: "a", distance_m: 100000, moving_duration_s: 100 })];
    expect(findHighSpeedOutlierIds(activities).size).toBe(0);
  });

  it("flags an anomalously fast activity relative to its peers", () => {
    // Distances vary slightly (~1.5-1.8 m/s) so the peer group has a nonzero MAD.
    const normal = [4500, 4800, 4950, 5100, 5250, 5400].map((distance_m, i) =>
      makeActivity({ id: `n${i}`, distance_m, moving_duration_s: 3000 }),
    );
    const outlier = makeActivity({ id: "outlier", distance_m: 50000, moving_duration_s: 3000 }); // ~16.7 m/s
    const ids = findHighSpeedOutlierIds([...normal, outlier]);
    expect(ids.has("outlier")).toBe(true);
    expect(ids.has("n0")).toBe(false);
  });

  it("does not flag a slow activity", () => {
    const normal = [4500, 4800, 4950, 5100, 5250, 5400].map((distance_m, i) =>
      makeActivity({ id: `n${i}`, distance_m, moving_duration_s: 3000 }),
    );
    const slow = makeActivity({ id: "slow", distance_m: 100, moving_duration_s: 3000 });
    const ids = findHighSpeedOutlierIds([...normal, slow]);
    expect(ids.has("slow")).toBe(false);
  });
});

describe("computeWeeklyAvgSpeedKmh", () => {
  it("excludes flagged outliers from the weekly average", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-05T12:00:00Z"));
    const normal = [4500, 4800, 4950, 5100, 5250, 5400].map((distance_m, i) =>
      makeActivity({
        id: `n${i}`,
        type: "walk",
        start_time: "2026-01-05T08:00:00Z",
        distance_m,
        moving_duration_s: 3000,
      }),
    );
    const outlier = makeActivity({
      id: "outlier",
      type: "walk",
      start_time: "2026-01-05T08:00:00Z",
      distance_m: 50000,
      moving_duration_s: 3000,
    });
    const activities = [...normal, outlier];
    const buckets = computeWeekBuckets(activities);
    const speeds = computeWeeklyAvgSpeedKmh(buckets, activities, "walk");
    // Mean of the normal speeds only (4500..5400 m / 3000 s * 3.6), the outlier excluded.
    const expectedKmh = Math.round((normal.reduce((s, a) => s + a.distance_m, 0) / 6 / 3000) * 3.6 * 10) / 10;
    expect(speeds[0].value).toBe(expectedKmh);
    vi.useRealTimers();
  });
});

describe("computeByDayOfWeek", () => {
  it("buckets counts Monday-first", () => {
    const activities = [
      makeActivity({ start_time: "2026-01-05T08:00:00Z" }), // Monday
      makeActivity({ start_time: "2026-01-11T08:00:00Z" }), // Sunday
    ];
    const buckets = computeByDayOfWeek(activities);
    expect(buckets[0]).toEqual({ label: "Mon", value: 1 });
    expect(buckets[6]).toEqual({ label: "Sun", value: 1 });
  });
});

describe("computeByHourOfDay", () => {
  it("buckets counts by local hour", () => {
    const activities = [makeActivity({ start_time: "2026-01-05T08:00:00Z" })];
    const buckets = computeByHourOfDay(activities);
    const hour = new Date("2026-01-05T08:00:00Z").getHours();
    expect(buckets[hour].value).toBe(1);
    expect(buckets).toHaveLength(24);
  });
});

describe("computeWeeklySteps / computeWeeklyDailyAvg", () => {
  it("sums steps and averages a picked field per week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-05T12:00:00Z"));
    const metrics = [
      makeDailyMetric({ calendar_date: "2026-01-05", total_steps: 1000, resting_hr: 50 }),
      makeDailyMetric({ calendar_date: "2026-01-06", total_steps: 2000, resting_hr: 60 }),
    ];
    const buckets = computeWeekBuckets([makeActivity({ start_time: "2026-01-05T08:00:00Z" })]);
    expect(computeWeeklySteps(buckets, metrics)).toEqual([{ label: buckets[0].label, value: 3000 }]);
    expect(computeWeeklyDailyAvg(buckets, metrics, (m) => m.resting_hr)).toEqual([
      { label: buckets[0].label, value: 55 },
    ]);
    vi.useRealTimers();
  });

  it("leaves a gap for weeks with no matching metrics", () => {
    const buckets = [{ label: "wk", weekStart: new Date("2026-01-05"), weekEnd: new Date("2026-01-12") }];
    expect(computeWeeklyDailyAvg(buckets, [], (m) => m.resting_hr)).toEqual([{ label: "wk", value: null }]);
  });
});

describe("computeWellnessSummary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("sums steps and reports the latest and recent-average resting HR / HRV", () => {
    const metrics = [
      makeDailyMetric({ calendar_date: "2025-12-01", total_steps: 1000, resting_hr: 50, hrv_last_night_avg: 40 }),
      makeDailyMetric({ calendar_date: "2026-01-25", total_steps: 2000, resting_hr: 55, hrv_last_night_avg: 50 }),
      makeDailyMetric({ calendar_date: "2026-01-31", total_steps: 3000, resting_hr: 60, hrv_last_night_avg: null }),
    ];
    const summary = computeWellnessSummary(metrics);
    expect(summary.totalSteps).toBe(6000);
    expect(summary.latestRestingHr).toBe(60);
    // Latest non-null HRV, skipping the null on the most recent day.
    expect(summary.latestHrv).toBe(50);
    // Recent (last 30 days) average resting HR: (55 + 60) / 2 = 57.5 -> 58.
    expect(summary.avgRestingHr).toBe(58);
  });

  it("returns nulls when there is no data", () => {
    const summary = computeWellnessSummary([]);
    expect(summary).toEqual({
      totalSteps: 0,
      latestRestingHr: null,
      avgRestingHr: null,
      latestHrv: null,
      avgHrv: null,
    });
  });
});
