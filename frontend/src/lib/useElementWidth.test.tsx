import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useElementWidth } from "./useElementWidth";

let observedCallback: ResizeObserverCallback | null = null;
const observe = vi.fn();
const disconnect = vi.fn();

beforeEach(() => {
  observedCallback = null;
  observe.mockReset();
  disconnect.mockReset();
  window.ResizeObserver = vi.fn(function (cb: ResizeObserverCallback) {
    observedCallback = cb;
    return { observe, disconnect, unobserve: vi.fn() };
  }) as unknown as typeof ResizeObserver;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function Probe({ onWidth }: { onWidth: (w: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);
  onWidth(width);
  return <div ref={ref} />;
}

describe("useElementWidth", () => {
  it("returns 0 before any measurement and observes the element", () => {
    const onWidth = vi.fn();
    render(<Probe onWidth={onWidth} />);
    expect(onWidth).toHaveBeenCalledWith(0);
    expect(observe).toHaveBeenCalledTimes(1);
  });

  it("updates when the observer reports a new width", () => {
    const onWidth = vi.fn();
    render(<Probe onWidth={onWidth} />);
    act(() => {
      observedCallback!([{ contentRect: { width: 250 } } as ResizeObserverEntry], {} as ResizeObserver);
    });
    expect(onWidth).toHaveBeenLastCalledWith(250);
  });

  it("disconnects the observer on unmount", () => {
    const { unmount } = render(<Probe onWidth={() => {}} />);
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
