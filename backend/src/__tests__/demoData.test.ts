import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateDemoDailyMetrics, generateDemoHistory } from "../demoData.js";

// The generator's randomness is seeded, but its history window is anchored on
// `new Date()`, so a fixed system clock is what makes two calls comparable.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("generateDemoHistory", () => {
  it("is deterministic for a fixed clock", () => {
    const a = generateDemoHistory();
    const b = generateDemoHistory();
    expect(a).toEqual(b);
  });

  it("produces a plausible two-year history", () => {
    const history = generateDemoHistory();
    expect(history.length).toBeGreaterThan(300);

    for (const { activity, streams } of history) {
      expect(["walk", "run", "bike"]).toContain(activity.type);
      expect(activity.distance_m).toBeGreaterThan(0);
      expect(activity.duration_s).toBeGreaterThan(0);
      expect(activity.moving_duration_s).toBeGreaterThan(0);
      expect(activity.avg_hr).toBeGreaterThan(0);
      expect(activity.max_hr).toBeGreaterThanOrEqual(activity.avg_hr);
      expect(activity.points.length).toBeGreaterThan(1);
      expect(streams.t_s.length).toBe(activity.points.length);
      expect(streams.distance_m.length).toBe(activity.points.length);
      // Elapsed time within a sample run only ever grows.
      expect(streams.t_s[streams.t_s.length - 1]).toBeGreaterThanOrEqual(streams.t_s[0]);
      expect(activity.hr_time_in_zone_s).not.toBeNull();
      expect(activity.hr_time_in_zone_s).toHaveLength(5);
      if (activity.type === "bike") {
        expect(activity.steps).toBeNull();
        expect(activity.avg_stride_length_cm).toBeNull();
      } else {
        expect(activity.steps).toBeGreaterThan(0);
      }
      // garmin_activity_id is assigned by insertion order, so no two collide.
    }
    const ids = history.map((h) => h.activity.garmin_activity_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every activity a start time within the last HISTORY_DAYS window", () => {
    const history = generateDemoHistory();
    const now = Date.now();
    const historyMs = 731 * 86_400_000;
    for (const { activity } of history) {
      const t = new Date(activity.start_time).getTime();
      expect(t).toBeLessThanOrEqual(now);
      expect(t).toBeGreaterThanOrEqual(now - historyMs);
    }
  });
});

describe("generateDemoDailyMetrics", () => {
  it("is deterministic for a fixed clock and history", () => {
    const history = generateDemoHistory();
    const a = generateDemoDailyMetrics(history);
    const b = generateDemoDailyMetrics(history);
    expect(a).toEqual(b);
  });

  it("covers one row per day of history, oldest first", () => {
    const history = generateDemoHistory();
    const metrics = generateDemoDailyMetrics(history);
    expect(metrics.length).toBe(731);
    const sorted = [...metrics].sort((a, b) => a.calendar_date.localeCompare(b.calendar_date));
    expect(metrics).toEqual(sorted);
  });

  it("only backfills HRV for the most recent stretch of history", () => {
    const history = generateDemoHistory();
    const metrics = generateDemoDailyMetrics(history);
    const withHrv = metrics.filter((m) => m.hrv_last_night_avg !== null);
    const withoutHrv = metrics.filter((m) => m.hrv_last_night_avg === null);
    expect(withHrv.length).toBeGreaterThan(0);
    expect(withoutHrv.length).toBeGreaterThan(0);
    // Everything with HRV is more recent than everything without it.
    const earliestWithHrv = withHrv[0].calendar_date;
    expect(withoutHrv.every((m) => m.calendar_date < earliestWithHrv)).toBe(true);
  });

  it("keeps resting HR and steps sane", () => {
    const history = generateDemoHistory();
    const metrics = generateDemoDailyMetrics(history);
    for (const m of metrics) {
      expect(m.resting_hr).toBeGreaterThan(30);
      expect(m.resting_hr).toBeLessThan(100);
      expect(m.total_steps).toBeGreaterThanOrEqual(0);
      expect(m.waking_avg_hr).toBeGreaterThan(m.resting_hr!);
    }
  });
});
