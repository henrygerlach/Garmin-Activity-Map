import { beforeEach, describe, expect, it, vi } from "vitest";

const existsSyncMock = vi.fn();
vi.mock("node:fs", () => ({
  existsSync: (...args: unknown[]) => existsSyncMock(...args),
}));

const gcInstances: any[] = [];
// The profile check every fresh instance's `client.get` resolves with by
// default, so a test can arrange a rejection *before* calling `login()` even
// though it can't reach the instance until the constructor has run.
let profileCheckImpl: () => Promise<unknown> = () => Promise.resolve({});

class FakeGarminConnect {
  username: string;
  password: string;
  client = { get: vi.fn(() => profileCheckImpl()) };
  loadTokenByFile = vi.fn();
  exportTokenToFile = vi.fn();
  login = vi.fn().mockResolvedValue(undefined);
  getActivities = vi.fn();

  constructor(opts: { username: string; password: string }) {
    this.username = opts.username;
    this.password = opts.password;
    gcInstances.push(this);
  }
}

vi.mock("garmin-connect", () => ({
  default: { GarminConnect: FakeGarminConnect },
}));

const { login, fetchActivities } = await import("../garmin.js");

beforeEach(() => {
  existsSyncMock.mockReset();
  gcInstances.length = 0;
  profileCheckImpl = () => Promise.resolve({});
});

describe("login", () => {
  it("reuses a saved token when the profile check succeeds", async () => {
    existsSyncMock.mockReturnValue(true);
    const gc = await login("me@example.com", "hunter2");

    expect(gc.loadTokenByFile).toHaveBeenCalled();
    expect(gc.client.get).toHaveBeenCalledWith(expect.stringContaining("/userprofile-service/socialProfile"));
    expect(gc.login).not.toHaveBeenCalled();
  });

  it("logs in fresh when there is no saved token", async () => {
    existsSyncMock.mockReturnValue(false);
    const gc = await login("me@example.com", "hunter2");

    expect(gc.login).toHaveBeenCalled();
    expect(gc.exportTokenToFile).toHaveBeenCalled();
  });

  it("logs in fresh when the saved token no longer works", async () => {
    existsSyncMock.mockReturnValue(true);
    profileCheckImpl = () => Promise.reject(new Error("expired"));
    const result = await login("me@example.com", "hunter2");
    expect(result.login).toHaveBeenCalled();
  });

  it("propagates a 429 rather than logging in again", async () => {
    existsSyncMock.mockReturnValue(true);
    profileCheckImpl = () => Promise.reject(new Error("Request failed (429)"));
    await expect(login("me@example.com", "hunter2")).rejects.toThrow("(429)");
    expect(gcInstances[gcInstances.length - 1].login).not.toHaveBeenCalled();
  });
});

function summary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    activityId: 1,
    activityName: "Evening walk",
    startTimeGMT: "2026-01-01 18:00:00",
    startTimeLocal: "2026-01-01 19:00:00",
    timeZoneId: 71,
    locationName: "Copenhagen",
    distance: 5000,
    duration: 3600,
    movingDuration: 3400,
    elapsedDuration: 3650,
    averageSpeed: 1.4,
    maxSpeed: 2.1,
    averageHR: 110,
    maxHR: 140,
    elevationGain: 12.34,
    elevationLoss: 10.1,
    minElevation: 1.2,
    maxElevation: 15.6,
    calories: 300,
    steps: 6000,
    averageRunningCadenceInStepsPerMinute: 100.4,
    maxRunningCadenceInStepsPerMinute: 120.6,
    avgStrideLength: 70.2,
    moderateIntensityMinutes: 20,
    vigorousIntensityMinutes: 5,
    hrTimeInZone_1: 100,
    hrTimeInZone_2: 200,
    hrTimeInZone_3: 50,
    hrTimeInZone_4: 10,
    hrTimeInZone_5: 0,
    startLatitude: 55.6,
    startLongitude: 12.5,
    endLatitude: 55.61,
    endLongitude: 12.51,
    activityType: { typeKey: "walking" },
    ...overrides,
  };
}

function detailsPayload(rows: (number | null)[][], keys: string[]) {
  return {
    metricDescriptors: keys.map((key, i) => ({ key, metricsIndex: i })),
    activityDetailMetrics: rows.map((metrics) => ({ metrics })),
  };
}

