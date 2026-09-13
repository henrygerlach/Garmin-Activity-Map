import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeActivity } from "../test/fixtures";
import { ActivityTable } from "./ActivityTable";

describe("ActivityTable", () => {
  it("shows an empty state with no activities", () => {
    render(<ActivityTable activities={[]} hoveredId={null} onHover={() => {}} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText(/Nothing logged yet/)).toBeInTheDocument();
  });

  it("sorts by date descending by default", () => {
    const activities = [
      makeActivity({ id: "old", start_time: "2026-01-01T08:00:00Z" }),
      makeActivity({ id: "new", start_time: "2026-02-01T08:00:00Z" }),
    ];
    render(
      <ActivityTable activities={activities} hoveredId={null} onHover={() => {}} selectedId={null} onSelect={() => {}} />,
    );
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Feb");
    expect(rows[1]).toHaveTextContent("Jan");
  });

  it("toggles sort direction on repeat header clicks, and resets to that column's default on first click", async () => {
    const activities = [
      makeActivity({ id: "a", distance_m: 1000, start_time: "2026-01-01T08:00:00Z" }),
      makeActivity({ id: "b", distance_m: 5000, start_time: "2026-01-02T08:00:00Z" }),
    ];
    render(
      <ActivityTable activities={activities} hoveredId={null} onHover={() => {}} selectedId={null} onSelect={() => {}} />,
    );
    const distanceHeader = screen.getByRole("columnheader", { name: /Distance/ });

    await userEvent.click(distanceHeader.querySelector("button")!);
    expect(distanceHeader).toHaveAttribute("aria-sort", "descending");
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("5.00");

    await userEvent.click(distanceHeader.querySelector("button")!);
    expect(distanceHeader).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("1.00");
  });

  it("calls onHover on mouse enter/leave and onSelect on click", async () => {
    const activity = makeActivity({ id: "a" });
    const onHover = vi.fn();
    const onSelect = vi.fn();
    render(
      <ActivityTable activities={[activity]} hoveredId={null} onHover={onHover} selectedId={null} onSelect={onSelect} />,
    );
    const row = screen.getAllByRole("row")[1];

    await userEvent.hover(row);
    expect(onHover).toHaveBeenCalledWith("a");

    await userEvent.unhover(row);
    expect(onHover).toHaveBeenCalledWith(null);

    await userEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("selects a focused row on Enter or Space, without scrolling on Space", async () => {
    const activity = makeActivity({ id: "a" });
    const onSelect = vi.fn();
    render(
      <ActivityTable activities={[activity]} hoveredId={null} onHover={() => {}} selectedId="a" onSelect={onSelect} />,
    );
    const row = screen.getAllByRole("row")[1];
    expect(row).toHaveAttribute("aria-current", "true");

    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("a");

    await userEvent.keyboard(" ");
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("applies hovered/selected classes", () => {
    const activities = [makeActivity({ id: "a" }), makeActivity({ id: "b" })];
    render(
      <ActivityTable activities={activities} hoveredId="a" onHover={() => {}} selectedId="b" onSelect={() => {}} />,
    );
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0].className).toContain("hovered");
    expect(rows[1].className).toContain("selected");
  });
});
