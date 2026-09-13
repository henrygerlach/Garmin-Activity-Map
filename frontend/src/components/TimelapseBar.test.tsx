import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TimelapseBar } from "./TimelapseBar";

const days = [new Date("2026-01-01"), new Date("2026-01-02"), new Date("2026-01-03")];

function renderBar(overrides: Partial<React.ComponentProps<typeof TimelapseBar>> = {}) {
  const props = {
    days,
    dayIndex: 1,
    onScrub: vi.fn(),
    playing: false,
    onTogglePlay: vi.fn(),
    speed: 1 as const,
    onSpeedChange: vi.fn(),
    revealedCount: 5,
    revealedDistanceM: 12345,
    ...overrides,
  };
  render(<TimelapseBar {...props} />);
  return props;
}

describe("TimelapseBar", () => {
  it("renders nothing when there is no day at the cursor", () => {
    const { container } = render(
      <TimelapseBar
        days={[]}
        dayIndex={0}
        onScrub={() => {}}
        playing={false}
        onTogglePlay={() => {}}
        speed={1}
        onSpeedChange={() => {}}
        revealedCount={0}
        revealedDistanceM={0}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("labels the play button by playing state", () => {
    const { rerender } = render(
      <TimelapseBar
        days={days}
        dayIndex={0}
        onScrub={() => {}}
        playing={false}
        onTogglePlay={() => {}}
        speed={1}
        onSpeedChange={() => {}}
        revealedCount={0}
        revealedDistanceM={0}
      />,
    );
    expect(screen.getByRole("button", { name: "Play time-lapse" })).toBeInTheDocument();

    rerender(
      <TimelapseBar
        days={days}
        dayIndex={0}
        onScrub={() => {}}
        playing={true}
        onTogglePlay={() => {}}
        speed={1}
        onSpeedChange={() => {}}
        revealedCount={0}
        revealedDistanceM={0}
      />,
    );
    expect(screen.getByRole("button", { name: "Pause time-lapse" })).toBeInTheDocument();
  });

  it("calls onTogglePlay when the play button is clicked", async () => {
    const props = renderBar();
    await userEvent.click(screen.getByRole("button", { name: "Play time-lapse" }));
    expect(props.onTogglePlay).toHaveBeenCalled();
  });

  it("marks the current speed as checked and switches speed on click", async () => {
    const props = renderBar({ speed: 1 });
    expect(screen.getByRole("radio", { name: "1×" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "2×" }));
    expect(props.onSpeedChange).toHaveBeenCalledWith(2);
  });

  it("scrubs to a day index via the range input", () => {
    const props = renderBar({ dayIndex: 1 });
    const slider = screen.getByRole("slider", { name: "Time-lapse date" });
    expect(slider).toHaveAttribute("max", "2");
    fireEvent.change(slider, { target: { value: "2" } });
    expect(props.onScrub).toHaveBeenCalledWith(2);
  });

  it("shows the revealed totals and formatted date", () => {
    renderBar({ dayIndex: 0, revealedCount: 5, revealedDistanceM: 12345 });
    expect(screen.getByText(/5 · 12 km/)).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });
});
