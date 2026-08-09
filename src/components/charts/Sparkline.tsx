import { linePath, niceTicks, scaleMax, toPoints } from "./geometry";

const WIDTH = 120;
const HEIGHT = 28;

/**
 * The shape of the trend behind a stat tile's number — not a chart.
 *
 * No axis, no labels, no hover: it answers "which way, and how steadily", and
 * the number above it already says how much. Anything a reader would need to
 * measure belongs in the chart below, which plots the same series properly.
 *
 * Drawn in the muted hue with the last point in the accent, so the eye lands on
 * where the series ended rather than reading the whole line.
 */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;

  const max = scaleMax(niceTicks(Math.max(0, ...values)));
  const points = toPoints(values, max, WIDTH, HEIGHT);
  const lastValue = values[values.length - 1];

  return (
    // The plot stretches to the tile's width, so the end marker is an HTML dot
    // positioned over it rather than an SVG circle — a circle in a stretched
    // viewBox comes out an oval.
    <div className="relative h-7 w-full" aria-hidden>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        <path
          d={linePath(points)}
          fill="none"
          className="stroke-chart-muted"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="bg-chart-accent absolute size-1.5 -translate-x-full translate-y-1/2 rounded-full"
        style={{ left: "100%", bottom: `${max <= 0 ? 0 : (lastValue / max) * 100}%` }}
      />
    </div>
  );
}
