import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export interface ChartTable {
  /** Describes the table for a screen reader, e.g. "Revenue by day". */
  caption: string;
  columns: string[];
  /** Pre-formatted — the table shows what the chart shows, not raw cents. */
  rows: string[][];
}

/**
 * The frame every chart on the overview sits in: a heading, the plot, and the
 * same numbers as a table.
 *
 * The table is not a fallback, it is the other half of the chart. A colour
 * difference, a hover tooltip and a 4px bar are all things a reader may not be
 * able to use, and a dashboard that only speaks in marks simply withholds its
 * numbers from them. It is a `<details>` rather than a toggle button so it
 * works with no JavaScript at all, and it is in the DOM either way — collapsed
 * content is still reachable by a screen reader's own navigation.
 */
export function ChartCard({
  title,
  description,
  aside,
  table,
  className,
  children,
}: {
  title: string;
  description?: string;
  /** Small right-aligned slot — a legend, or the period being compared. */
  aside?: ReactNode;
  table: ChartTable;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card variant="outlined" className={cn("overflow-hidden", className)}>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h3 className="text-on-surface text-base font-medium">{title}</h3>
            {description && (
              <p className="text-on-surface-variant mt-0.5 text-sm">{description}</p>
            )}
          </div>
          {aside}
        </div>

        {children}

        <details className="group border-outline-variant border-t pt-3">
          <summary
            className={cn(
              "text-on-surface-variant inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-xs",
              "hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2",
              "[&::-webkit-details-marker]:hidden",
            )}
          >
            <Icon
              name="expand_more"
              size={16}
              className="transition-transform duration-200 group-open:rotate-180"
            />
            View as table
          </summary>

          {/* Wide tables scroll inside the card rather than widening the page. */}
          <div className="mt-3 max-h-64 overflow-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{table.caption}</caption>
              <thead className="text-on-surface-variant sticky top-0">
                <tr className="bg-surface">
                  {table.columns.map((column, i) => (
                    <th
                      key={column}
                      scope="col"
                      className={cn(
                        "border-outline-variant border-b py-2 pr-4 text-xs font-medium",
                        // Numbers right-align and share a digit width so the
                        // column reads as a column.
                        i > 0 && "text-right tabular-nums",
                      )}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-on-surface">
                {table.rows.map((row) => (
                  <tr key={row[0]} className="border-outline-variant/50 border-b last:border-0">
                    {row.map((cell, i) => (
                      <td
                        key={table.columns[i] ?? i}
                        className={cn("py-1.5 pr-4", i > 0 && "text-right tabular-nums")}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

export interface LegendEntry {
  label: string;
  /** A CSS colour — in practice one of the `--color-chart-*` tokens. */
  color: string;
  /** Lines key with a stroke, fills with a swatch, so the key mirrors the mark. */
  shape?: "line" | "rect";
  /** Optional glyph, so state is never carried by colour alone. */
  icon?: string;
}

/**
 * Identity, stated in words.
 *
 * Present whenever a plot draws more than one thing — colour matching is the
 * channel most likely to fail, so it is never the only one. A single-series
 * chart gets none: the title already says what the line is, and a one-swatch
 * legend just repeats it.
 */
export function Legend({ entries }: { entries: LegendEntry[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {entries.map((entry) => (
        <li
          key={entry.label}
          className="text-on-surface-variant flex items-center gap-1.5 text-xs"
        >
          {entry.icon ? (
            <span className="flex shrink-0" style={{ color: entry.color }}>
              <Icon name={entry.icon} size={14} />
            </span>
          ) : (
            <span
              aria-hidden
              className={cn(
                "shrink-0",
                entry.shape === "line" ? "h-0.5 w-3 rounded-full" : "size-2.5 rounded-sm",
              )}
              style={{ backgroundColor: entry.color }}
            />
          )}
          {entry.label}
        </li>
      ))}
    </ul>
  );
}
