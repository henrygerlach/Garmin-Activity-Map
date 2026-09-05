import { useRef, useState } from "react";
import type { Bucket } from "../lib/stats";
import { useElementWidth } from "../lib/useElementWidth";

interface BarChartProps {
  data: Bucket[];
  color: string;
  valueFormatter?: (value: number) => string;
  height?: number;
  labelEvery?: number;
}

const PADDING_LEFT = 34;
const PADDING_TOP = 10;
const PADDING_BOTTOM = 20;
// Slots stretch to fill the card and only fall back to MIN_SLOT — at which
// point the chart scrolls — once there are more buckets than will fit.
const MIN_SLOT_WIDTH = 22;
const FALLBACK_SLOT_WIDTH = 34;
const MAX_BAR_WIDTH = 40;
const BAR_SHARE = 0.72;
const GRID_STEPS = 4;
// Once the cursor gets this close to the container's right edge, the tooltip
// no longer has room to open rightward and would run off into the gutter —
// flip it to open to the left of the cursor instead.
const TOOLTIP_FLIP_MARGIN = 140;

function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const residual = value / magnitude;
  const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  return niceResidual * magnitude;
}

function formatAxisValue(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// Rounded top corners only, square baseline — a plain <rect rx> rounds all four.
function roundedTopBarPath(x: number, y: number, width: number, height: number, radius: number): string {
  if (height <= 0) return "";
  const r = Math.min(radius, width / 2, height);
  return `M ${x} ${y + height} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + width - r} ${y} Q ${x + width} ${y} ${x + width} ${y + r} L ${x + width} ${y + height} Z`;
}

export function BarChart({
  data,
  color,
  valueFormatter = (v) => String(v),
  height = 200,
  labelEvery = 1,
}: BarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const availableWidth = useElementWidth(containerRef);

  const plotHeight = height - PADDING_TOP - PADDING_BOTTOM;
  const slotWidth =
    availableWidth > 0 && data.length > 0
      ? Math.max(MIN_SLOT_WIDTH, (availableWidth - PADDING_LEFT) / data.length)
      : FALLBACK_SLOT_WIDTH;
  const barWidth = Math.min(slotWidth * BAR_SHARE, MAX_BAR_WIDTH);
  const chartWidth = PADDING_LEFT + data.length * slotWidth;
  const maxValue = niceCeiling(Math.max(...data.map((d) => d.value), 0));

  function yFor(value: number): number {
    return PADDING_TOP + plotHeight - (value / maxValue) * plotHeight;
  }

  function updatePointer(e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPointer({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  const flip = availableWidth > 0 && pointer.x > availableWidth - TOOLTIP_FLIP_MARGIN;

  return (
    <div className="bar-chart" ref={containerRef} onMouseMove={updatePointer}>
      <svg viewBox={`0 0 ${chartWidth} ${height}`} width="100%" height={height} preserveAspectRatio="xMinYMin meet">
        {Array.from({ length: GRID_STEPS + 1 }, (_, i) => {
          const value = (maxValue / GRID_STEPS) * i;
          const y = yFor(value);
          return (
            <g key={i}>
              <line className="chart-gridline" x1={PADDING_LEFT} x2={chartWidth} y1={y} y2={y} />
              <text className="chart-axis-value" x={PADDING_LEFT - 6} y={y + 3} textAnchor="end">
                {formatAxisValue(value)}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const x = PADDING_LEFT + i * slotWidth + (slotWidth - barWidth) / 2;
          const barHeight = (d.value / maxValue) * plotHeight;
          const y = PADDING_TOP + plotHeight - barHeight;
          const isHovered = hoveredIndex === i;
          return (
            <g
              key={d.label + i}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <rect x={x} y={PADDING_TOP} width={barWidth} height={plotHeight} fill="transparent" />
              <path d={roundedTopBarPath(x, y, barWidth, barHeight, 4)} fill={color} opacity={isHovered ? 1 : 0.82} />
              {i % labelEvery === 0 && (
                <text className="chart-axis-label" x={x + barWidth / 2} y={height - 4} textAnchor="middle">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hoveredIndex !== null && (
        <div
          className="chart-tooltip"
          style={{
            left: pointer.x + (flip ? -12 : 12),
            top: pointer.y - 8,
            transform: `translateY(-100%)${flip ? " translateX(-100%)" : ""}`,
          }}
        >
          <strong>{valueFormatter(data[hoveredIndex].value)}</strong>
          <span>{data[hoveredIndex].label}</span>
        </div>
      )}
    </div>
  );
}
