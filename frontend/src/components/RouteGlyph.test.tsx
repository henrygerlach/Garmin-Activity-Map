import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouteGlyph } from "./RouteGlyph";

describe("RouteGlyph", () => {
  it("renders a placeholder line for fewer than two points", () => {
    const { container } = render(<RouteGlyph points={[]} kind="walk" />);
    expect(container.querySelector("svg")?.classList).toContain("route-glyph--empty");
    expect(container.querySelector("line")).not.toBeNull();
  });

  it("renders a placeholder for a degenerate single-point track", () => {
    const { container } = render(<RouteGlyph points={[[52.5, 13.4]]} kind="walk" />);
    expect(container.querySelector("svg")?.classList).toContain("route-glyph--empty");
  });

  it("renders a path for a real track, colored by activity kind", () => {
    const points: [number, number][] = [
      [52.5, 13.4],
      [52.51, 13.41],
      [52.52, 13.39],
    ];
    const { container } = render(<RouteGlyph points={points} kind="run" />);
    const path = container.querySelector("path");
    expect(path).not.toBeNull();
    expect(path?.getAttribute("d")).toMatch(/^M .* L .* L /);
    expect(path?.style.stroke).toBe("var(--run)");
  });

  it("samples down a very dense track rather than plotting every point", () => {
    const points: [number, number][] = Array.from({ length: 500 }, (_, i) => [52.5 + i * 0.0001, 13.4 + i * 0.0001]);
    const { container } = render(<RouteGlyph points={points} kind="bike" />);
    const path = container.querySelector("path")!;
    const segments = path.getAttribute("d")!.split(" L ").length;
    expect(segments).toBeLessThanOrEqual(48);
  });

  it("falls back to a placeholder when every point collapses to the same spot", () => {
    const points: [number, number][] = [
      [52.5, 13.4],
      [52.5, 13.4],
    ];
    const { container } = render(<RouteGlyph points={points} kind="walk" />);
    expect(container.querySelector("svg")?.classList).toContain("route-glyph--empty");
  });
});