describe("fetchActivities", () => {
  it("normalizes, fetches details, and reports a synced count", async () => {
    const gc = new FakeGarminConnect({ username: "a", password: "b" });
    gc.getActivities.mockResolvedValueOnce([summary()]).mockResolvedValueOnce([]);

    const keys = ["directTimestamp", "directLatitude", "directLongitude", "sumDistance", "directSpeed", "directHeartRate", "directCorrectedElevation", "directDoubleCadence"];
    const startMs = new Date("2026-01-01T18:00:00.000Z").getTime();
    gc.client.get.mockResolvedValueOnce(
      detailsPayload(
        [
          [startMs, 55.6, 12.5, 0, 1.2, 100, 10, 90],
          [startMs + 1000, 55.601, 12.501, 10, 1.3, 105, 10.5, 92],
        ],
        keys,
      ),
    );

    const onActivity = vi.fn().mockResolvedValue(undefined);
    const onProgress = vi.fn();

    const synced = await fetchActivities(gc as any, {
      shouldFetch: () => true,
      stopWhenPageFullyKnown: true,
      onActivity,
      onProgress,
    });

    expect(synced).toBe(1);
    expect(onProgress).toHaveBeenCalledWith(expect.stringContaining("walk"));
    expect(onActivity).toHaveBeenCalledTimes(1);
    const [activity, streams] = onActivity.mock.calls[0];
    expect(activity.type).toBe("walk");
    expect(activity.garmin_activity_id).toBe(1);
    expect(activity.name).toBe("Evening walk");
    expect(activity.timezone_id).toBe("71");
    expect(activity.hr_time_in_zone_s).toEqual([100, 200, 50, 10, 0]);
    expect(activity.points).toEqual([
      [55.6, 12.5],
      [55.601, 12.501],
    ]);
    expect(streams).not.toBeNull();
    expect(streams!.t_s).toEqual([0, 1]);
    expect(streams!.distance_m).toEqual([0, 10]);
    expect(streams!.hr_bpm).toEqual([100, 105]);
  });

  it("falls back to the default name and drops unrecognized activity types", async () => {
    const gc = new FakeGarminConnect({ username: "a", password: "b" });
    gc.getActivities
      .mockResolvedValueOnce([
        summary({ activityName: null, activityType: { typeKey: "yoga" } }),
        summary({ activityId: 2, activityName: "", activityType: { typeKey: "cycling_road" } }),
      ])
      .mockResolvedValueOnce([]);
    gc.client.get.mockResolvedValue(detailsPayload([], []));

    const onActivity = vi.fn().mockResolvedValue(undefined);
    await fetchActivities(gc as any, { shouldFetch: () => true, stopWhenPageFullyKnown: true, onActivity });

    // Yoga isn't walk/run/bike, so only the cycling activity comes through.
    expect(onActivity).toHaveBeenCalledTimes(1);
    expect(onActivity.mock.calls[0][0].name).toBe("Bike ride");
    expect(onActivity.mock.calls[0][0].type).toBe("bike");
  });

  it("respects shouldFetch and stops early once a page is fully known", async () => {
    const gc = new FakeGarminConnect({ username: "a", password: "b" });
    gc.getActivities.mockResolvedValueOnce([summary({ activityId: 1 }), summary({ activityId: 2 })]);
    gc.client.get.mockResolvedValue(detailsPayload([], []));

    const onActivity = vi.fn().mockResolvedValue(undefined);
    const synced = await fetchActivities(gc as any, {
      shouldFetch: () => false,
      stopWhenPageFullyKnown: true,
      onActivity,
    });

    expect(synced).toBe(0);
    expect(onActivity).not.toHaveBeenCalled();
    // Only the first page was requested since it was fully known.
    expect(gc.getActivities).toHaveBeenCalledTimes(1);
  });

  it("keeps paging when stopWhenPageFullyKnown is false, for a full backfill", async () => {
    const gc = new FakeGarminConnect({ username: "a", password: "b" });
    gc.getActivities
      .mockResolvedValueOnce([summary({ activityId: 1 })])
      .mockResolvedValueOnce([]);
    gc.client.get.mockResolvedValue(detailsPayload([], []));

    const onActivity = vi.fn().mockResolvedValue(undefined);
    await fetchActivities(gc as any, { shouldFetch: () => false, stopWhenPageFullyKnown: false, onActivity });

    expect(gc.getActivities).toHaveBeenCalledTimes(2);
  });

  it("keeps a sample recorded with no GPS, using it for its heart-rate stream", async () => {
    const gc = new FakeGarminConnect({ username: "a", password: "b" });
    gc.getActivities.mockResolvedValueOnce([summary()]).mockResolvedValueOnce([]);
    const keys = ["directTimestamp", "directHeartRate"];
    gc.client.get.mockResolvedValueOnce(detailsPayload([[0, 90], [1000, 95]], keys));

    const onActivity = vi.fn().mockResolvedValue(undefined);
    await fetchActivities(gc as any, { shouldFetch: () => true, stopWhenPageFullyKnown: true, onActivity });

    const [activity, streams] = onActivity.mock.calls[0];
    expect(activity.points).toEqual([]);
    expect(streams!.hr_bpm).toEqual([90, 95]);
  });
});
