import { useMemo, useState } from "react";
import type { Activity } from "../types";
import {
  formatBpmValue,
  formatDateCompact,
  formatDuration,
  formatKmValue,
  formatKmhValue,
  movingSpeedMps,
} from "../lib/format";
import { RouteGlyph } from "./RouteGlyph";

const TYPE_LABEL: Record<Activity["type"], string> = {
  walk: "Walk",
  bike: "Bike",
};

type SortColumn = "type" | "date" | "distance" | "movingTime" | "speed" | "hr";
type SortDirection = "asc" | "desc";

const COLUMNS: { key: SortColumn; label: string; unit?: string }[] = [
  { key: "type", label: "Route" },
  { key: "date", label: "Date" },
  { key: "distance", label: "Distance", unit: "km" },
  { key: "movingTime", label: "Moving" },
  { key: "speed", label: "Speed", unit: "km/h" },
  { key: "hr", label: "Avg HR", unit: "bpm" },
];

// A new column defaults to the ordering that puts the "interesting" end
// first — most recent, farthest, fastest — rather than always ascending.
const DEFAULT_DIRECTION: Record<SortColumn, SortDirection> = {
  type: "asc",
  date: "desc",
  distance: "desc",
  movingTime: "desc",
  speed: "desc",
  hr: "desc",
};

function sortValue(activity: Activity, column: SortColumn): number | string {
  switch (column) {
    case "type":
      return activity.type;
    case "date":
      return activity.start_time;
    case "distance":
      return activity.distance_m;
    case "movingTime":
      return activity.moving_duration_s;
    case "speed":
      return movingSpeedMps(activity) ?? -1;
    case "hr":
      return activity.avg_hr ?? -1;
  }
}

interface ActivityTableProps {
  activities: Activity[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ActivityTable({ activities, hoveredId, onHover, selectedId, onSelect }: ActivityTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sorted = useMemo(() => {
    const copy = [...activities];
    copy.sort((a, b) => {
      const va = sortValue(a, sortColumn);
      const vb = sortValue(b, sortColumn);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [activities, sortColumn, sortDirection]);

  if (activities.length === 0) {
    return (
      <p className="empty-state">Nothing logged yet. Sync to pull your walks and rides from Garmin Connect.</p>
    );
  }

  function handleHeaderClick(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection(DEFAULT_DIRECTION[column]);
    }
  }

  return (
    <table className="activity-table">
      <thead>
        <tr>
          {COLUMNS.map(({ key, label, unit }) => {
            const isSorted = sortColumn === key;
            return (
              <th
                key={key}
                scope="col"
                // aria-sort is what tells a screen reader which column the list
                // is ordered by; the arrow glyph alone says nothing.
                aria-sort={isSorted ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
              >
                <button type="button" className="activity-table__sort" onClick={() => handleHeaderClick(key)}>
                  <span className="activity-table__sort-label">
                    {label}
                    {isSorted && <span className="sort-arrow">{sortDirection === "asc" ? "▲" : "▼"}</span>}
                  </span>
                  {unit && <span className="activity-table__unit">{unit}</span>}
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sorted.map((activity) => {
          const classes = [
            activity.id === hoveredId ? "hovered" : "",
            activity.id === selectedId ? "selected" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <tr
              key={activity.id}
              className={classes || undefined}
              onMouseEnter={() => onHover(activity.id)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(activity.id)}
            >
              <td>
                <span className="activity-table__route">
                  <RouteGlyph points={activity.points} kind={activity.type} />
                  {TYPE_LABEL[activity.type]}
                </span>
              </td>
              <td>{formatDateCompact(activity.start_time)}</td>
              <td className="activity-table__num">{formatKmValue(activity.distance_m)}</td>
              <td className="activity-table__num">{formatDuration(activity.moving_duration_s)}</td>
              <td className="activity-table__num">{formatKmhValue(movingSpeedMps(activity))}</td>
              <td className="activity-table__num">{formatBpmValue(activity.avg_hr)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
