import { useEffect, useMemo } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { Activity } from "../types";
import { buildFrequencySegments } from "../lib/routeFrequency";
import { frequencyColor } from "../lib/colors";
import { formatDate } from "../lib/format";

interface FrequencyLayerProps {
  activities: Activity[];
  onMaxCountChange: (maxCount: number) => void;
}

// Renders each deduplicated route segment as its own polyline, colored by how
// many activities pass through it. Managed imperatively (like the old
// leaflet.heat layer) rather than as react-leaflet children, since the
// segment set is rebuilt wholesale on every filter change.
export function FrequencyLayer({ activities, onMaxCountChange }: FrequencyLayerProps) {
  const map = useMap();
  const { segments, maxCount } = useMemo(() => buildFrequencySegments(activities), [activities]);

  useEffect(() => {
    onMaxCountChange(maxCount);
  }, [maxCount, onMaxCountChange]);

  useEffect(() => {
    const group = L.layerGroup();
    // Draw least-visited segments first so the most-visited (reddest) ones
    // stay on top instead of being buried under everything drawn after them.
    const sorted = [...segments].sort((a, b) => a.count - b.count);
    for (const segment of sorted) {
      const visitLabel = segment.count === 1 ? "Been here once" : `Been here ${segment.count} times`;
      const sameVisit = segment.firstVisit === segment.lastVisit;
      L.polyline(segment.positions, {
        color: frequencyColor(segment.count, maxCount),
        weight: 4,
        opacity: 0.9,
      })
        .bindTooltip(
          sameVisit
            ? `<strong>${visitLabel}</strong><br/>${formatDate(segment.firstVisit)}`
            : `<strong>${visitLabel}</strong><br/>First: ${formatDate(segment.firstVisit)}<br/>Last: ${formatDate(segment.lastVisit)}`,
          { sticky: true },
        )
        .addTo(group);
    }
    group.addTo(map);
    return () => {
      map.removeLayer(group);
    };
  }, [segments, maxCount, map]);

  return null;
}
