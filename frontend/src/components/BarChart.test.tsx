import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarChart } from "./BarChart";

const data = [
  { label: "Jan 1", value: 10 },
  { label: "Jan 2", value: 25 },
  { label: "Jan 3", value: 5 },
];

describe("BarChart", () => {
  it("describes itself with a summary aria-label", () => {
    render(<BarChart data={data} color="red" title="Distance" />);
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("aria-label")).toMatch(/Distance/);
    expect(svg.getAttribute("aria-label")).toMatch(/3 bars/);
    expect(svg.getAttribute("aria-label")).toMatch(/highest at Jan 2/);
  });

  it("reports no data for an empty series", () => {
    render(<BarChart data={[]} color="red" title="Distance" />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Distance. No data.");
  });

  it("shows a tooltip with a formatted value on bar hover", () => {
    const { container } = render(
      <BarChart data={data} color="red" title="Distance" valueFormatter={(v) => `${v} km`} />,
    );
    const bars = container.querySelectorAll("g");
    fireEvent.mouseEnter(bars[0]);
    expect(screen.getByText("10 km")).toBeInTheDocument();
    fireEvent.mouseLeave(bars[0]);
    expect(screen.queryByText("10 km")).not.toBeInTheDocument();
  });

  it("hides the tooltip when the cursor moves over the axis gutter", () => {
    const { container } = render(<BarChart data={data} color="red" title="Distance" />);
    const bars = container.querySelectorAll("g");
    fireEvent.mouseEnter(bars[0]);
    expect(container.querySelector(".chart-tooltip")).not.toBeNull();

    const chart = container.querySelector(".bar-chart")!;
    fireEvent.mouseMove(chart, { clientX: 0, clientY: 10 });
    expect(container.querySelector(".chart-tooltip")).toBeNull();
  });
});
