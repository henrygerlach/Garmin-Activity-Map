import type { ActivityKind } from "../types";

// The palette itself lives in index.css as custom properties, so a hue is
// declared once rather than repeated as hexes here that drift from it.
// What is exported here are references to those tokens, which means every
// consumer has to apply them somewhere var() actually resolves: a `style`
// attribute, a CSS class, or a Leaflet `className` — never a bare SVG
// presentation attribute like fill="...", which is not a CSS context.
export const ACTIVITY_COLORS: Record<ActivityKind, string> = {
  walk: "var(--walk)",
  run: "var(--run)",
  bike: "var(--bike)",
};

export const ACTIVITY_HIGHLIGHT_COLORS: Record<ActivityKind, string> = {
  walk: "var(--walk-hi)",
  run: "var(--run-hi)",
  bike: "var(--bike-hi)",
};

// For series that count activities rather than identifying a type — graphite,
// so a neutral bar never reads as "some third kind of activity".
export const CHART_NEUTRAL = "var(--chart-neutral)";

// Sequential, one hue: magnitude encoding, not identity. Index is the
// heatmap level, 0 meaning "nothing logged that day".
export const CALENDAR_LEVEL_COLORS = [
  "var(--cal-0)",
  "var(--cal-1)",
  "var(--cal-2)",
  "var(--cal-3)",
  "var(--cal-4)",
];

// Route-frequency scale: green (been there once) through amber and orange to
// red (visited most). Requested explicitly as green-to-red rather than the
// usual single-hue sequential ramp, so lightness is made to fall alongside
// hue on top of the green->red run — a deuteranope who can't separate the
// hues can still read the gradient from the darkening value.
//
// Deliberately still literal rgb rather than tokens: these are interpolated
// per segment at draw time, which var() can't do. The stops are pitched at the
// palette's own chroma so the ramp sits with the trace colours, and stay light
// enough to hold up over the inverted basemap.
const FREQUENCY_STOPS: [number, number, number][] = [
  [122, 222, 140], // green — visited once
  [216, 181, 15], // amber
  [232, 127, 41], // orange
  [203, 70, 69], // red — visited most
];

/** Interpolated color for a segment visited `count` times out of `maxCount`. */
export function frequencyColor(count: number, maxCount: number): string {
  // Logarithmic rather than linear: visit counts are heavily skewed (a few
  // trunk routes dominate), so a linear scale would paint almost everything
  // red, which is the exact problem this replaces leaflet.heat for.
  const t = maxCount > 1 ? Math.log(count) / Math.log(maxCount) : 0;
  const clamped = Math.min(Math.max(t, 0), 1);
  const scaled = clamped * (FREQUENCY_STOPS.length - 1);
  const i = Math.min(Math.floor(scaled), FREQUENCY_STOPS.length - 2);
  const localT = scaled - i;
  const [r1, g1, b1] = FREQUENCY_STOPS[i];
  const [r2, g2, b2] = FREQUENCY_STOPS[i + 1];
  const r = Math.round(r1 + (r2 - r1) * localT);
  const g = Math.round(g1 + (g2 - g1) * localT);
  const b = Math.round(b1 + (b2 - b1) * localT);
  return `rgb(${r}, ${g}, ${b})`;
}

export const FREQUENCY_GRADIENT_CSS = `linear-gradient(to right, ${FREQUENCY_STOPS.map(
  ([r, g, b]) => `rgb(${r}, ${g}, ${b})`,
).join(", ")})`;
