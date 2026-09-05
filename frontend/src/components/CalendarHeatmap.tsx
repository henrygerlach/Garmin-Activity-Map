import { useRef, useState } from "react";
import type { DayActivity } from "../lib/stats";
import { formatDistance } from "../lib/format";
import { CALENDAR_LEVEL_COLORS } from "../lib/colors";
import { useElementWidth } from "../lib/useElementWidth";

interface CalendarHeatmapProps {
  days: DayActivity[];
}

// Cells grow to fill the card up to MAX_CELL, so a few months of history
// doesn't leave two thirds of a full-width card empty, and shrink no further
// than MIN_CELL once several years have accumulated.
const MIN_CELL = 11;
const MAX_CELL = 17;
const CELL_GAP = 3;
const ROW_LABEL_WIDTH = 28;
const TOP_PADDING = 16;
// Once the cursor gets this close to the container's right edge, the tooltip
// no longer has room to open rightward and would run off into the gutter —
// flip it to open to the left of the cursor instead.
const TOOLTIP_FLIP_MARGIN = 190;

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
  const availableWidth = useElementWidth(containerRef);
  const [hovered, setHovered] = useState<{ day: DayActivity; x: number; y: number } | null>(null);

  if (days.length === 0) return null;

  const weeks = buildWeeks(days);
  const thresholds = computeThresholds(days);
  const cellSize =
    availableWidth > 0 && weeks.length > 0
      ? Math.min(MAX_CELL, Math.max(MIN_CELL, (availableWidth - ROW_LABEL_WIDTH) / weeks.length - CELL_GAP))
      : MIN_CELL;
  const step = cellSize + CELL_GAP;
  const width = ROW_LABEL_WIDTH + weeks.length * step;
  const height = TOP_PADDING + 7 * step;

  let lastMonth = -1;

  function showTooltip(day: DayActivity, e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHovered({ day, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  const flip = hovered !== null && availableWidth > 0 && hovered.x > availableWidth - TOOLTIP_FLIP_MARGIN;

  return (
    <div className="calendar-heatmap" ref={containerRef} onMouseLeave={() => setHovered(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="xMinYMin meet">
        {ROW_LABELS.map((label, row) =>
          label ? (
            <text className="chart-axis-value" key={row} x={0} y={TOP_PADDING + row * step + cellSize - 2}>
              {label}
            </text>
          ) : null,
        )}
        {weeks.map((week, col) => {
          const x = ROW_LABEL_WIDTH + col * step;
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
                <text className="chart-axis-value" x={x} y={TOP_PADDING - 5}>
                  {monthLabel}
                </text>
              )}
              {week.map((day, row) => {
                if (!day) return null;
                const y = TOP_PADDING + row * step;
                const level = levelFor(day.distanceM, thresholds);
                return (
                  <rect
                    key={row}
                    x={x}
                    y={y}
                    width={cellSize}
                    height={cellSize}
                    rx={2}
                    fill={CALENDAR_LEVEL_COLORS[level]}
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
        {CALENDAR_LEVEL_COLORS.map((color) => (
          <span key={color} className="calendar-heatmap__swatch" style={{ background: color }} />
        ))}
        <span>More</span>
      </div>

      {hovered && (
        <div
          className="chart-tooltip"
          style={{
            left: hovered.x + (flip ? -12 : 12),
            top: hovered.y - 12,
            transform: `translateY(-100%)${flip ? " translateX(-100%)" : ""}`,
          }}
        >
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
