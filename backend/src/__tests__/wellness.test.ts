import { afterAll, describe, expect, it, vi } from "vitest";
import { addDays, fetchDailyMetrics, toCalendarDate } from "../wellness.js";

// The module rate-limits itself with a real setTimeout between requests;
// running it at that pace would make this file the slowest in the suite for
// no test value, so every wait collapses to immediate here.
vi.stubGlobal("setTimeout", (fn: () => void) => {
  fn();
  return 0 as unknown as NodeJS.Timeout;
});
afterAll(() => vi.unstubAllGlobals());

describe("toCalendarDate", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    expect(toCalendarDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toCalendarDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("addDays", () => {
  it("adds and subtracts days without mutating the input", () => {
    const start = new Date(2026, 0, 31);
    const forward = addDays(start, 1);
    expect(toCalendarDate(forward)).toBe("2026-02-01");
    expect(toCalendarDate(start)).toBe("2026-01-31");

    const back = addDays(start, -31);
    expect(toCalendarDate(back)).toBe("2025-12-31");
  });
});

function makeGc(responses: Record<string, unknown>) {
  const get = vi.fn(async (url: string) => {
    for (const [pattern, value] of Object.entries(responses)) {
      if (url.includes(pattern)) return value;
    }
    throw new Error(`Unhandled URL in test: ${url}`);
  });
  return { client: { get } } as any;
}

describe("fetchDailyMetrics", () => {
  it("merges steps, resting HR and HRV keyed by calendar date", async () => {
    const gc = makeGc({
      socialProfile: { displayName: "walker" },
      "/stats/steps/daily/": [{ calendarDate: "2026-01-01", totalSteps: 4000 }],
      "/stats/heartRate/daily/": [{ calendarDate: "2026-01-01", values: { restingHR: 55 } }],
      "/hrv-service/hrv/daily/": { hrvSummaries: [{ calendarDate: "2026-01-01", lastNightAvg: 48 }] },
      dailyHeartRate: { heartRateValues: null },
      dailySleepData: { dailySleepDTO: null },
    });

    const metrics = await fetchDailyMetrics(gc, new Date(2026, 0, 1), new Date(2026, 0, 1));

    expect(metrics).toEqual([
      { calendar_date: "2026-01-01", total_steps: 4000, resting_hr: 55, hrv_last_night_avg: 48, waking_avg_hr: null },
    ]);
  });

  it("drops days Garmin has nothing for", async () => {
    const gc = makeGc({
      socialProfile: { displayName: "walker" },
      "/stats/steps/daily/": [],
      "/stats/heartRate/daily/": [],
      "/hrv-service/hrv/daily/": "",
      dailyHeartRate: { heartRateValues: null },
      dailySleepData: { dailySleepDTO: null },
    });

    const metrics = await fetchDailyMetrics(gc, new Date(2026, 0, 1), new Date(2026, 0, 2));
    expect(metrics).toEqual([]);
  });

  it("computes the waking average heart rate, excluding sleep windows", async () => {
    const day = "2026-01-01";
    const nextDay = "2026-01-02";
    const dayStartMs = new Date(2026, 0, 1).getTime();

    const gc = makeGc({
      socialProfile: { displayName: "walker" },
      "/stats/steps/daily/": [{ calendarDate: day, totalSteps: 1000 }],
      "/stats/heartRate/daily/": [],
      "/hrv-service/hrv/daily/": "",
    });
    // Override dailyHeartRate/dailySleepData per-date since the generic
    // matcher above only handles a single fixed response per URL fragment.
    gc.client.get.mockImplementation(async (url: string) => {
      if (url.includes("socialProfile")) return { displayName: "walker" };
      if (url.includes("/stats/steps/daily/")) return [{ calendarDate: day, totalSteps: 1000 }];
      if (url.includes("/stats/heartRate/daily/")) return [];
      if (url.includes("/hrv-service/hrv/daily/")) return "";
      if (url.includes(`dailyHeartRate?date=${day}`)) {
        return {
          heartRateValues: [
            [dayStartMs, 60], // asleep, excluded
            [dayStartMs + 3600_000, 100], // awake
            [dayStartMs + 3700_000, 120], // awake
            [dayStartMs + 3800_000, null], // missing sample
          ],
        };
      }
      if (url.includes("dailyHeartRate")) return { heartRateValues: null };
      if (url.includes(`dailySleepData/walker?date=${day}`)) {
        return { dailySleepDTO: { sleepStartTimestampGMT: dayStartMs - 1000, sleepEndTimestampGMT: dayStartMs + 1000 } };
      }
      if (url.includes(`dailySleepData/walker?date=${nextDay}`)) {
        return { dailySleepDTO: null };
      }
      throw new Error(`Unhandled URL: ${url}`);
    });

    const metrics = await fetchDailyMetrics(gc, new Date(2026, 0, 1), new Date(2026, 0, 1));
    expect(metrics).toHaveLength(1);
    // Mean of the two awake samples (100 and 120), the sleeping 60 excluded.
    expect(metrics[0].waking_avg_hr).toBe(110);
  });

  it("skips waking-average work for a day with no heart-rate samples", async () => {
    const gc = makeGc({
      socialProfile: { displayName: "walker" },
      "/stats/steps/daily/": [{ calendarDate: "2026-01-01", totalSteps: 1000 }],
      "/stats/heartRate/daily/": [],
      "/hrv-service/hrv/daily/": "",
      dailyHeartRate: { heartRateValues: null },
    });

    const metrics = await fetchDailyMetrics(gc, new Date(2026, 0, 1), new Date(2026, 0, 1));
    expect(metrics[0].waking_avg_hr).toBeNull();
    expect(gc.client.get.mock.calls.some(([url]: [string]) => url.includes("dailySleepData"))).toBe(false);
  });

  it("asks for heart-rate samples only on the days the caller listed", async () => {
    const gc = makeGc({
      socialProfile: { displayName: "walker" },
      "/stats/steps/daily/": [
        { calendarDate: "2026-01-01", totalSteps: 1000 },
        { calendarDate: "2026-01-02", totalSteps: 2000 },
      ],
      "/stats/heartRate/daily/": [],
      "/hrv-service/hrv/daily/": "",
      dailyHeartRate: { heartRateValues: null },
    });

    const metrics = await fetchDailyMetrics(
      gc,
      new Date(2026, 0, 1),
      new Date(2026, 0, 2),
      undefined,
      new Set(["2026-01-02"]),
    );

    // Both days are still stored — the filter only governs the per-day calls.
    expect(metrics.map((m) => m.calendar_date)).toEqual(["2026-01-01", "2026-01-02"]);
    const sampleCalls = gc.client.get.mock.calls
      .map(([url]: [string]) => url)
      .filter((url: string) => url.includes("dailyHeartRate"));
    expect(sampleCalls).toEqual(["https://connectapi.garmin.com/wellness-service/wellness/dailyHeartRate?date=2026-01-02"]);
  });

  it("chunks ranges longer than 28 days and reports progress", async () => {
    const onProgress = vi.fn();
    const gc = makeGc({
      socialProfile: { displayName: "walker" },
      "/stats/steps/daily/": [],
      "/stats/heartRate/daily/": [],
      "/hrv-service/hrv/daily/": "",
      dailyHeartRate: { heartRateValues: null },
    });

    await fetchDailyMetrics(gc, new Date(2026, 0, 1), new Date(2026, 2, 1), onProgress);
    // 60 days spans three 28-day windows.
    expect(onProgress).toHaveBeenCalledTimes(3);
  });
});
