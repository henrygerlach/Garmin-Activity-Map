import { useRef, useState } from "react";
import type { SeriesPoint } from "../lib/stats";
import { useElementWidth } from "../lib/useElementWidth";

export interface LineSeries {
  name: string;
  color: string;
  data: SeriesPoint[];
  dashed?: boolean;
}

interface LineChartProps {
  series: LineSeries[];
  valueFormatter?: (value: number) => string;
  height?: number;
  labelEvery?: number;
}

const PADDING_LEFT = 40;
const PADDING_TOP = 14;
const PADDING_BOTTOM = 22;
const PADDING_RIGHT = 16;
const MIN_SLOT_WIDTH = 22;
const FALLBACK_SLOT_WIDTH = 34;
const GRID_STEPS = 4;

function niceAxisBounds(rawMin: number, rawMax: number): { min: number; max: number } {
  let min = rawMin;
  let max = rawMax;
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = max - min;
  const roughStep = range / GRID_STEPS;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const residual = roughStep / magnitude;
  const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  const step = niceResidual * magnitude;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step };
}

function formatAxisValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function LineKey({ color, dashed, width = 16 }: { color: string; dashed?: boolean; width?: number }) {
  return (
    <svg width={width} height={8} className="line-key">
      <line x1={0} y1={4} x2={width} y2={4} stroke={color} strokeWidth={2} strokeDasharray={dashed ? "4 3" : undefined} />
    </svg>
  );
}

export function LineChart({ series, valueFormatter = (v) => String(v), height = 220, labelEvery = 1 }: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const availableWidth = useElementWidth(containerRef);
  const pointCount = series[0]?.data.length ?? 0;
  const labels = series[0]?.data.map((d) => d.label) ?? [];
  const slotWidth =
    availableWidth > 0 && pointCount > 0
      ? Math.max(MIN_SLOT_WIDTH, (availableWidth - PADDING_LEFT - PADDING_RIGHT) / pointCount)
      : FALLBACK_SLOT_WIDTH;
  const plotWidth = pointCount * slotWidth;
  const chartWidth = PADDING_LEFT + plotWidth + PADDING_RIGHT;
  const plotHeight = height - PADDING_TOP - PADDING_BOTTOM;

  const allValues = series.flatMap((s) => s.data.map((d) => d.value)).filter((v): v is number => v !== null);
  const { min: axisMin, max: axisMax } = niceAxisBounds(
    allValues.length ? Math.min(...allValues) : 0,
    allValues.length ? Math.max(...allValues) : 1,
  );

  function xFor(i: number): number {
    return PADDING_LEFT + i * slotWidth + slotWidth / 2;
  }
  function yFor(value: number): number {
    return PADDING_TOP + plotHeight - ((value - axisMin) / (axisMax - axisMin)) * plotHeight;
  }

  function segmentsFor(data: SeriesPoint[]): { x: number; y: number }[][] {
    const segments: { x: number; y: number }[][] = [];
    let current: { x: number; y: number }[] = [];
    data.forEach((point, i) => {
      if (point.value === null) {
        if (current.length) segments.push(current);
        current = [];
        return;
      }
      current.push({ x: xFor(i), y: yFor(point.value) });
    });
    if (current.length) segments.push(current);
    return segments;
  }

  function lastKnownPoint(data: SeriesPoint[]): { index: number; value: number } | null {
    for (let i = data.length - 1; i >= 0; i--) {
      const value = data[i].value;
      if (value !== null) return { index: i, value };
    }
    return null;
  }

  function updatePointer(e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || pointCount === 0) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPointer({ x, y }); // CSS-pixel space, for positioning the HTML tooltip

    // The SVG's viewBox coordinate space (used by xFor/PADDING_LEFT/SLOT_WIDTH)
    // only matches CSS pixels 1:1 when the chart is rendered at its native
    // width. It's scaled to fit its container (width="100%"), so convert
    // before doing index math — otherwise the offset grows with mouse
    // position as the two scales diverge.
    const scaleX = chartWidth / rect.width;
    const xInViewBox = x * scaleX;
    const rawIndex = Math.round((xInViewBox - PADDING_LEFT - slotWidth / 2) / slotWidth);
    setHoverIndex(Math.min(Math.max(rawIndex, 0), pointCount - 1));
  }

  if (pointCount === 0) return null;

  const hovered = hoverIndex !== null;

  return (
    <div className="line-chart" ref={containerRef} onMouseMove={updatePointer} onMouseLeave={() => setHoverIndex(null)}>
      <svg viewBox={`0 0 ${chartWidth} ${height}`} width="100%" height={height} preserveAspectRatio="xMinYMin meet">
        {Array.from({ length: GRID_STEPS + 1 }, (_, i) => {
          const value = axisMin + ((axisMax - axisMin) / GRID_STEPS) * i;
          const y = yFor(value);
          return (
            <g key={i}>
              <line className="chart-gridline" x1={PADDING_LEFT} x2={chartWidth - PADDING_RIGHT} y1={y} y2={y} />
              <text className="chart-axis-value" x={PADDING_LEFT - 8} y={y + 3} textAnchor="end">
                {formatAxisValue(value)}
              </text>
            </g>
          );
        })}

        {hovered && (
          <line
            className="chart-cursor"
            x1={xFor(hoverIndex)}
            x2={xFor(hoverIndex)}
            y1={PADDING_TOP}
            y2={PADDING_TOP + plotHeight}
          />
        )}

        {series.map((s) => {
          const last = lastKnownPoint(s.data);
          return (
            <g key={s.name}>
              {segmentsFor(s.data).map((segment, si) => (
                <path
                  key={si}
                  d={segment.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={s.dashed ? "6 4" : undefined}
                />
              ))}
              {last && (
                <g>
                  <circle className="chart-point-halo" cx={xFor(last.index)} cy={yFor(last.value)} r={5} />
                  <circle cx={xFor(last.index)} cy={yFor(last.value)} r={4} fill={s.color} />
                </g>
              )}
            </g>
          );
        })}

        {labels.map((label, i) =>
          i % labelEvery === 0 ? (
            <text className="chart-axis-label" key={i} x={xFor(i)} y={height - 6} textAnchor="middle">
              {label}
            </text>
          ) : null,
        )}
      </svg>

      <div className="line-chart__legend">
        {series.map((s) => (
          <span key={s.name} className="line-chart__legend-item">
            <LineKey color={s.color} dashed={s.dashed} />
            {s.name}
          </span>
        ))}
      </div>

      {hovered && (
        <div className="chart-tooltip" style={{ left: pointer.x + 12, top: pointer.y - 12 }}>
          <div className="chart-tooltip__label">{labels[hoverIndex]}</div>
          {series.map((s) => {
            const point = s.data[hoverIndex];
            return (
              <div key={s.name} className="chart-tooltip__row">
                <LineKey color={s.color} dashed={s.dashed} width={12} />
                <strong>{point.value === null ? "—" : valueFormatter(point.value)}</strong>
                <span>{s.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
