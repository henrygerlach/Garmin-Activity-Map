import type { Activity } from "../types";

// GPS traces of the same path scatter by several metres between passes, so
// snapping to a grid this size merges overlapping tracks into one line while
// staying tight enough not to blur separate streets together. Widened from an
// initial 15m after real data showed a single trail still splitting into
// several parallel lines.
const CELL_METERS = 30;
const METERS_PER_DEG_LAT = 111_320;

export interface FrequencySegment {
  positions: [[number, number], [number, number]];
  /** How many distinct activities pass through this segment. */
  count: number;
  /** start_time of the earliest activity to pass through this segment. */
  firstVisit: string;
  /** start_time of the most recent activity to pass through this segment. */
  lastVisit: string;
}

export interface FrequencyResult {
  segments: FrequencySegment[];
  maxCount: number;
}

/**
 * Collapses every activity's track into a deduplicated set of line segments,
 * each carrying a count of how many activities pass through it — so a route
 * walked ten times renders as one line instead of ten stacked ones.
 *
 * Consecutive points are snapped to a grid cell; a segment's drawn position is
 * the average of every real point that landed in its two cells, which keeps
 * the line close to its true shape instead of snapping to a blocky grid.
 */
export function buildFrequencySegments(activities: Activity[]): FrequencyResult {
  const withPoints = activities.filter((a) => a.points.length > 1);
  if (withPoints.length === 0) return { segments: [], maxCount: 0 };

  const latStep = CELL_METERS / METERS_PER_DEG_LAT;
  // Every activity sits in the same region, so one reference latitude keeps
  // cells roughly square without doing trigonometry per point.
  const refLat = withPoints[0].points[0][0];
  const lngStep = latStep / Math.max(Math.cos((refLat * Math.PI) / 180), 0.01);

  const cellKey = (lat: number, lng: number) => `${Math.floor(lat / latStep)}:${Math.floor(lng / lngStep)}`;

  // Pass 1: average the real coordinates that fall into each cell, so the
  // drawn line follows the actual path rather than a grid centre.
  const cellSum = new Map<string, { latSum: number; lngSum: number; n: number }>();
  const activityCellSequences: string[][] = withPoints.map((activity) => {
    const sequence: string[] = [];
    for (const [lat, lng] of activity.points) {
      const key = cellKey(lat, lng);
      const entry = cellSum.get(key);
      if (entry) {
        entry.latSum += lat;
        entry.lngSum += lng;
        entry.n += 1;
      } else {
        cellSum.set(key, { latSum: lat, lngSum: lng, n: 1 });
      }
      // Collapse consecutive fixes in the same cell so a slow, wobbly stretch
      // of track doesn't turn into a self-loop edge.
      if (sequence[sequence.length - 1] !== key) sequence.push(key);
    }
    return sequence;
  });

  const cellPosition = new Map<string, [number, number]>();
  for (const [key, { latSum, lngSum, n }] of cellSum) {
    cellPosition.set(key, [latSum / n, lngSum / n]);
  }

  // Pass 2: count distinct activities crossing each undirected cell-to-cell
  // edge. Deduped per activity so one out-and-back ride counts as one visit,
  // matching the "been here N times" language used elsewhere in the app.
  const edgeActivities = new Map<string, Set<number>>();
  activityCellSequences.forEach((sequence, activityIndex) => {
    for (let i = 1; i < sequence.length; i += 1) {
      const a = sequence[i - 1];
      const b = sequence[i];
      const edgeKey = a < b ? `${a}|${b}` : `${b}|${a}`;
      const seen = edgeActivities.get(edgeKey);
      if (seen) seen.add(activityIndex);
      else edgeActivities.set(edgeKey, new Set([activityIndex]));
    }
  });

  let maxCount = 0;
  const segments: FrequencySegment[] = [];
  for (const [edgeKey, activitySet] of edgeActivities) {
    const [a, b] = edgeKey.split("|");
    const posA = cellPosition.get(a);
    const posB = cellPosition.get(b);
    if (!posA || !posB) continue;
    const count = activitySet.size;
    maxCount = Math.max(maxCount, count);

    let firstVisit = "";
    let lastVisit = "";
    for (const activityIndex of activitySet) {
      const { start_time } = withPoints[activityIndex];
      if (!firstVisit || start_time < firstVisit) firstVisit = start_time;
      if (!lastVisit || start_time > lastVisit) lastVisit = start_time;
    }

    segments.push({ positions: [posA, posB], count, firstVisit, lastVisit });
  }

  return { segments, maxCount };
}
