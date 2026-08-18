import { useRef, useState } from "react";
import type { DayActivity } from "../lib/stats";
import { formatDistance } from "../lib/format";

interface CalendarHeatmapProps {
  days: DayActivity[];
}

const CELL_SIZE = 11;
const CELL_GAP = 3;
const ROW_LABEL_WIDTH = 28;
const TOP_PADDING = 16;
const STEP = CELL_SIZE + CELL_GAP;

// Sequential, one hue, light -> dark — magnitude encoding, not identity.
const LEVEL_COLORS = ["#eef1f5", "#bfdbfe", "#60a5fa", "#2563eb", "#1e3a8a"];
const ROW_LABELS: (string | null)[] = ["Mon", null, "Wed", null, "Fri", null, null];

function buildWeeks(days: DayActivity[]): (DayActivity | null)[][] {
  if (days.length === 0) return [];
  const weeks: (DayActivity | null)[][] = [];
  let currentWeek: (DayActivity | null)[] = [];

  const firstDow = (days[0].date.getDay() + 6) % 7; // Mon = 0 .. Sun = 6
  for (let i = 0; i < firstDow; i++) currentWeek.push(null);

  for (const day of days) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }
  return weeks;
}

// Level thresholds from the data's own distribution (quartiles of active
// days), rather than a hardcoded km scale — adapts to whoever's data it is.
function computeThresholds(days: DayActivity[]): [number, number, number] {
  const active = days.map((d) => d.distanceM).filter((v) => v > 0).sort((a, b) => a - b);
  if (active.length === 0) return [0, 0, 0];
  const quantile = (p: number) => active[Math.min(active.length - 1, Math.floor(p * active.length))];
  return [quantile(0.25), quantile(0.5), quantile(0.75)];
}

function levelFor(distanceM: number, thresholds: [number, number, number]): number {
  if (distanceM <= 0) return 0;
  if (distanceM <= thresholds[0]) return 1;
  if (distanceM <= thresholds[1]) return 2;
  if (distanceM <= thresholds[2]) return 3;
  return 4;
}

export function CalendarHeatmap({ days }: CalendarHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{ day: DayActivity; x: number; y: number } | null>(null);

  if (days.length === 0) return null;

  const weeks = buildWeeks(days);
  const thresholds = computeThresholds(days);
  const width = ROW_LABEL_WIDTH + weeks.length * STEP;
  const height = TOP_PADDING + 7 * STEP;

  let lastMonth = -1;

  function showTooltip(day: DayActivity, e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHovered({ day, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  return (
    <div className="calendar-heatmap" ref={containerRef} onMouseLeave={() => setHovered(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="xMinYMin meet">
        {ROW_LABELS.map((label, row) =>
          label ? (
            <text key={row} x={0} y={TOP_PADDING + row * STEP + CELL_SIZE - 2} fontSize={9} fill="#9ca3af">
              {label}
            </text>
          ) : null,
        )}
        {weeks.map((week, col) => {
          const x = ROW_LABEL_WIDTH + col * STEP;
          const firstDay = week.find((d): d is DayActivity => d !== null);
          let monthLabel: string | null = null;
          if (firstDay) {
            const month = firstDay.date.getMonth();
            if (month !== lastMonth) {
              monthLabel = firstDay.date.toLocaleDateString(undefined, { month: "short" });
              lastMonth = month;
            }
          }
          return (
            <g key={col}>
              {monthLabel && (
                <text x={x} y={TOP_PADDING - 5} fontSize={9} fill="#9ca3af">
                  {monthLabel}
                </text>
              )}
              {week.map((day, row) => {
                if (!day) return null;
                const y = TOP_PADDING + row * STEP;
                const level = levelFor(day.distanceM, thresholds);
                return (
                  <rect
                    key={row}
                    x={x}
                    y={y}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    rx={2}
                    fill={LEVEL_COLORS[level]}
                    onMouseEnter={(e) => showTooltip(day, e)}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      <div className="calendar-heatmap__legend">
        <span>Less</span>
        {LEVEL_COLORS.map((color) => (
          <span key={color} className="calendar-heatmap__swatch" style={{ background: color }} />
        ))}
        <span>More</span>
      </div>

      {hovered && (
        <div className="calendar-heatmap__tooltip" style={{ left: hovered.x + 12, top: hovered.y - 12 }}>
          <strong>
            {hovered.day.count > 0
              ? `${formatDistance(hovered.day.distanceM)} · ${hovered.day.count} activit${hovered.day.count === 1 ? "y" : "ies"}`
              : "No activity"}
          </strong>
          <span>
            {hovered.day.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
          </span>
        </div>
      )}
    </div>
  );
}
