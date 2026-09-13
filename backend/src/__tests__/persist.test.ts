import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const select = vi.fn();
const single = vi.fn();
const from = vi.fn();

vi.mock("../supabase.js", () => ({
  supabase: { from: (...args: unknown[]) => from(...args) },
}));

const { saveActivity, saveDailyMetrics } = await import("../persist.js");

function activitiesTable() {
  return { upsert: (...args: unknown[]) => { upsert(...args); return { select: (...s: unknown[]) => { select(...s); return { single }; } }; } };
}

beforeEach(() => {
  upsert.mockReset();
  select.mockReset();
  single.mockReset();
  from.mockReset();
});

describe("saveActivity", () => {
  it("upserts the activity, then the streams keyed by the returned id", async () => {
    single.mockResolvedValue({ data: { id: "uuid-1" }, error: null });
    const streamsUpsert = vi.fn().mockResolvedValue({ error: null });
    from.mockImplementation((table: string) => {
      if (table === "activities") return activitiesTable();
      if (table === "activity_streams") return { upsert: streamsUpsert };
      throw new Error(`unexpected table ${table}`);
    });

    const activity = { garmin_activity_id: 42 } as any;
    const streams = { t_s: [0, 1] } as any;
    await saveActivity(activity, streams);

    expect(upsert).toHaveBeenCalledWith(activity, { onConflict: "garmin_activity_id" });
    expect(streamsUpsert).toHaveBeenCalledWith(
      { activity_id: "uuid-1", garmin_activity_id: 42, t_s: [0, 1] },
      { onConflict: "activity_id" },
    );
  });

  it("skips the streams write when there are no streams", async () => {
    single.mockResolvedValue({ data: { id: "uuid-1" }, error: null });
    from.mockImplementation((table: string) => {
      if (table === "activities") return activitiesTable();
      throw new Error(`unexpected table ${table}`);
    });

    await saveActivity({ garmin_activity_id: 1 } as any, null);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("throws when the activity upsert fails", async () => {
    single.mockResolvedValue({ data: null, error: new Error("boom") });
    from.mockImplementation(() => activitiesTable());

    await expect(saveActivity({ garmin_activity_id: 1 } as any, null)).rejects.toThrow("boom");
  });

  it("throws when the streams upsert fails", async () => {
    single.mockResolvedValue({ data: { id: "uuid-1" }, error: null });
    const streamsUpsert = vi.fn().mockResolvedValue({ error: new Error("streams boom") });
    from.mockImplementation((table: string) => (table === "activities" ? activitiesTable() : { upsert: streamsUpsert }));

    await expect(saveActivity({ garmin_activity_id: 1 } as any, { t_s: [] } as any)).rejects.toThrow("streams boom");
  });
});

describe("saveDailyMetrics", () => {
  it("does nothing for an empty list", async () => {
    await saveDailyMetrics([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("upserts metrics keyed by calendar date", async () => {
    const metricsUpsert = vi.fn().mockResolvedValue({ error: null });
    from.mockImplementation(() => ({ upsert: metricsUpsert }));

    const metrics = [{ calendar_date: "2026-01-01" }] as any;
    await saveDailyMetrics(metrics);

    expect(from).toHaveBeenCalledWith("daily_metrics");
    expect(metricsUpsert).toHaveBeenCalledWith(metrics, { onConflict: "calendar_date" });
  });

  it("throws when the upsert fails", async () => {
    from.mockImplementation(() => ({ upsert: vi.fn().mockResolvedValue({ error: new Error("nope") }) }));
    await expect(saveDailyMetrics([{ calendar_date: "2026-01-01" }] as any)).rejects.toThrow("nope");
  });
});
