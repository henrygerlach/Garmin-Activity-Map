export type DateRangeOption = "all" | "30d" | "90d" | "12m";

export const DATE_RANGE_OPTIONS: DateRangeOption[] = ["all", "30d", "90d", "12m"];

export const DATE_RANGE_LABELS: Record<DateRangeOption, string> = {
  all: "All time",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "12m": "Last 12 months",
};

export function filterByDateRange<T extends { start_time: string }>(items: T[], option: DateRangeOption): T[] {
  if (option === "all") return items;
  const days = option === "30d" ? 30 : option === "90d" ? 90 : 365;
  const cutoff = Date.now() - days * 86_400_000;
  return items.filter((item) => new Date(item.start_time).getTime() >= cutoff);
}
