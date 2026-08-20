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

// Sequential, one hue, light -> dark: magnitude encoding, not identity. Runs
// from the paper toward the bike teal so the calendar sits inside the palette
// instead of introducing a fourth colour.
export const CALENDAR_LEVEL_COLORS = ["#e4e7de", "#bcd9d3", "#7fbdb3", "#3f9a8f", "#0e6b64"];
