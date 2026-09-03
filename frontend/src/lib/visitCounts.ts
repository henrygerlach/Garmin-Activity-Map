import type { Activity } from "../types";

// How close another track has to be to count as "the same spot". GPS traces of
// the same footpath scatter by several metres, so an exact coordinate match
// would always return 1; 25 m is roughly a street width.
const SAME_SPOT_METERS = 25;

// Cells are half the radius and a query unions the 5x5 block around the cursor,
// so every track within 25 m is counted and the fuzz beyond it stays bounded at
// ~40 m. One 25 m cell on its own wouldn't do: a track 5 m away but on the far
// side of a cell edge would be missed.
const CELL_METERS = SAME_SPOT_METERS / 2;
const NEIGHBOUR_CELLS = 2;
const METERS_PER_DEG_LAT = 111_320;

// A wild GPS point can put a single segment hundreds of kilometres long. Cap
// the sampling so one bad point can't stall the build; the marks along it just
// get sparser.
const MAX_SEGMENT_STEPS = 200;

export interface VisitIndex {
  /** How many of the indexed activities pass within ~25 m of this position. */
  countAt(lat: number, lng: number): number;
}

/**
 * Buckets every activity's track into a grid of small cells so a hover can ask
 * "how many activities have been here?" with a handful of lookups. The grid is built
 * on the first query rather than up front, so changing a filter stays instant.
 */
export function createVisitIndex(activities: Activity[]): VisitIndex {
  const latStep = CELL_METERS / METERS_PER_DEG_LAT;
  // Longitude degrees shrink towards the poles. Every activity sits in the same
  // region, so one reference latitude keeps the cells square without doing
  // trigonometry per point.
  const refLat = activities[0]?.points[0]?.[0] ?? 0;
  const lngStep = latStep / Math.max(Math.cos((refLat * Math.PI) / 180), 0.01);

  const cellKey = (latCell: number, lngCell: number) => `${latCell}:${lngCell}`;

  let cells: Map<string, Set<number>> | null = null;

  function build() {
    const grid = new Map<string, Set<number>>();

    const mark = (lat: number, lng: number, activityIndex: number) => {
      const key = cellKey(Math.floor(lat / latStep), Math.floor(lng / lngStep));
      const seen = grid.get(key);
      if (seen) seen.add(activityIndex);
      else grid.set(key, new Set([activityIndex]));
    };

    activities.forEach((activity, activityIndex) => {
      const { points } = activity;
      if (points.length > 0) mark(points[0][0], points[0][1], activityIndex);

      // Walk each segment rather than only its endpoints: consecutive fixes can
      // be further apart than a cell, which would leave gaps along the track.
      for (let i = 1; i < points.length; i += 1) {
        const [fromLat, fromLng] = points[i - 1];
        const [toLat, toLng] = points[i];
        const cellsSpanned = Math.hypot((toLat - fromLat) / latStep, (toLng - fromLng) / lngStep);
        const steps = Math.min(Math.max(1, Math.ceil(cellsSpanned * 2)), MAX_SEGMENT_STEPS);
        for (let step = 1; step <= steps; step += 1) {
          const t = step / steps;
          mark(fromLat + (toLat - fromLat) * t, fromLng + (toLng - fromLng) * t, activityIndex);
        }
      }
    });

    return grid;
  }

  return {
    countAt(lat, lng) {
      if (!cells) cells = build();
      const latCell = Math.floor(lat / latStep);
      const lngCell = Math.floor(lng / lngStep);
      const here = new Set<number>();
      for (let dLat = -NEIGHBOUR_CELLS; dLat <= NEIGHBOUR_CELLS; dLat += 1) {
        for (let dLng = -NEIGHBOUR_CELLS; dLng <= NEIGHBOUR_CELLS; dLng += 1) {
          const cell = cells.get(cellKey(latCell + dLat, lngCell + dLng));
          if (cell) for (const activityIndex of cell) here.add(activityIndex);
        }
      }
      return here.size;
    },
  };
}

/**
 * The point on a track closest to (lat, lng).
 *
 * A hover reports where the *cursor* is, which Leaflet accepts within a few
 * pixels of the line — and at low zoom a few pixels is hundreds of metres, far
 * enough to miss the track's own cell. Snapping the query back onto the line
 * being hovered keeps the count anchored to the path itself at every zoom.
 */
export function nearestPointOnTrack(
  points: [number, number][],
  lat: number,
  lng: number,
): [number, number] | null {
  if (points.length === 0) return null;

  // Work in a flat lat/lng space, squashing longitude so a degree east is worth
  // the same as a degree north. Over a single track that's exact enough to pick
  // the right segment.
  const lngScale = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const px = lng * lngScale;

  let nearest = points[0];
  let nearestDistance = Infinity;

  for (let i = 1; i < points.length; i += 1) {
    const ay = points[i - 1][0];
    const ax = points[i - 1][1] * lngScale;
    const dy = points[i][0] - ay;
    const dx = points[i][1] * lngScale - ax;

    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (lat - ay) * dy) / lengthSq));
    const closestY = ay + dy * t;
    const closestX = ax + dx * t;

    const distance = (px - closestX) ** 2 + (lat - closestY) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = [closestY, closestX / lngScale];
    }
  }

  return nearest;
}
