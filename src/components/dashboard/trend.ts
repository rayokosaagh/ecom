import { formatDayFull, formatDayLabel } from "@/lib/dashboard/range";
import type { TrendPoint } from "@/components/charts/TrendChart";

/**
 * Shaping shared by the two overviews.
 *
 * The store's figures live on /dashboard and a shopper's on /profile, but both
 * draw the same chart from the same `measure()` output — so the shaping sits
 * beside `pipelineSegments` rather than being written out twice.
 */

/** Points for a trend chart: the value, plus both forms of its date. */
export function trendPoints(days: Date[], series: number[]): TrendPoint[] {
  return days.map((day, i) => ({
    label: formatDayLabel(day),
    full: formatDayFull(day),
    value: series[i] ?? 0,
  }));
}

/** The chart's numbers as text, for the table every chart card carries. */
export function trendTable(
  days: Date[],
  series: number[],
  previous: number[],
  format: (value: number) => string,
) {
  return days.map((day, i) => [
    formatDayFull(day),
    format(series[i] ?? 0),
    format(previous[i] ?? 0),
  ]);
}
