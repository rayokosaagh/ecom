import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { formatRelativeTime } from "@/lib/notifications/service";
import { REASON_LABELS, formatDelta } from "@/lib/inventory/stock";
import type { StockHistoryEntry } from "@/lib/inventory/service";
import { cn } from "@/lib/cn";

/**
 * The adjustment ledger, rendered.
 *
 * Every row answers the four questions the product row cannot: what moved, by
 * how much, why, and who says so. The levels either side are shown as stored
 * rather than recomputed — see the note on StockAdjustment for why they are not
 * a continuous series.
 */
export function AdjustmentList({
  entries,
  emptyNote,
}: {
  entries: StockHistoryEntry[];
  emptyNote: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-on-surface-variant flex items-center justify-center gap-2 py-8 text-center text-sm">
        <Icon name="history" size={18} />
        {emptyNote}
      </p>
    );
  }

  return (
    <ul className="divide-outline-variant/50 divide-y">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-wrap items-start gap-3 py-3">
          <span
            className={cn(
              "inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-medium tabular-nums",
              entry.delta > 0
                ? "bg-tertiary-container text-on-tertiary-container"
                : "bg-error-container text-on-error-container",
            )}
          >
            {formatDelta(entry.delta)}
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-on-surface text-sm">
              <Link
                href={`/dashboard/products/${entry.productId}/edit`}
                className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {entry.product.name}
              </Link>
              {entry.configuration && (
                <span className="text-on-surface-variant"> · {entry.configuration}</span>
              )}
            </p>

            <p className="text-on-surface-variant mt-0.5 text-xs">
              <span className="tabular-nums">
                {entry.stockBefore} → {entry.stockAfter}
              </span>
              {" · "}
              {REASON_LABELS[entry.reason]}
              {entry.note && <> · “{entry.note}”</>}
            </p>
          </div>

          <p className="text-on-surface-variant shrink-0 text-right text-xs">
            {formatRelativeTime(entry.createdAt)}
            <br />
            {/* The account is gone, the record is not — saying so is more use
                than an empty space where a name was. */}
            {entry.user?.name ?? entry.user?.email ?? "deleted account"}
          </p>
        </li>
      ))}
    </ul>
  );
}
