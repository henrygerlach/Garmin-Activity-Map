import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// `Number(process.env.PORT) || 8788` in index.ts treats "0" as falsy, so an
// explicit unused port is used instead of relying on ephemeral-port ("0") assignment.
process.env.PORT = "18788";

const loginMock = vi.fn();
const fetchActivitiesMock = vi.fn();
const saveActivityMock = vi.fn();
const saveDailyMetricsMock = vi.fn();
const addDaysMock = vi.fn((date: Date, days: number) => {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
});
const fetchDailyMetricsMock = vi.fn();
const toCalendarDateMock = vi.fn((date: Date) => date.toISOString().slice(0, 10));

vi.mock("../garmin.js", () => ({
  login: (...args: unknown[]) => loginMock(...args),
  fetchActivities: (...args: unknown[]) => fetchActivitiesMock(...args),
}));
vi.mock("../persist.js", () => ({
  saveActivity: (...args: unknown[]) => saveActivityMock(...args),
  saveDailyMetrics: (...args: unknown[]) => saveDailyMetricsMock(...args),
}));
vi.mock("../wellness.js", () => ({
  addDays: (...args: [Date, number]) => addDaysMock(...args),
  fetchDailyMetrics: (...args: unknown[]) => fetchDailyMetricsMock(...args),
  toCalendarDate: (...args: [Date]) => toCalendarDateMock(...args),
}));

// Queue of results per table, consumed in call order — the handler makes at
// most one or two calls per table per request, in a fixed sequence.
let tableResults: Record<string, unknown[]>;
const fromMock = vi.fn((table: string) => {
  const queue = tableResults[table] ?? [];
  const result = queue.shift() ?? { data: null, error: null };
  const builder: any = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    gte: () => builder,
    lte: () => builder,
    not: () => builder,
    maybeSingle: async () => result,
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
});
vi.mock("../supabase.js", () => ({ supabase: { from: (table: string) => fromMock(table) } }));

const { app, server } = await import("../index.js");

afterAll(() => {
  server.close();
});

async function request(path: string, init?: RequestInit) {
  const res = await fetch(`http://127.0.0.1:${process.env.PORT}${path}`, init);
  return { status: res.status, body: (await res.json()) as any };
}

beforeEach(() => {
  tableResults = {};
  fromMock.mockClear();
  loginMock.mockReset();
  fetchActivitiesMock.mockReset();
  saveActivityMock.mockReset();
  saveDailyMetricsMock.mockReset();
  fetchDailyMetricsMock.mockReset();
  addDaysMock.mockClear();
  toCalendarDateMock.mockClear();
  delete process.env.GARMIN_EMAIL;
  delete process.env.GARMIN_PASSWORD;
  void app;
});

