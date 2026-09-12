import { useMemo } from "react";
import { ACTIVITY_COLORS } from "../lib/colors";
import type { ActivityKind } from "../types";

const WIDTH = 26;
const HEIGHT = 20;
const PADDING = 2;
// A single row's trace can carry thousands of fixes; at 26px wide, roughly
// four dozen is already more detail than the glyph can resolve. Sampling
// keeps a list of hundreds of activities cheap to render.
const MAX_POINTS = 48;

interface RouteGlyphProps {
  points: [number, number][];
  kind: ActivityKind;
}

function sample(points: [number, number][]): [number, number][] {
  if (points.length <= MAX_POINTS) return points;
  const stride = (points.length - 1) / (MAX_POINTS - 1);
  return Array.from({ length: MAX_POINTS }, (_, i) => points[Math.round(i * stride)]);
}

/**
 * A miniature of the activity's own GPS trace, normalised into a fixed box.
 *
 * A degree of longitude is shorter than a degree of latitude by cos(latitude),
 * so raw lat/lng would render every route stretched east-west. Scaling
 * longitude by cos(mean latitude) — the same approximation a map projection
 * makes over a distance this small — keeps the silhouette true, which is the
 * whole point: routes are recognisable by shape.
 */
export function RouteGlyph({ points, kind }: RouteGlyphProps) {
  const path = useMemo(() => {
    if (points.length < 2) return null;

    const reduced = sample(points);
    const meanLat = reduced.reduce((sum, [lat]) => sum + lat, 0) / reduced.length;
    const lngScale = Math.cos((meanLat * Math.PI) / 180);

    // y is flipped: latitude grows north, SVG's y grows down.
    const projected = reduced.map(([lat, lng]) => ({ x: lng * lngScale, y: -lat }));

    const xs = projected.map((p) => p.x);
    const ys = projected.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const spanX = Math.max(...xs) - minX;
    const spanY = Math.max(...ys) - minY;

    const boxW = WIDTH - PADDING * 2;
    const boxH = HEIGHT - PADDING * 2;
    // One scale for both axes preserves the shape; a route that is mostly
    // north-south stays tall and narrow instead of being stretched to fill.
    const scale = Math.min(spanX > 0 ? boxW / spanX : Infinity, spanY > 0 ? boxH / spanY : Infinity);
    if (!Number.isFinite(scale)) return null;

    const offsetX = PADDING + (boxW - spanX * scale) / 2;
    const offsetY = PADDING + (boxH - spanY * scale) / 2;

    return projected
      .map((p, i) => {
        const x = offsetX + (p.x - minX) * scale;
        const y = offsetY + (p.y - minY) * scale;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }, [points]);

  if (!path) {
    // No usable track — a hairline placeholder holds the column's rhythm
    // rather than leaving a ragged gap down the list.
    return (
      <svg className="route-glyph route-glyph--empty" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} aria-hidden="true">
        <line x1={PADDING + 3} y1={HEIGHT / 2} x2={WIDTH - PADDING - 3} y2={HEIGHT / 2} />
      </svg>
    );
  }

  return (
    <svg className="route-glyph" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} aria-hidden="true">
      {/* style, not stroke=: the colour is a var() token, and an SVG
          presentation attribute isn't a CSS context for it to resolve in. */}
      <path
        d={path}
        fill="none"
        style={{ stroke: ACTIVITY_COLORS[kind] }}
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
