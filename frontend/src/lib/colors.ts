import type { ActivityKind } from "../types";

export const ACTIVITY_COLORS: Record<ActivityKind, string> = {
  walk: "#2563eb",
  bike: "#9333ea",
};

// Lighter tints used to make a hovered/selected line stand out against the
// mass of other same-type lines, instead of just a thicker version of the
// same color.
export const ACTIVITY_HIGHLIGHT_COLORS: Record<ActivityKind, string> = {
  walk: "#93c5fd",
  bike: "#d8b4fe",
};
