/**
 * The arithmetic every chart here shares: where a value sits, and what the
 * axis is allowed to say.
 *
 * Pure, and separate from the components that draw with it, so the parts that
 * can be wrong quietly — a tick scale that lies, a path that collapses on a
 * single point — are checkable without rendering anything.
 *
 * ## Why the charts are drawn this way
 *
 * Each plot is an SVG with a fixed `viewBox` scaled to its container by CSS,
 * with two rules that follow from that:
 *
 *  - Strokes carry `vector-effect="non-scaling-stroke"`, so a 2px line is 2px
 *    on a phone and 2px on a monitor rather than the ~1px a squeezed viewBox
 *    would give it.
 *  - No text goes inside the SVG. Axis ticks, labels and legends are HTML
 *    beside it, so they are real text at real sizes — selectable, translatable,
 *    and never scaled to 6px on a narrow screen.
 *
 * The alternative — measuring the container and rendering at true pixel size —
 * needs JavaScript before anything appears, and these charts are on a page that
 * should render on the server and be readable immediately.
 */

/** The plot's own coordinate space. Aspect only; CSS decides the real size. */
export const PLOT = { width: 720, height: 220 } as const;

/**
 * Ticks a person would have chosen: 0 / 250 / 500 / 750 / 1,000, never
 * 0 / 237 / 474.
 *
 * Returns the tick values including 0 and the top, so the caller can both draw
 * the gridlines and use the last one as the scale's maximum — the axis and the
 * geometry cannot disagree, because they are the same number.
 */
export function niceTicks(max: number, count = 4): number[] {
  // An all-zero series still gets a real axis; without this the scale is 0..0
  // and every point divides by zero.
  if (!Number.isFinite(max) || max <= 0) return [0, 1];

  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  // 1, 2, 2.5, 5, 10 — the steps that produce readable round numbers.
  const step =
    magnitude * ([1, 2, 2.5, 5, 10].find((f) => rough <= magnitude * f) ?? 10);

  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) {
    // Floating point: 0.1 + 0.2 style drift would print 0.30000000000000004
    // on an axis. Rounding to the step's own precision keeps ticks clean.
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
}

/** The top of the scale — the last tick, so the axis is never overrun. */
export function scaleMax(ticks: number[]): number {
  return ticks[ticks.length - 1] || 1;
}

/**
 * X for the nth of `count` points, spread edge to edge.
 *
 * A single point sits in the middle rather than at x=0, where it would be
 * half-clipped by the plot's own edge.
 */
export function pointX(index: number, count: number, width: number = PLOT.width): number {
  if (count <= 1) return width / 2;
  return (index / (count - 1)) * width;
}

/** Y for a value, inverted — SVG's origin is top-left, a chart's is bottom-left. */
export function pointY(value: number, max: number, height: number = PLOT.height): number {
  if (max <= 0) return height;
  return height - (Math.min(value, max) / max) * height;
}

export type Point = { x: number; y: number };

export function toPoints(
  values: readonly number[],
  max: number,
  width: number = PLOT.width,
  height: number = PLOT.height,
): Point[] {
  return values.map((value, i) => ({
    x: pointX(i, values.length, width),
    y: pointY(value, max, height),
  }));
}

/** Rounded to a tenth of a unit: enough precision to be exact on screen, short
 * enough that a 90-point path is not a wall of decimals in the HTML. */
function round(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}

/** `M … L …` through the points. Empty for no points, so SVG draws nothing. */
export function linePath(points: readonly Point[]): string {
  if (points.length === 0) return "";
  // A single point has no line; a zero-length path renders as nothing at all,
  // so it is closed into a dot-sized segment the marker then covers.
  if (points.length === 1) {
    return `M ${round(points[0].x)} ${round(points[0].y)} L ${round(points[0].x)} ${round(points[0].y)}`;
  }
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${round(p.x)} ${round(p.y)}`)
    .join(" ");
}

/**
 * The line, dropped to the baseline and closed — the area wash under it.
 *
 * `height` is required rather than defaulted, and that is the point: it has to
 * be the same height the points were built with, and a default made it possible
 * to pass points scaled to one plot and close them against another. The result
 * is a fill that runs off the bottom of the chart — which draws without error
 * and looks almost right, so it is exactly the kind of mistake that ships.
 */
export function areaPath(points: readonly Point[], height: number): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)} L ${round(last.x)} ${round(height)} L ${round(first.x)} ${round(height)} Z`;
}

/**
 * Each segment's share of the whole, as percentages that total exactly 100.
 *
 * The rounding is the reason this exists: three thirds rendered independently
 * come to 99.9% and leave a hairline of background at the end of the bar. The
 * remainder is given to the largest segment, where it is least visible.
 */
export function shares(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);

  const exact = values.map((value) => (value / total) * 100);
  const rounded = exact.map((share) => Math.round(share * 100) / 100);
  const drift = 100 - rounded.reduce((sum, share) => sum + share, 0);

  let largest = 0;
  for (let i = 1; i < rounded.length; i++) {
    if (rounded[i] > rounded[largest]) largest = i;
  }
  rounded[largest] = Math.round((rounded[largest] + drift) * 100) / 100;
  return rounded;
}

/**
 * Which point a pointer at `ratio` (0–1 across the plot) is nearest.
 *
 * Nearest-index rather than "the bar under the cursor": with 90 days in a
 * 700px plot each day owns about 8px, and a target that small is one a person
 * has to aim at. This way the whole plot is a hit area and the crosshair goes
 * where the pointer roughly is.
 */
export function nearestIndex(ratio: number, count: number): number {
  if (count <= 0) return -1;
  const clamped = Math.min(1, Math.max(0, ratio));
  return Math.min(count - 1, Math.round(clamped * (count - 1)));
}
