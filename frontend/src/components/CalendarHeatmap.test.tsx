import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DayActivity } from "../lib/stats";
import { CalendarHeatmap } from "./CalendarHeatmap";

function day(dateStr: string, distanceM: number, count: number): DayActivity {
  return { date: new Date(dateStr), distanceM, count };
}

describe("CalendarHeatmap", () => {
  it("renders nothing for an empty day list", () => {
    const { container } = render(<CalendarHeatmap days={[]} title="Activity" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("summarises days, active count, and the busiest day", () => {
    const days = [
      day("2026-01-05", 0, 0),
      day("2026-01-06", 1000, 1),
      day("2026-01-07", 5000, 1),
    ];
    render(<CalendarHeatmap days={days} title="Activity" />);
    const label = screen.getByRole("img").getAttribute("aria-label")!;
    expect(label).toMatch(/Activity/);
    expect(label).toMatch(/3 days/);
    expect(label).toMatch(/2 days with a logged activity/);
    expect(label).toMatch(/Busiest was/);
  });

  it("reports no activity days when every day is empty", () => {
    const days = [day("2026-01-05", 0, 0), day("2026-01-06", 0, 0)];
    render(<CalendarHeatmap days={days} title="Activity" />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/none with a logged activity/);
  });

  it("shows a tooltip with distance and activity count on cell hover", () => {
    const days = [day("2026-01-05", 5000, 2)];
    const { container } = render(<CalendarHeatmap days={days} title="Activity" />);
    const cell = container.querySelector("rect[rx]")!;
    fireEvent.mouseEnter(cell);
    expect(screen.getByText(/5\.00 km · 2 activities/)).toBeInTheDocument();
  });

  it("uses singular 'activity' for a count of one", () => {
    const days = [day("2026-01-05", 5000, 1)];
    const { container } = render(<CalendarHeatmap days={days} title="Activity" />);
    fireEvent.mouseEnter(container.querySelector("rect[rx]")!);
    expect(screen.getByText(/1 activity\b/)).toBeInTheDocument();
  });

  it("shows 'No activity' for a hovered zero-distance day", () => {
    const days = [day("2026-01-05", 0, 0)];
    const { container } = render(<CalendarHeatmap days={days} title="Activity" />);
    fireEvent.mouseEnter(container.querySelector("rect[rx]")!);
    expect(screen.getByText("No activity")).toBeInTheDocument();
  });
});
