import { describe, expect, it } from "vitest";
import { makeActivity } from "../test/fixtures";
import { buildFrequencySegments } from "./routeFrequency";

describe("buildFrequencySegments", () => {
  it("returns no segments when no activity has more than one point", () => {
    const activities = [makeActivity({ points: [[52.5, 13.4]] })];
    expect(buildFrequencySegments(activities)).toEqual({ segments: [], maxCount: 0 });
  });

  it("builds one segment for a single two-point activity", () => {
    const activity = makeActivity({
      start_time: "2026-01-01T00:00:00Z",
      points: [
        [52.5, 13.4],
        [52.51, 13.41],
      ],
    });
    const { segments, maxCount } = buildFrequencySegments([activity]);
    expect(segments).toHaveLength(1);
    expect(segments[0].count).toBe(1);
    expect(segments[0].firstVisit).toBe("2026-01-01T00:00:00Z");
    expect(segments[0].lastVisit).toBe("2026-01-01T00:00:00Z");
    expect(maxCount).toBe(1);
  });

  it("counts an overlapping path from two activities once each, tracking first/last visit", () => {
    const shared = [
      [52.5, 13.4],
      [52.51, 13.41],
    ] as [number, number][];
    const a = makeActivity({ id: "a", start_time: "2026-01-01T00:00:00Z", points: shared });
    const b = makeActivity({ id: "b", start_time: "2026-02-01T00:00:00Z", points: shared });
    const { segments, maxCount } = buildFrequencySegments([a, b]);
    expect(segments).toHaveLength(1);
    expect(segments[0].count).toBe(2);
    expect(segments[0].firstVisit).toBe("2026-01-01T00:00:00Z");
    expect(segments[0].lastVisit).toBe("2026-02-01T00:00:00Z");
    expect(maxCount).toBe(2);
  });

  it("doesn't double count an out-and-back path within one activity", () => {
    const activity = makeActivity({
      points: [
        [52.5, 13.4],
        [52.51, 13.41],
        [52.5, 13.4],
      ],
    });
    const { segments } = buildFrequencySegments([activity]);
    // Same undirected edge crossed twice by one activity should count as 1.
    expect(segments).toHaveLength(1);
    expect(segments[0].count).toBe(1);
  });

  it("collapses consecutive points landing in the same grid cell", () => {
    const activity = makeActivity({
      points: [
        [52.5, 13.4],
        [52.500001, 13.400001], // effectively the same 30m cell
        [52.51, 13.41],
      ],
    });
    const { segments } = buildFrequencySegments([activity]);
    expect(segments).toHaveLength(1);
  });
});
