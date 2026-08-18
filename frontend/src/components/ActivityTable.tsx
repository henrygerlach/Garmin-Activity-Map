import { useMemo, useState } from "react";
import type { Activity } from "../types";
import { formatDate, formatDistance, formatDuration, formatSpeed, formatHr, movingSpeedMps } from "../lib/format";

const TYPE_LABEL: Record<Activity["type"], string> = {
  walk: "Walk",
  bike: "Bike",
};

type SortColumn = "type" | "date" | "distance" | "movingTime" | "speed" | "hr";
type SortDirection = "asc" | "desc";

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "type", label: "Type" },
  { key: "date", label: "Date" },
  { key: "distance", label: "Distance" },
  { key: "movingTime", label: "Moving Time" },
  { key: "speed", label: "Speed" },
  { key: "hr", label: "Avg HR" },
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
    return <p className="empty-state">No activities yet. Click "Update" to sync from Garmin Connect.</p>;
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
          {COLUMNS.map(({ key, label }) => (
            <th key={key} onClick={() => handleHeaderClick(key)} className="sortable">
              {label}
              {sortColumn === key && <span className="sort-arrow">{sortDirection === "asc" ? " ▲" : " ▼"}</span>}
            </th>
          ))}
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
                <span className={`type-dot type-dot--${activity.type}`} />
                {TYPE_LABEL[activity.type]}
              </td>
              <td>{formatDate(activity.start_time)}</td>
              <td>{formatDistance(activity.distance_m)}</td>
              <td>{formatDuration(activity.moving_duration_s)}</td>
              <td>{formatSpeed(movingSpeedMps(activity))}</td>
              <td>{formatHr(activity.avg_hr)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
