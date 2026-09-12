import { useEffect, useRef, useState } from "react";
import type { Bucket } from "../lib/stats";
import { useElementWidth } from "../lib/useElementWidth";

interface BarChartProps {
  data: Bucket[];
  color: string;
  /** Names the chart for assistive technology; also used to build its summary. */
  title: string;
  valueFormatter?: (value: number) => string;
  height?: number;
  labelEvery?: number;
  /** How many buckets fit the card at once; the rest scroll off to the left. */
  visibleBuckets?: number;
}

const PADDING_LEFT = 34;
const PADDING_TOP = 10;
const PADDING_BOTTOM = 20;
// Slots stretch to fill the card with `visibleBuckets` of them; anything older
// keeps the same slot width and overflows into the horizontal scroll.
const FALLBACK_SLOT_WIDTH = 34;
const MAX_BAR_WIDTH = 40;
const BAR_SHARE = 0.72;
const GRID_STEPS = 4;
// A date label like "23. März" is about 40px at the 10px axis size; below this
// much room per label they touch. The stride the caller asks for is a floor —
// it thins further when the card is narrow, so the same chart stays legible in
// one column, in two, and with the sidebar hidden.
const MIN_LABEL_PITCH = 48;
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

/**
 * A one-line description of what the bars do, for screen readers: how many
 * buckets, over what span, and where the high and low points fall.
 */
function summarise(title: string, data: Bucket[], format: (v: number) => string): string {
  if (data.length === 0) return `${title}. No data.`;
  const values = data.map((d) => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const peak = data[values.indexOf(max)];
  return (
    `${title}. Bar chart, ${data.length} bars from ${data[0].label} to ${data[data.length - 1].label}. ` +
    `Ranges from ${format(min)} to ${format(max)}, highest at ${peak.label}.`
  );
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
  title,
  valueFormatter = (v) => String(v),
  height = 200,
  labelEvery = 1,
  visibleBuckets,
}: BarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const availableWidth = useElementWidth(containerRef);

  const plotHeight = height - PADDING_TOP - PADDING_BOTTOM;
  const slotWidth =
    availableWidth > 0 && data.length > 0
      ? (availableWidth - PADDING_LEFT) / Math.min(data.length, visibleBuckets ?? data.length)
      : FALLBACK_SLOT_WIDTH;
  const labelStride = Math.max(labelEvery, Math.ceil(MIN_LABEL_PITCH / slotWidth));
  const barWidth = Math.min(slotWidth * BAR_SHARE, MAX_BAR_WIDTH);
  const chartWidth = PADDING_LEFT + data.length * slotWidth;
  const maxValue = niceCeiling(Math.max(...data.map((d) => d.value), 0));
  const ticks = Array.from({ length: GRID_STEPS + 1 }, (_, i) => (maxValue / GRID_STEPS) * i);

  function yFor(value: number): number {
    return PADDING_TOP + plotHeight - (value / maxValue) * plotHeight;
  }

  // The newest bucket is the one worth seeing on arrival, so the scroll starts
  // pinned to the right edge and older history is reached by scrolling left.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [chartWidth]);

  function updatePointer(e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    setPointer({ x, y: e.clientY - rect.top });
    // Bars scrolled off to the left sit behind the opaque axis gutter but still
    // catch mouseenter; drop the hover once the cursor is over the gutter so
    // only bars actually on screen have a tooltip.
    if (x < PADDING_LEFT) setHoveredIndex(null);
  }

  const flip = availableWidth > 0 && pointer.x > availableWidth - TOOLTIP_FLIP_MARGIN;

  return (
    <div className="bar-chart" ref={containerRef} onMouseMove={updatePointer}>
      <div className="chart-scroll" ref={scrollRef}>
        {/* The values themselves are only on the hover tooltip, so the chart
            states its own shape — range, span and extremes — in its label
            rather than announcing as an unlabelled graphic. */}
        <svg
          role="img"
          aria-label={summarise(title, data, valueFormatter)}
          viewBox={`0 0 ${chartWidth} ${height}`}
          width={chartWidth}
          height={height}
          preserveAspectRatio="xMinYMin meet"
        >
          {ticks.map((value, i) => (
            <line
              key={i}
              className="chart-gridline"
              x1={PADDING_LEFT}
              x2={chartWidth}
              y1={yFor(value)}
              y2={yFor(value)}
            />
          ))}

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
                {/* style, not fill=: the colour is a var() token and a
                    presentation attribute isn't a CSS context. */}
                <path
                  d={roundedTopBarPath(x, y, barWidth, barHeight, 4)}
                  style={{ fill: color }}
                  opacity={isHovered ? 1 : 0.82}
                />
                {i % labelStride === 0 && (
                  /* The y-axis gutter is drawn over the plot's left edge, so
                     the first label — centred on a bucket that starts right at
                     that edge — would lose its leading characters under it. */
                  <text
                    className="chart-axis-label"
                    x={i === 0 ? PADDING_LEFT : x + barWidth / 2}
                    y={height - 4}
                    textAnchor={i === 0 ? "start" : "middle"}
                  >
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Outside the scroller so the scale stays readable however far back the
          history is scrolled; opaque, so bars slide behind it rather than
          through the numbers. */}
      <svg className="chart-axis-gutter" width={PADDING_LEFT} height={height}>
        {ticks.map((value, i) => (
          <text className="chart-axis-value" key={i} x={PADDING_LEFT - 6} y={yFor(value) + 3} textAnchor="end">
            {formatAxisValue(value)}
          </text>
        ))}
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
