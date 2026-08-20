import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Polyline, Tooltip, useMap } from "react-leaflet";
import type { Activity, ActivityKind } from "../types";
import { formatDate, formatDistance, formatSpeed, formatHr, movingSpeedMps } from "../lib/format";
import { ACTIVITY_COLORS, ACTIVITY_HIGHLIGHT_COLORS } from "../lib/colors";
import { DATE_RANGE_OPTIONS, DATE_RANGE_LABELS, filterByDateRange, type DateRangeOption } from "../lib/dateRange";
import { HeatmapLayer } from "./HeatmapLayer";

function FitBounds({ activities }: { activities: Activity[] }) {
  const map = useMap();

  useEffect(() => {
    const allPoints = activities.flatMap((activity) => activity.points);
    if (allPoints.length === 0) return;
    map.fitBounds(L.latLngBounds(allPoints), { padding: [24, 24] });
    // Only refit when the visible set of activities changes, not on every hover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities, map]);

  return null;
}

function FlyToSelected({ activities, selectedId }: { activities: Activity[]; selectedId: string | null }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedId) return;
    const activity = activities.find((a) => a.id === selectedId);
    if (!activity || activity.points.length === 0) return;
    map.flyToBounds(L.latLngBounds(activity.points), { padding: [64, 64], maxZoom: 16 });
  }, [selectedId, activities, map]);

  return null;
}

interface ActivityPolylineProps {
  activity: Activity;
  isHighlighted: boolean;
  onHover: (id: string | null) => void;
}

function ActivityPolyline({ activity, isHighlighted, onHover }: ActivityPolylineProps) {
  const layerRef = useRef<L.Polyline>(null);

  // Reordering JSX children doesn't reorder Leaflet's own SVG layer stack —
  // Leaflet manages that internally — so bring the layer forward explicitly
  // whenever it becomes the highlighted one.
  useEffect(() => {
    if (isHighlighted) {
      layerRef.current?.bringToFront();
    }
  }, [isHighlighted]);

  return (
    <Polyline
      ref={layerRef}
      positions={activity.points}
      pathOptions={{
        color: isHighlighted ? ACTIVITY_HIGHLIGHT_COLORS[activity.type] : ACTIVITY_COLORS[activity.type],
        weight: isHighlighted ? 6 : 4,
        opacity: isHighlighted ? 1 : 0.7,
      }}
      eventHandlers={{
        mouseover: () => onHover(activity.id),
        mouseout: () => onHover(null),
      }}
    >
      <Tooltip sticky>
        <strong>{activity.name}</strong>
        <br />
        {formatDate(activity.start_time)}
        <br />
        {formatDistance(activity.distance_m)} · {formatSpeed(movingSpeedMps(activity))}
        <br />
        Avg HR: {formatHr(activity.avg_hr)}
      </Tooltip>
    </Polyline>
  );
}

type TypeFilter = "all" | ActivityKind;

const TYPE_FILTER_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "walk", label: "Walk" },
  { value: "bike", label: "Bike" },
];

interface MapViewProps {
  activities: Activity[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  selectedId: string | null;
}

export function MapView({ activities, hoveredId, onHover, selectedId }: MapViewProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [dateRange, setDateRange] = useState<DateRangeOption>("all");
  const [heatmap, setHeatmap] = useState(false);

  const withGps = useMemo(() => activities.filter((a) => a.points.length > 1), [activities]);

  const filtered = useMemo(() => {
    const byType = typeFilter === "all" ? withGps : withGps.filter((a) => a.type === typeFilter);
    return filterByDateRange(byType, dateRange);
  }, [withGps, typeFilter, dateRange]);

  // An explicit click on a table row should always be able to navigate to
  // and highlight that activity, even if the date range would otherwise hide
  // it — the user's direct action overrides that part of the toolbar. The
  // type filter still wins, though: switching it away from the selected
  // activity's type should hide that activity like any other.
  const displayed = useMemo(() => {
    if (!selectedId || filtered.some((a) => a.id === selectedId)) return filtered;
    const selected = withGps.find((a) => a.id === selectedId);
    if (!selected || (typeFilter !== "all" && selected.type !== typeFilter)) return filtered;
    return [...filtered, selected];
  }, [filtered, selectedId, withGps, typeFilter]);

  return (
    <div className="map-page">
      <div className="map-toolbar">
        <div className="segmented" role="group" aria-label="Activity type">
          {TYPE_FILTER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={typeFilter === value}
              className={typeFilter === value ? "segmented__option segmented__option--active" : "segmented__option"}
              onClick={() => setTypeFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Date range">
          {DATE_RANGE_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={dateRange === value}
              className={dateRange === value ? "segmented__option segmented__option--active" : "segmented__option"}
              onClick={() => setDateRange(value)}
            >
              {DATE_RANGE_LABELS[value]}
            </button>
          ))}
        </div>
        <label className="map-toolbar__toggle">
          <input type="checkbox" checked={heatmap} onChange={(e) => setHeatmap(e.target.checked)} />
          Heatmap
        </label>
      </div>
      <div className="map-canvas">
        <MapContainer center={[51.1657, 10.4515]} zoom={6} style={{ height: "100%", width: "100%" }}>
          {/* Carto's Voyager basemap rather than standard OSM tiles: it keeps
              paths, parks and water legible but at a fraction of the
              saturation, so the vermilion and teal traces are the brightest
              thing on the map instead of competing with the roads. */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={20}
          />
          <FitBounds activities={displayed} />
          <FlyToSelected activities={displayed} selectedId={selectedId} />
          {heatmap ? (
            <HeatmapLayer activities={displayed} />
          ) : (
            displayed.map((activity) => (
              <ActivityPolyline
                key={activity.id}
                activity={activity}
                isHighlighted={activity.id === hoveredId || activity.id === selectedId}
                onHover={onHover}
              />
            ))
          )}
        </MapContainer>
      </div>
    </div>
  );
}
