import type { ActivityKind } from "../types";

// Blaze vermilion and deep teal — a waymarker pair. Chosen over a blue/purple
// split because these sit on top of map tiles: blue reads as water, and the
// two hues here stay distinguishable for red-green colour blindness.
export const ACTIVITY_COLORS: Record<ActivityKind, string> = {
  walk: "#d2451e",
  bike: "#0e7c74",
};

// Lighter tints used to make a hovered/selected line stand out against the
// mass of other same-type lines, instead of just a thicker version of the
// same color.
export const ACTIVITY_HIGHLIGHT_COLORS: Record<ActivityKind, string> = {
  walk: "#f08a63",
  bike: "#4fc0b5",
};

// For series that count activities rather than identifying a type — graphite,
// so a neutral bar never reads as "some third kind of activity".
export const CHART_NEUTRAL = "#8d9287";

const PERIOD_RAMP_BASE: [number, number, number] = [196, 201, 191];
const ACTIVITY_RGB: Record<ActivityKind, [number, number, number]> = {
  walk: [210, 69, 30],
  bike: [14, 124, 116],
};

/**
 * Colours for `count` series that differ by time period rather than by kind,
 * running from pale to the activity's own colour — so the oldest period reads
 * as faded and the newest as full strength. Ordered data gets a sequential
 * ramp, and tying it to the existing hue keeps the chart from introducing a
 * fourth colour that would compete with "walk" and "bike".
 */
export function periodColors(type: ActivityKind, count: number): string[] {
  const to = ACTIVITY_RGB[type];
  if (count <= 1) return [ACTIVITY_COLORS[type]];
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const [r, g, b] = PERIOD_RAMP_BASE.map((from, c) => Math.round(from + (to[c] - from) * t));
    return `rgb(${r}, ${g}, ${b})`;
  });
}

// Sequential, one hue, light -> dark: magnitude encoding, not identity. Runs
// from the paper toward the bike teal so the calendar sits inside the palette
// instead of introducing a fourth colour.
export const CALENDAR_LEVEL_COLORS = ["#e4e7de", "#bcd9d3", "#7fbdb3", "#3f9a8f", "#0e6b64"];

// Route-frequency scale: green (been there once) through amber and orange to
// red (visited most). Requested explicitly as green-to-red rather than the
// usual single-hue sequential ramp, so lightness is made to fall alongside
// hue on top of the green->red run — a deuteranope who can't separate the
// hues can still read the gradient from the darkening value.
const FREQUENCY_STOPS: [number, number, number][] = [
  [46, 158, 79], // green — visited once
  [217, 184, 41], // amber
  [224, 122, 39], // orange
  [176, 30, 30], // red — visited most
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
