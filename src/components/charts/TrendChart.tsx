"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";

import {
  PLOT,
  areaPath,
  linePath,
  nearestIndex,
  niceTicks,
  scaleMax,
  toPoints,
} from "./geometry";
import { formatCompact, formatCompactMoney } from "@/lib/dashboard/range";
import { formatPrice } from "@/lib/products/format";
import { cn } from "@/lib/cn";

export type ValueFormat = "money" | "count";

export interface TrendPoint {
  /** Short axis form, e.g. "7 Aug". */
  label: string;
  /** Unambiguous form for the tooltip, e.g. "Aug 7, 2026". */
  full: string;
  value: number;
}

/** Exact in the tooltip, compact on the axis — the axis has no room to be exact. */
function exact(value: number, format: ValueFormat): string {
  return format === "money" ? formatPrice(value) : value.toLocaleString("en-US");
}

function axisTick(value: number, format: ValueFormat): string {
  return format === "money" ? formatCompactMoney(value) : formatCompact(value);
}

/**
 * A single measure over time, with the period before it for context.
 *
 * Two series, but not two identities: the current period is the subject and
 * wears the accent, the previous one is grey. Emphasis rather than a second
 * hue, because the reader's question is "how are we doing", and answering it
 * with two equally loud lines makes them find the answer themselves.
 *
 * The previous period is drawn against *the same* axis and the same day count,
 * so the two are directly comparable — never a second y-scale, which would let
 * the chart imply any relationship the scales happened to produce.
 */
