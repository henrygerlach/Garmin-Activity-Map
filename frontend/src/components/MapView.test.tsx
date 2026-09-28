import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeActivity } from "../test/fixtures";
import { MapView } from "./MapView";

const walk = makeActivity({
  id: "walk-1",
  type: "walk",
  start_time: "2026-01-01T08:00:00Z",
  points: [
    [52.5, 13.4],
    [52.501, 13.401],
  ],
});
const bike = makeActivity({
  id: "bike-1",
  type: "bike",
  start_time: "2026-06-01T08:00:00Z",
  points: [
    [52.6, 13.5],
    [52.601, 13.501],
  ],
});

describe("MapView", () => {
  it("renders the toolbar and map without crashing with no activities", () => {
    render(<MapView activities={[]} hoveredId={null} onHover={() => {}} selectedId={null} />);
    expect(screen.getByRole("radiogroup", { name: "Activity type" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Date range" })).toBeInTheDocument();
  });

  it("drops activities with fewer than two GPS points before rendering", () => {
    const noGps = makeActivity({ id: "no-gps", points: [] });
    const { container } = render(
      <MapView activities={[walk, noGps]} hoveredId={null} onHover={() => {}} selectedId={null} />,
    );
    expect(container.querySelectorAll("path.leaflet-interactive")).toHaveLength(1);
  });

  it("tags each track with its activity type so App.css can colour it", () => {
    const { container } = render(
      <MapView activities={[walk, bike]} hoveredId={null} onHover={() => {}} selectedId={null} />,
    );
    expect(container.querySelector("path.trace.trace--walk")).toBeInTheDocument();
    expect(container.querySelector("path.trace.trace--bike")).toBeInTheDocument();
  });

  it("filters activities by type via the segmented control", async () => {
    const { container } = render(
      <MapView activities={[walk, bike]} hoveredId={null} onHover={() => {}} selectedId={null} />,
    );
    expect(container.querySelectorAll("path.leaflet-interactive")).toHaveLength(2);

    await userEvent.click(screen.getByRole("radio", { name: "Bike" }));
    expect(container.querySelectorAll("path.leaflet-interactive")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "Bike" })).toHaveAttribute("aria-checked", "true");
  });

  it("filters activities by date range", async () => {
    const recent = makeActivity({
      id: "recent",
      type: "walk",
      start_time: new Date().toISOString(),
      points: [
        [52.7, 13.6],
        [52.701, 13.601],
      ],
    });
    const { container } = render(
      <MapView activities={[walk, recent]} hoveredId={null} onHover={() => {}} selectedId={null} />,
    );
    expect(container.querySelectorAll("path.leaflet-interactive")).toHaveLength(2);

    await userEvent.click(screen.getByRole("radio", { name: "Last 30 days" }));
    expect(container.querySelectorAll("path.leaflet-interactive")).toHaveLength(1);
  });

  it("shows a frequency legend when the frequency map toggle is checked", async () => {
    const { container } = render(
      <MapView activities={[walk, bike]} hoveredId={null} onHover={() => {}} selectedId={null} />,
    );
    expect(container.querySelector(".map-legend")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Frequency map"));
    await waitFor(() => expect(container.querySelector(".map-legend")).toBeInTheDocument());
  });

  it("shows the time-lapse bar spanning the filtered activities' days when enabled", async () => {
    render(<MapView activities={[walk, bike]} hoveredId={null} onHover={() => {}} selectedId={null} />);
    expect(screen.queryByRole("slider", { name: "Time-lapse date" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Time-lapse"));
    const slider = screen.getByRole("slider", { name: "Time-lapse date" });
    // From Jan 1 to Jun 1 inclusive, one entry per day.
    const days = Math.round((new Date("2026-06-01").getTime() - new Date("2026-01-01").getTime()) / 86_400_000);
    expect(slider).toHaveAttribute("max", String(days));
  });

  it("calls onHover when a track is hovered", () => {
    const onHover = vi.fn();
    const { container } = render(
      <MapView activities={[walk]} hoveredId={null} onHover={onHover} selectedId={null} />,
    );
    const path = container.querySelector("path.leaflet-interactive")!;
    fireEvent.mouseOver(path, { clientX: 10, clientY: 10 });
    expect(onHover).toHaveBeenCalledWith("walk-1");
  });

  it("keeps an explicitly selected activity visible even outside the active type filter's date range", async () => {
    const { container } = render(
      <MapView activities={[walk, bike]} hoveredId={null} onHover={() => {}} selectedId="bike-1" />,
    );
    // No type/date filter applied yet, so both render regardless.
    expect(container.querySelectorAll("path.leaflet-interactive")).toHaveLength(2);

    await userEvent.click(screen.getByRole("radio", { name: "Walk" }));
    // Selecting a filter that excludes the selected activity's type still hides it.
    expect(container.querySelectorAll("path.leaflet-interactive")).toHaveLength(1);
  });
});
