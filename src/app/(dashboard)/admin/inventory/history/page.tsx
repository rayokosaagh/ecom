import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { FilterPills } from "@/components/admin/FilterPills";
import { Pagination } from "@/components/products/Pagination";
import { AdjustmentList } from "@/components/inventory/AdjustmentList";
import { PriceChangeList } from "@/components/inventory/PriceChangeList";
import { requireAdmin } from "@/lib/auth/dal";
import { getPriceHistory, getStockHistory } from "@/lib/inventory/service";
import { REASON_LABELS } from "@/lib/inventory/stock";
import { StockChangeReason } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Inventory history" };

interface HistoryParams {
  kind?: string;
  reason?: string;
  page?: string;
}

/**
 * Every stock level and price changed by hand, newest first.
 *
 * Deliberately not "every movement": selling and cancelling move stock, and
 * flash sales move prices, and all three do so inside their own transactions
 * and are recorded where they happen — as orders, and as a flash sale's price
 * snapshot. Mixing them in here would produce a feed dominated by sales, in
 * which the handful of rows this page exists to show — someone typed a new
 * number in — could not be found. Each empty state says as much, so a reader
 * does not mistake a quiet ledger for a shop that has sold nothing.
 *
 * Stock and price are two lists behind a switch rather than one merged feed.
 * They answer different questions, and a merged row would have to be read twice
 * to know whether "3 → 40" was units or money.
 */
export default async function InventoryHistoryPage({
  searchParams,
}: {
  searchParams: Promise<HistoryParams>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const kind = params.kind === "price" ? "price" : "stock";
  const page = Number(params.page) || 1;

  // Only meaningful on the stock list — a price change has no reason column,
  // by design. See the note on the PriceChange model.
  const reason =
    kind === "stock" && params.reason && params.reason in StockChangeReason
      ? (params.reason as StockChangeReason)
      : undefined;

  const [stock, price] =
    kind === "price"
      ? [null, await getPriceHistory({ page })]
      : [await getStockHistory({ reason, page }), null];

  const history = stock ?? price!;

  const hrefFor = (next: number) => {
    const query = new URLSearchParams();
    if (kind === "price") query.set("kind", "price");
    if (reason) query.set("reason", reason);
    if (next > 1) query.set("page", String(next));
    const search = query.toString();
    return search ? `/admin/inventory/history?${search}` : "/admin/inventory/history";
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/admin/inventory"
          className="text-on-surface-variant inline-flex items-center gap-1 rounded-sm text-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="chevron_left" size={16} />
          Inventory
        </Link>

        <h2 className="text-on-surface mt-2 text-2xl font-normal">
          {kind === "price" ? "Price history" : "Stock history"}
        </h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          {kind === "price"
            ? history.total === 0
              ? "Prices changed from the inventory page appear here."
              : `${history.total} price change${history.total === 1 ? "" : "s"}, newest first. Flash sales are not listed — they record their own before-and-after.`
            : history.total === 0
              ? "Adjustments made from the inventory page appear here."
              : `${history.total} adjustment${history.total === 1 ? "" : "s"}, newest first. Sales and cancellations are not listed — they are recorded as orders.`}
        </p>
      </div>

      {/* Which ledger. `reason` and `page` are deliberately dropped when
          switching: a reason belongs to the stock list alone, and page 4 of one
          ledger says nothing about the other. */}
      <FilterPills
        label="Which history"
        param="kind"
        basePath="/admin/inventory/history"
        params={{ kind: kind === "price" ? "price" : undefined }}
        options={[
          { value: "", label: "Stock" },
          { value: "price", label: "Price" },
        ]}
      />

      {kind === "stock" && (
        <FilterPills
          label="Filter by reason"
          param="reason"
          basePath="/admin/inventory/history"
          /* Only the reason: `page` is deliberately not carried across, so
             picking a reason lands on the first page of that reason's list. */
          params={{ reason }}
          options={[
            { value: "", label: "All" },
            ...Object.values(StockChangeReason).map((value) => ({
              value,
              label: REASON_LABELS[value],
            })),
          ]}
        />
      )}

      <Card variant="outlined">
        <CardContent>
          {price ? (
            <PriceChangeList
              entries={price.entries}
              emptyNote="No prices have been changed by hand yet"
            />
          ) : (
            <AdjustmentList
              entries={stock!.entries}
              emptyNote={
                reason
                  ? `No adjustments recorded as “${REASON_LABELS[reason]}”`
                  : "No stock has been adjusted by hand yet"
              }
            />
          )}
        </CardContent>
      </Card>

      <Pagination
        currentPage={history.page}
        totalPages={history.totalPages}
        hrefFor={hrefFor}
      />
    </div>
  );
}
