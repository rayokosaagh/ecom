import Link from "next/link";

import { cn } from "@/lib/cn";

export interface BarRow {
  /** Untrusted — a product name an admin typed. Rendered as text, never markup. */
  label: string;
  value: number;
  /** Pre-formatted value, e.g. "$1,240" or "18 sold". */
  display: string;
  /** Optional destination; the whole row becomes the link. */
  href?: string;
  /** Optional second line, e.g. the brand or the units behind the money. */
  meta?: string;
}

/**
 * Ranked magnitudes — top products, best categories.
 *
 * Every bar is the same colour, and that is deliberate: these categories have
 * no order of their own, so shading them by value would spend the one channel
 * that could carry identity on information the bar's length already states.
 * A ramp here would look like it meant something and mean nothing.
 *
 * Horizontal because the labels are product names. Vertical columns would give
 * them 60px of width and turn every one of them into an ellipsis.
 */
export function BarList({ rows, emptyMessage }: { rows: BarRow[]; emptyMessage: string }) {
  if (rows.length === 0) {
    return <p className="text-on-surface-variant py-6 text-center text-sm">{emptyMessage}</p>;
  }

  // Scaled against the largest row, not the axis maximum: the question a
  // ranking answers is "how do these compare to each other".
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <ol className="space-y-3">
      {rows.map((row, index) => {
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-on-surface truncate text-sm">
                <span className="text-on-surface-variant tabular-nums">{index + 1}.</span>{" "}
                {row.label}
              </span>
              {/* The value rides beside the label rather than inside the bar:
               * a 4px bar has nowhere to put text, and a label that has to be
               * clipped to fit is worse than one that never went there. */}
              <span className="text-on-surface shrink-0 text-sm font-medium tabular-nums">
                {row.display}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="bg-surface-variant h-2 flex-1 overflow-hidden rounded-sm">
                <div
                  className="bg-chart-accent h-full rounded-r-sm"
                  style={{
                    // A tiny non-zero value still gets a visible sliver, but
                    // zero gets nothing — a stub of colour where there is no
                    // data reads as a small amount of it.
                    width:
                      row.value <= 0 ? "0%" : `${Math.max((row.value / max) * 100, 1.5)}%`,
                  }}
                />
              </div>
              {row.meta && (
                <span className="text-on-surface-variant shrink-0 text-xs">{row.meta}</span>
              )}
            </div>
          </>
        );

        return (
          <li key={`${row.label}-${index}`}>
            {row.href ? (
              <Link
                href={row.href}
                className={cn(
                  "block rounded-sm transition-opacity hover:opacity-80",
                  "focus-visible:outline-2 focus-visible:outline-offset-2",
                )}
              >
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ol>
  );
}
