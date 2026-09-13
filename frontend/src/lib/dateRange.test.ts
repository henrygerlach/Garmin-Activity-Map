import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterByDateRange } from "./dateRange";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

const items = [
  { start_time: "2026-06-14T00:00:00Z" }, // 1 day ago
  { start_time: "2026-05-20T00:00:00Z" }, // ~26 days ago
  { start_time: "2026-04-01T00:00:00Z" }, // ~75 days ago
  { start_time: "2026-01-01T00:00:00Z" }, // ~165 days ago
  { start_time: "2024-01-01T00:00:00Z" }, // over a year ago
];

describe("filterByDateRange", () => {
  it("returns everything for 'all'", () => {
    expect(filterByDateRange(items, "all")).toHaveLength(5);
  });

  it("keeps only the last 30 days for '30d'", () => {
    expect(filterByDateRange(items, "30d")).toHaveLength(2);
  });

  it("keeps only the last 90 days for '90d'", () => {
    expect(filterByDateRange(items, "90d")).toHaveLength(3);
  });

  it("keeps only the last 12 months for '12m'", () => {
    expect(filterByDateRange(items, "12m")).toHaveLength(4);
  });
});
