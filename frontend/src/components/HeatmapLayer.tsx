import { useEffect } from "react";
import L from "leaflet";
import "leaflet.heat";
import { useMap } from "react-leaflet";
import type { Activity } from "../types";

interface HeatmapLayerProps {
  activities: Activity[];
}

// leaflet.heat extends L directly (no react-leaflet wrapper exists for it),
// so this manages the underlying Leaflet layer imperatively instead of
// rendering a react-leaflet component.
export function HeatmapLayer({ activities }: HeatmapLayerProps) {
  const map = useMap();

  useEffect(() => {
    const points: L.HeatLatLngTuple[] = activities.flatMap((activity) =>
      activity.points.map(([lat, lng]): L.HeatLatLngTuple => [lat, lng, 0.4]),
    );
    const layer = L.heatLayer(points, { radius: 10, blur: 12, maxZoom: 17, max: 3 });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [activities, map]);

  return null;
}