describe("GET /api/health", () => {
  it("reports ok", async () => {
    const { status, body } = await request("/api/health");
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});

describe("POST /api/sync", () => {
  it("fails fast when Garmin credentials are missing", async () => {
    const { status, body } = await request("/api/sync", { method: "POST" });
    expect(status).toBe(500);
    expect(body.error).toMatch(/GARMIN_EMAIL/);
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("uses the latest daily_metrics date, minus the overlap, as the wellness start", async () => {
    process.env.GARMIN_EMAIL = "me@example.com";
    process.env.GARMIN_PASSWORD = "hunter2";
    tableResults = {
      activities: [{ data: [{ garmin_activity_id: 1 }], error: null }],
      daily_metrics: [{ data: { calendar_date: "2026-01-10" }, error: null }],
    };
    loginMock.mockResolvedValue({ id: "gc" });
    fetchActivitiesMock.mockResolvedValue(3);
    fetchDailyMetricsMock.mockResolvedValue([{ calendar_date: "2026-01-01" }, { calendar_date: "2026-01-02" }]);
    saveDailyMetricsMock.mockResolvedValue(undefined);

    const { status, body } = await request("/api/sync", { method: "POST" });

    expect(status).toBe(200);
    expect(body).toEqual({ synced: 3, dailyMetrics: 2, power: null, wahooError: null });
    const [, start, end] = fetchDailyMetricsMock.mock.calls[0];
    // Compared via local getters, not toISOString, since the source builds this
    // date from local y/m/d components and a UTC slice can land on the day before.
    expect(`${start.getFullYear()}-${start.getMonth() + 1}-${start.getDate()}`).toBe("2026-1-3"); // 10th minus 7 days
    expect(end).toBeInstanceOf(Date);
    expect(saveDailyMetricsMock).toHaveBeenCalledWith([
      { calendar_date: "2026-01-01" },
      { calendar_date: "2026-01-02" },
    ]);
  });

  it("only derives the waking heart rate for unstored days and the last two", async () => {
    process.env.GARMIN_EMAIL = "me@example.com";
    process.env.GARMIN_PASSWORD = "hunter2";

    // Built with the same arithmetic as the route, so the keys line up in any
    // timezone: local midnights for the window it walks, timestamps for the
    // two trailing days it always redoes.
    const cal = (date: Date) => date.toISOString().slice(0, 10);
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const windowKeys = new Set<string>();
    for (let back = 7; back >= 0; back--) windowKeys.add(cal(addDaysMock(midnight, -back)));
    const trailing = [cal(new Date()), cal(addDaysMock(new Date(), -1))];
    const gap = cal(addDaysMock(midnight, -4));

    const pad = (n: number) => String(n).padStart(2, "0");
    tableResults = {
      activities: [{ data: [], error: null }],
      daily_metrics: [
        { data: { calendar_date: `${midnight.getFullYear()}-${pad(midnight.getMonth() + 1)}-${pad(midnight.getDate())}` }, error: null },
        { data: [...windowKeys].filter((key) => key !== gap).map((key) => ({ calendar_date: key })), error: null },
      ],
    };
    loginMock.mockResolvedValue({ id: "gc" });
    fetchActivitiesMock.mockResolvedValue(0);
    fetchDailyMetricsMock.mockResolvedValue([]);
    saveDailyMetricsMock.mockResolvedValue(undefined);

    const { status } = await request("/api/sync", { method: "POST" });

    expect(status).toBe(200);
    const dates: Set<string> = fetchDailyMetricsMock.mock.calls[0][4];
    expect([...dates].sort()).toEqual([...new Set([gap, ...trailing])].sort());
  });

  it("falls back to the earliest activity's date when there are no daily_metrics yet", async () => {
    process.env.GARMIN_EMAIL = "me@example.com";
    process.env.GARMIN_PASSWORD = "hunter2";
    tableResults = {
      activities: [
        { data: [], error: null },
        { data: { start_time: "2024-05-01T00:00:00.000Z" }, error: null },
      ],
      daily_metrics: [{ data: null, error: null }],
    };
    loginMock.mockResolvedValue({ id: "gc" });
    fetchActivitiesMock.mockResolvedValue(0);
    fetchDailyMetricsMock.mockResolvedValue([]);
    saveDailyMetricsMock.mockResolvedValue(undefined);

    const { status, body } = await request("/api/sync", { method: "POST" });
    expect(status).toBe(200);
    expect(body).toEqual({ synced: 0, dailyMetrics: 0, power: null, wahooError: null });
    const [, start] = fetchDailyMetricsMock.mock.calls[0];
    expect(start.toISOString()).toBe("2024-05-01T00:00:00.000Z");
  });

  it("falls back to a fixed history window when there is no data at all", async () => {
    process.env.GARMIN_EMAIL = "me@example.com";
    process.env.GARMIN_PASSWORD = "hunter2";
    tableResults = {
      activities: [
        { data: [], error: null },
        { data: null, error: null },
      ],
      daily_metrics: [{ data: null, error: null }],
    };
    loginMock.mockResolvedValue({ id: "gc" });
    fetchActivitiesMock.mockResolvedValue(0);
    fetchDailyMetricsMock.mockResolvedValue([]);
    saveDailyMetricsMock.mockResolvedValue(undefined);

    await request("/api/sync", { method: "POST" });
    expect(addDaysMock).toHaveBeenCalledWith(expect.any(Date), -730);
  });

  it("passes shouldFetch/onActivity callbacks that dedupe against known ids and persist as they arrive", async () => {
    process.env.GARMIN_EMAIL = "me@example.com";
    process.env.GARMIN_PASSWORD = "hunter2";
    tableResults = {
      activities: [{ data: [{ garmin_activity_id: 10 }], error: null }],
      daily_metrics: [{ data: { calendar_date: "2026-01-10" }, error: null }],
    };
    loginMock.mockResolvedValue({ id: "gc" });
    fetchDailyMetricsMock.mockResolvedValue([]);
    saveDailyMetricsMock.mockResolvedValue(undefined);
    saveActivityMock.mockResolvedValue(undefined);

    fetchActivitiesMock.mockImplementation(async (_gc, opts) => {
      expect(opts.shouldFetch(10)).toBe(false);
      expect(opts.shouldFetch(11)).toBe(true);
      await opts.onActivity({ garmin_activity_id: 11 }, null);
      // Once persisted, that id should now be considered known too.
      expect(opts.shouldFetch(11)).toBe(false);
      return 1;
    });

    const { status } = await request("/api/sync", { method: "POST" });
    expect(status).toBe(200);
    expect(saveActivityMock).toHaveBeenCalledWith({ garmin_activity_id: 11 }, null);
  });

  it("returns 500 when reading known activity ids fails", async () => {
    process.env.GARMIN_EMAIL = "me@example.com";
    process.env.GARMIN_PASSWORD = "hunter2";
    tableResults = { activities: [{ data: null, error: new Error("db down") }] };

    const { status, body } = await request("/api/sync", { method: "POST" });
    expect(status).toBe(500);
    expect(body.error).toBe("db down");
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("returns 500 when login fails", async () => {
    process.env.GARMIN_EMAIL = "me@example.com";
    process.env.GARMIN_PASSWORD = "hunter2";
    tableResults = { activities: [{ data: [], error: null }] };
    loginMock.mockRejectedValue(new Error("bad credentials"));

    const { status, body } = await request("/api/sync", { method: "POST" });
    expect(status).toBe(500);
    expect(body.error).toBe("bad credentials");
  });

  it("returns a generic message for a non-Error rejection", async () => {
    process.env.GARMIN_EMAIL = "me@example.com";
    process.env.GARMIN_PASSWORD = "hunter2";
    tableResults = { activities: [{ data: [], error: null }] };
    loginMock.mockRejectedValue("nope");

    const { status, body } = await request("/api/sync", { method: "POST" });
    expect(status).toBe(500);
    expect(body.error).toBe("Sync failed");
  });
});
