import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatBpmValue,
  formatDate,
  formatDateCompact,
  formatDistance,
  formatDistanceCompact,
  formatDuration,
  formatDurationCompact,
  formatHr,
  formatKmhValue,
  formatKmValue,
  formatPower,
  formatRelativeTime,
  formatSpeed,
  movingSpeedMps,
} from "./format";

describe("formatDate", () => {
  it("includes a date and time", () => {
    expect(formatDate("2026-01-05T08:00:00.000Z")).toMatch(/2026/);
  });
});

describe("formatDateCompact", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("omits the year for dates in the current year", () => {
    const result = formatDateCompact("2026-01-05T08:00:00.000Z");
    expect(result).not.toMatch(/26/);
  });

  it("includes the year for dates from a previous year", () => {
    const result = formatDateCompact("2024-01-05T08:00:00.000Z");
    expect(result).toMatch(/24/);
  });
});

describe("formatDistance", () => {
  it("formats meters as km with 2dp", () => {
    expect(formatDistance(5432)).toBe("5.43 km");
  });
});

describe("formatDistanceCompact", () => {
  it("rounds to whole km with thousands separators", () => {
    expect(formatDistanceCompact(1234567)).toBe("1,235 km");
  });
});

describe("formatDuration", () => {
  it("formats sub-hour durations as minutes only", () => {
    expect(formatDuration(1500)).toBe("25m");
  });

  it("formats durations over an hour as h and m", () => {
    expect(formatDuration(5400)).toBe("1h 30m");
  });
});

describe("formatDurationCompact", () => {
  it("rounds to whole hours", () => {
    expect(formatDurationCompact(5400)).toBe("2 h");
  });
});

describe("formatSpeed", () => {
  it("converts m/s to km/h", () => {
    expect(formatSpeed(10)).toBe("36.0 km/h");
  });

  it("returns an em dash for null", () => {
    expect(formatSpeed(null)).toBe("—");
  });
});

describe("movingSpeedMps", () => {
  it("divides distance by moving duration", () => {
    expect(movingSpeedMps({ distance_m: 100, moving_duration_s: 50 })).toBe(2);
  });

  it("returns null when moving duration is zero or negative", () => {
    expect(movingSpeedMps({ distance_m: 100, moving_duration_s: 0 })).toBeNull();
    expect(movingSpeedMps({ distance_m: 100, moving_duration_s: -1 })).toBeNull();
  });
});

describe("formatHr", () => {
  it("rounds and appends bpm", () => {
    expect(formatHr(110.6)).toBe("111 bpm");
  });

  it("returns an em dash for null", () => {
    expect(formatHr(null)).toBe("—");
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("says 'just now' for very recent times", () => {
    expect(formatRelativeTime(new Date("2026-06-15T11:59:45Z").toISOString())).toBe("just now");
  });

  it("formats minutes ago", () => {
    expect(formatRelativeTime(new Date("2026-06-15T11:55:00Z").toISOString())).toBe("5m ago");
  });

  it("formats hours ago", () => {
    expect(formatRelativeTime(new Date("2026-06-15T09:00:00Z").toISOString())).toBe("3h ago");
  });

  it("formats days ago", () => {
    expect(formatRelativeTime(new Date("2026-06-12T12:00:00Z").toISOString())).toBe("3d ago");
  });

  it("falls back to a short date beyond a week", () => {
    expect(formatRelativeTime(new Date("2026-05-01T12:00:00Z").toISOString())).toMatch(/May/);
  });
});

describe("value-only formatters", () => {
  it("formatKmValue", () => {
    expect(formatKmValue(5432)).toBe("5.43");
  });

  it("formatKmhValue handles null", () => {
    expect(formatKmhValue(10)).toBe("36.0");
    expect(formatKmhValue(null)).toBe("—");
  });

  it("formatBpmValue handles null", () => {
    expect(formatBpmValue(110.4)).toBe("110");
    expect(formatBpmValue(null)).toBe("—");
  });
});

describe("formatPower", () => {
  it("shows normalised power alongside the average when there is one", () => {
    expect(formatPower({ avg_power_w: 204.4, norm_power_w: 221.7 })).toBe("204 W (NP 222 W)");
  });

  it("drops the bracket when only an average was recorded", () => {
    expect(formatPower({ avg_power_w: 204.4, norm_power_w: null })).toBe("204 W");
  });

  it("is a dash for an activity ridden without the meter", () => {
    expect(formatPower({ avg_power_w: null, norm_power_w: null })).toBe("—");
  });
});
