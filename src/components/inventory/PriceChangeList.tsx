import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { formatRelativeTime } from "@/lib/notifications/service";
import { formatPrice } from "@/lib/products/format";
import { describeSaleChange, priceDeltaSign } from "@/lib/inventory/price";
import type { PriceHistoryEntry } from "@/lib/inventory/service";
import { cn } from "@/lib/cn";

/**
 * The price ledger, rendered.
 *
 * The sibling of `AdjustmentList`, and laid out identically on purpose — the
 * two appear on the same screen, and a reader moving between them should not
 * have to relearn where the name, the movement and the author sit.
 *
 * One thing is inverted. On the stock list, up is good and green: more units
 * arrived. On this one the colours follow *the shopper's* interest rather than
 * the shop's, because that is what a price change means to the catalogue — a
 * cut is the positive event, a rise is the one worth noticing. Reusing stock's
 * mapping would paint every price rise as good news.
 */
export function PriceChangeList({
  entries,
  emptyNote,
}: {
  entries: PriceHistoryEntry[];
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
      {entries.map((entry) => {
        const deltaCents = entry.toCents - entry.fromCents;
        const cheaper = deltaCents < 0;
        // The sale side of the change — started, ended or re-anchored to a
        // different regular price — which can move with the price left where
        // it was. Rows older than the columns read as null → null and say
        // nothing, correctly.
        const sale = describeSaleChange(
          entry.fromCompareAtCents,
          entry.toCompareAtCents,
          formatPrice,
        );

        return (
          <li key={entry.id} className="flex flex-wrap items-start gap-3 py-3">
            <span
              className={cn(
                "inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-medium tabular-nums",
                deltaCents === 0
                  ? "bg-surface-container-highest text-on-surface"
                  : cheaper
                    ? "bg-tertiary-container text-on-tertiary-container"
                    : "bg-error-container text-on-error-container",
              )}
            >
              {deltaCents === 0 ? (
                <>
                  <Icon name="sell" size={14} />
                  <span className="sr-only">price unchanged</span>
                </>
              ) : (
                <>
                  {priceDeltaSign(deltaCents)}
                  {formatPrice(Math.abs(deltaCents))}
                </>
              )}
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
                  {deltaCents === 0
                    ? `${formatPrice(entry.toCents)} unchanged`
                    : `${formatPrice(entry.fromCents)} → ${formatPrice(entry.toCents)}`}
                </span>
                {sale && <> · {sale}</>}
                {entry.note && <> · “{entry.note}”</>}
              </p>
            </div>

            <p className="text-on-surface-variant shrink-0 text-right text-xs">
              {formatRelativeTime(entry.createdAt)}
              <br />
              {/* No account on a row the clock wrote — see lib/sales/schedule —
                  and "deleted account" for one whose admin is gone: the record
                  outlives both, and saying which is more use than a blank. */}
              {entry.user?.name ??
                entry.user?.email ??
                (entry.note?.startsWith("Sale ended as scheduled") ? "automatic" : "deleted account")}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
