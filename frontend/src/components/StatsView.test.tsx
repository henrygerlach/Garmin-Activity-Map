import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeActivity, makeDailyMetric } from "../test/fixtures";
import { StatsView } from "./StatsView";

describe("StatsView", () => {
  it("shows an empty state with no activities", () => {
    render(<StatsView activities={[]} dailyMetrics={[]} />);
    expect(screen.getByText(/Nothing logged yet/)).toBeInTheDocument();
  });

  it("renders summary tiles and every chart section for real data", () => {
    const activities = [
      makeActivity({ id: "1", type: "walk", start_time: "2026-01-05T08:00:00Z", distance_m: 5000 }),
      makeActivity({ id: "2", type: "run", start_time: "2026-01-06T08:00:00Z", distance_m: 10000 }),
      makeActivity({ id: "3", type: "bike", start_time: "2026-01-07T08:00:00Z", distance_m: 20000 }),
    ];
    const dailyMetrics = [makeDailyMetric({ calendar_date: "2026-01-05" })];
    render(<StatsView activities={activities} dailyMetrics={dailyMetrics} />);

    expect(screen.getByText("Activities").previousSibling).toHaveTextContent("3");
    expect(screen.getByRole("heading", { name: "Activity calendar" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Weekly steps" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Speed progression" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Heart rate variability" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Activities by hour of day" })).toBeInTheDocument();
  });

  it("shows the cycling power cards only for rides recorded with the meter", () => {
    const plain = [makeActivity({ id: "1", type: "bike", start_time: "2026-01-07T08:00:00Z" })];
    const { rerender } = render(<StatsView activities={plain} dailyMetrics={[]} />);
    expect(screen.queryByRole("heading", { name: "Cycling power" })).not.toBeInTheDocument();

    const withPower = [
      makeActivity({
        id: "1",
        type: "bike",
        start_time: "2026-01-07T08:00:00Z",
        avg_power_w: 204,
        norm_power_w: 221,
        tss: 68,
        avg_cadence_rpm: 84,
      }),
    ];
    rerender(<StatsView activities={withPower} dailyMetrics={[]} />);
    expect(screen.getByRole("heading", { name: "Cycling power" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cycling cadence" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cycling training load" })).toBeInTheDocument();
  });

  it("shows an em dash for wellness tiles with no data", () => {
    const activities = [makeActivity()];
    render(<StatsView activities={activities} dailyMetrics={[]} />);
    expect(screen.getByText("Resting heart rate")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
