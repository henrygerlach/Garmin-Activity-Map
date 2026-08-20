import { useEffect, useState, type RefObject } from "react";

/**
 * The rendered CSS width of an element, tracked across resizes.
 *
 * The charts size their own SVG viewBox from the number of data points, so
 * without this they render at a fixed points-per-pixel and leave the rest of
 * a wide card empty. Knowing the available width lets them spread to fill it
 * and only fall back to scrolling once the data is genuinely too dense.
 *
 * Returns 0 before the first measurement; callers fall back to their
 * intrinsic sizing for that first paint.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