export function TrendChart({
  points,
  comparison,
  format = "count",
  seriesLabel,
  comparisonLabel = "Previous period",
}: {
  points: TrendPoint[];
  /** Previous period, index-aligned to `points`. Omit for no comparison. */
  comparison?: number[];
  format?: ValueFormat;
  seriesLabel: string;
  comparisonLabel?: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  const values = points.map((point) => point.value);
  const ticks = niceTicks(Math.max(0, ...values, ...(comparison ?? [])));
  const max = scaleMax(ticks);

  const current = toPoints(values, max);
  const previous = comparison ? toPoints(comparison, max) : null;

  const lastIndex = points.length - 1;
  const shown = active ?? lastIndex;
  const point = points[shown];

  /** Percent across the plot — the unit every HTML overlay is positioned in. */
  const xPercent = (index: number) =>
    points.length <= 1 ? 50 : (index / (points.length - 1)) * 100;
  const yPercent = (value: number) => (max <= 0 ? 0 : (Math.min(value, max) / max) * 100);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    setActive(nearestIndex((event.clientX - box.left) / box.width, points.length));
  };

  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step !== 0) {
      event.preventDefault();
      setActive(Math.min(lastIndex, Math.max(0, (active ?? lastIndex) + step)));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(lastIndex);
    } else if (event.key === "Escape") {
      setActive(null);
    }
  };

  // Near an edge the tooltip is anchored by its own edge instead of its centre,
  // so it stays inside the card rather than being clipped by it.
  const anchor = (percent: number) =>
    percent < 15 ? "0" : percent > 85 ? "-100%" : "-50%";

  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        {/* Y axis. HTML text rather than SVG <text>, so it stays legible at
         * every width instead of shrinking with the viewBox. */}
        <div className="relative h-48 w-12 shrink-0" aria-hidden>
          {ticks.map((tick) => (
            <span
              key={tick}
              className="text-on-surface-variant absolute right-0 translate-y-1/2 text-label-sm tabular-nums"
              style={{ bottom: `${yPercent(tick)}%` }}
            >
              {axisTick(tick, format)}
            </span>
          ))}
        </div>

        <div
          role="img"
          aria-label={`${seriesLabel} over the last ${points.length} days. The table below lists every value.`}
          tabIndex={0}
          onPointerMove={move}
          onPointerLeave={() => setActive(null)}
          onKeyDown={key}
          onBlur={() => setActive(null)}
          className={cn(
            "relative h-48 flex-1 touch-none",
            "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2",
          )}
        >
          {/* Gridlines: solid hairlines one step off the surface. Positioned by
           * the same percentage as their labels, so they cannot drift apart. */}
          {ticks.map((tick) => (
            <span
              key={tick}
              aria-hidden
              className="bg-chart-grid absolute inset-x-0 h-px"
              style={{ bottom: `${yPercent(tick)}%` }}
            />
          ))}

          {/* Only the marks live in the SVG. `preserveAspectRatio="none"` lets
           * the plot stretch to any width; `vector-effect` is what keeps the
           * strokes 2px while it does. */}
          <svg
            aria-hidden
            viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
          >
            {/* A wash, not a block: the fill says "this is the same series as
             * the line", it does not need to be seen on its own. */}
            <path d={areaPath(current, PLOT.height)} className="fill-chart-accent/10" />
            {previous && (
              <path
                d={linePath(previous)}
                fill="none"
                className="stroke-chart-muted"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={0.7}
                vectorEffect="non-scaling-stroke"
              />
            )}
            <path
              d={linePath(current)}
              fill="none"
              className="stroke-chart-accent"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Crosshair. The reader aims at a date, not at a 2px line — the
           * whole plot is the hit area and this snaps to the nearest day. */}
          {active !== null && (
            <span
              aria-hidden
              className="bg-outline absolute inset-y-0 w-px"
              style={{ left: `${xPercent(active)}%` }}
            />
          )}

          {/* Markers: the endpoint always, plus whichever day is being read.
           * Never one per point — a dot on every day is noise, and the values
           * are in the table anyway. Each carries a 2px surface ring so it
           * stays legible where it crosses the line. */}
          {[lastIndex, ...(active !== null && active !== lastIndex ? [active] : [])].map(
            (index) => (
              <span
                key={index}
                aria-hidden
                className="bg-chart-accent ring-surface absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full ring-2"
                style={{
                  left: `${xPercent(index)}%`,
                  bottom: `${yPercent(points[index]?.value ?? 0)}%`,
                }}
              />
            ),
          )}

          {/* At rest the endpoint carries a plain direct label, so the latest
           * figure is readable without touching anything. The tooltip is the
           * hover and keyboard layer on top of that, never the only way to a
           * number. */}
          {active === null && point && (
            <span
              aria-hidden
              className="text-on-surface absolute text-xs font-medium tabular-nums"
              style={{
                left: `${xPercent(lastIndex)}%`,
                bottom: `${yPercent(point.value)}%`,
                // Left of the endpoint marker and clear of it, in one transform
                // — an inline transform would override a utility class.
                transform: "translateX(-100%) translateX(-10px) translateY(-4px)",
              }}
            >
              {exact(point.value, format)}
            </span>
          )}

          {active !== null && point && (
            <div
              className={cn(
                "bg-inverse-surface text-inverse-on-surface pointer-events-none absolute top-0 z-10",
                "rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap shadow-elevation-2",
              )}
              style={{
                left: `${xPercent(shown)}%`,
                transform: `translateX(${anchor(xPercent(shown))})`,
              }}
            >
              {/* Value first: the reader already knows which series they are
               * looking at, and came for the number. */}
              <p className="text-sm font-medium tabular-nums">
                {exact(point.value, format)}
              </p>
              <p className="opacity-70">{point.full}</p>
              {comparison && (
                <p className="mt-0.5 flex items-center gap-1.5 opacity-70">
                  {/* A stroke, not a filled swatch — the key mirrors the mark
                   * it stands for, and at this size a block is heavy. */}
                  <span aria-hidden className="bg-chart-muted h-0.5 w-3 rounded-full" />
                  <span className="tabular-nums">
                    {exact(comparison[shown] ?? 0, format)}
                  </span>
                  <span>{comparisonLabel}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* X axis. First, middle and last only — a label per day would collide at
       * 30 points and be unreadable at 90. */}
      <div className="text-on-surface-variant ml-15 flex justify-between text-label-sm" aria-hidden>
        <span>{points[0]?.label}</span>
        <span className="hidden sm:inline">{points[Math.floor(lastIndex / 2)]?.label}</span>
        <span>{points[lastIndex]?.label}</span>
      </div>
    </div>
  );
}
