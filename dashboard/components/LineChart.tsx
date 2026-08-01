/**
 * components/LineChart.tsx
 * Minimal hand-rolled SVG line chart — no charting library dependency.
 *
 * The dashboard only ever needs to plot a handful of short numeric series
 * (a few metrics x a few policy versions), so a small dependency-free
 * component is faster to get right and verify than pulling in a charting
 * library under time pressure. If this dashboard grows non-trivial chart
 * needs later, that's the point to reach for a real library.
 *
 * Pure server-renderable — no hooks, no client-side interactivity, so it
 * needs no "use client" directive and adds zero client JS.
 */

export interface Series {
  label: string;
  color: string;
  points: { x: number; y: number }[];
  dashed?: boolean;
}

interface LineChartProps {
  series: Series[];
  width?: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
  /** Format the x value shown at each axis tick. */
  formatX?: (x: number) => string;
  /** Format the y value shown at each axis tick and in the legend. */
  formatY?: (y: number) => string;
}

const PADDING = { top: 20, right: 24, bottom: 44, left: 56 };

export function LineChart({
  series,
  width = 640,
  height = 320,
  xLabel,
  yLabel,
  formatX = (x) => String(x),
  formatY = (y) => y.toFixed(2),
}: LineChartProps) {
  const allPoints = series.flatMap((s) => s.points);
  if (allPoints.length === 0) {
    return <div style={{ color: '#888' }}>אין נתונים</div>;
  }

  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  // A hair of padding on the y-axis so lines near the top/bottom aren't clipped.
  const yPad = (yMax - yMin) * 0.08 || 0.05;
  const yLo = yMin - yPad, yHi = yMax + yPad;

  const plotW = width - PADDING.left - PADDING.right;
  const plotH = height - PADDING.top - PADDING.bottom;

  const sx = (x: number) => PADDING.left + (xMax === xMin ? plotW / 2 : ((x - xMin) / (xMax - xMin)) * plotW);
  const sy = (y: number) => PADDING.top + plotH - ((y - yLo) / (yHi - yLo)) * plotH;

  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => yLo + ((yHi - yLo) * i) / yTicks);

  const xTickValues = Array.from(new Set(xs)).sort((a, b) => a - b);

  return (
    <svg width={width} height={height} role="img" aria-label={yLabel ?? 'chart'}>
      {/* Gridlines + y-axis labels */}
      {yTickValues.map((yVal, i) => (
        <g key={i}>
          <line
            x1={PADDING.left} x2={width - PADDING.right}
            y1={sy(yVal)} y2={sy(yVal)}
            stroke="var(--chart-grid, #e5e5e5)" strokeWidth={1}
          />
          <text x={PADDING.left - 8} y={sy(yVal)} textAnchor="end" dominantBaseline="middle"
            fontSize={11} fill="var(--chart-text, #666)">
            {formatY(yVal)}
          </text>
        </g>
      ))}

      {/* x-axis labels */}
      {xTickValues.map((xVal, i) => (
        <text key={i} x={sx(xVal)} y={height - PADDING.bottom + 18} textAnchor="middle"
          fontSize={11} fill="var(--chart-text, #666)">
          {formatX(xVal)}
        </text>
      ))}

      {/* Axis titles */}
      {xLabel && (
        <text x={PADDING.left + plotW / 2} y={height - 6} textAnchor="middle"
          fontSize={12} fill="var(--chart-text, #666)">
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text
          x={14} y={PADDING.top + plotH / 2}
          textAnchor="middle" fontSize={12} fill="var(--chart-text, #666)"
          transform={`rotate(-90 14 ${PADDING.top + plotH / 2})`}
        >
          {yLabel}
        </text>
      )}

      {/* Series lines + points */}
      {series.map((s, i) => {
        const sorted = [...s.points].sort((a, b) => a.x - b.x);
        const d = sorted.map((p, j) => `${j === 0 ? 'M' : 'L'} ${sx(p.x)} ${sy(p.y)}`).join(' ');
        return (
          <g key={i}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={2.5}
              strokeDasharray={s.dashed ? '6 4' : undefined} />
            {sorted.map((p, j) => (
              <circle key={j} cx={sx(p.x)} cy={sy(p.y)} r={3.5} fill={s.color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
