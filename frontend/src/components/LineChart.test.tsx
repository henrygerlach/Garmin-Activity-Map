import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LineChart } from "./LineChart";

const series = [
  { name: "Walk", color: "red", data: [{ label: "Jan 1", value: 1 }, { label: "Jan 2", value: 3 }, { label: "Jan 3", value: 2 }] },
  { name: "Run", color: "blue", data: [{ label: "Jan 1", value: null }, { label: "Jan 2", value: 5 }, { label: "Jan 3", value: 5 }] },
];

describe("LineChart", () => {
  it("renders nothing when there are no points", () => {
    const { container } = render(<LineChart series={[{ name: "Walk", color: "red", data: [] }]} title="Speed" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("describes each series' direction and range in the summary", () => {
    render(<LineChart series={series} title="Speed" />);
    const label = screen.getByRole("img").getAttribute("aria-label")!;
    expect(label).toMatch(/Speed/);
    expect(label).toMatch(/Walk ranges from 1 to 3, rising overall to 2/);
    expect(label).toMatch(/Run: no data|Run ranges from 5 to 5, flat overall to 5/);
  });

  it("reports 'no data' for a series that is entirely null", () => {
    const allNull = [{ name: "HR", color: "red", data: [{ label: "a", value: null }, { label: "b", value: null }] }];
    render(<LineChart series={allNull} title="HR" />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/HR: no data/);
  });

  it("renders a legend entry per series", () => {
    render(<LineChart series={series} title="Speed" />);
    expect(screen.getByText("Walk")).toBeInTheDocument();
    expect(screen.getByText("Run")).toBeInTheDocument();
  });

  it("shows a tooltip with each series' value at the hovered point", () => {
    const { container } = render(<LineChart series={series} title="Speed" valueFormatter={(v) => `${v} km/h`} />);
    const chart = container.querySelector(".line-chart")!;
    // Fallback slot width (34px) puts point 0's center around x=40+17=57.
    fireEvent.mouseMove(chart, { clientX: 57, clientY: 50 });
    expect(screen.getByText("1 km/h")).toBeInTheDocument();
    // Run has no value at point 0, rendered as an em dash.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("hides the tooltip when the cursor moves over the axis gutter", () => {
    const { container } = render(<LineChart series={series} title="Speed" />);
    const chart = container.querySelector(".line-chart")!;
    fireEvent.mouseMove(chart, { clientX: 57, clientY: 50 });
    expect(container.querySelector(".chart-tooltip")).not.toBeNull();
    fireEvent.mouseMove(chart, { clientX: 0, clientY: 50 });
    expect(container.querySelector(".chart-tooltip")).toBeNull();
  });
});
