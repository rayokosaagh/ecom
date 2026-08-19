import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { FilterPills } from "@/components/admin/FilterPills";
import { Pagination } from "@/components/products/Pagination";
import { AdjustmentList } from "@/components/inventory/AdjustmentList";
import { PriceChangeList } from "@/components/inventory/PriceChangeList";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { getPriceHistory, getStockHistory } from "@/lib/inventory/service";
import { parseVariantParam } from "@/lib/inventory/links";
import { REASON_LABELS } from "@/lib/inventory/stock";
import { describeVariant } from "@/lib/products/variants";
import { StockChangeReason } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Inventory history" };

interface HistoryParams {
  kind?: string;
  reason?: string;
  page?: string;
  /** Narrow to one product … */
  product?: string;
  /** … or to one line of it: a variant id, or "none" for the product's own row. */
  variant?: string;
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
 *
 * Narrowed to one product or one line when asked (`?product=…&variant=…`): the
 * "History" links on the inventory and sales rows and on the product's edit
 * page land here, and the header says what is being shown so the narrowing is
 * never invisible.
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
  const productId = params.product?.trim() || undefined;
  const variantId = productId ? parseVariantParam(params.variant) : undefined;

  // Only meaningful on the stock list — a price change has no reason column,
  // by design. See the note on the PriceChange model.
  const reason =
    kind === "stock" && params.reason && params.reason in StockChangeReason
      ? (params.reason as StockChangeReason)
      : undefined;

  // What the narrowing points at, so the header can name it. A product that
  // has since been deleted still has a ledger of its own (the rows cascade —
  // see the model) so this can be null while rows are not; the header then
  // says so rather than showing a bare id.
  const scope = productId
    ? await prisma.product.findUnique({
        where: { id: productId },
        select: {
          name: true,
          slug: true,
          // Only the one configuration named, or none — the header needs its
          // label, nothing else about the product's other rows.
          variants: {
            where: { id: variantId ?? "" },
            select: {
              id: true,
              sku: true,
              options: {
                select: {
                  definitionId: true,
                  value: true,
                  valueKey: true,
                  definition: { select: { label: true, unit: true, sortOrder: true } },
                },
              },
            },
          },
        },
      })
    : null;

  const scopeVariant = scope?.variants[0];
  const scopeLabel = !productId
    ? null
    : !scope
      ? "a deleted product"
      : variantId === null
        ? `${scope.name} · product row`
        : scopeVariant
          ? `${scope.name} · ${describeVariant({
              id: scopeVariant.id,
              sku: scopeVariant.sku,
              priceCents: 0,
              stock: 0,
              image: null,
              options: scopeVariant.options.map((option) => ({
                definitionId: option.definitionId,
                label: option.definition.label,
                unit: option.definition.unit,
                sortOrder: option.definition.sortOrder,
                value: option.value,
                valueKey: option.valueKey,
              })),
            })}`
          : variantId
            ? `${scope.name} · a removed configuration`
            : scope.name;

  const [stock, price] =
    kind === "price"
      ? [null, await getPriceHistory({ productId, variantId, page })]
      : [await getStockHistory({ productId, variantId, reason, page }), null];

  const history = stock ?? price!;

  // The narrowing travels with every link on the page; only `page` and the
  // stock-only `reason` are dropped where they stop meaning anything.
  const scopeParams: Record<string, string | undefined> = {
    product: productId,
    variant: params.variant && productId ? params.variant : undefined,
  };

  const hrefFor = (next: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(scopeParams)) if (value) query.set(key, value);
    if (kind === "price") query.set("kind", "price");
    if (reason) query.set("reason", reason);
    if (next > 1) query.set("page", String(next));
    const search = query.toString();
    return search ? `/admin/inventory/history?${search}` : "/admin/inventory/history";
  };

  const noun = kind === "price" ? "price change" : "adjustment";

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
          {history.total === 0
            ? kind === "price"
              ? "Prices changed from the inventory and sales pages appear here."
              : "Adjustments made from the inventory page appear here."
            : `${history.total} ${noun}${history.total === 1 ? "" : "s"}, newest first. ${
                kind === "price"
                  ? "Flash sales are not listed — they record their own before-and-after."
                  : "Sales and cancellations are not listed — they are recorded as orders."
              }`}
        </p>
      </div>

      {/* The narrowing, named, with a way out. */}
      {scopeLabel && (
        <div className="bg-secondary-container text-on-secondary-container flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-2 text-sm">
          <span className="inline-flex items-center gap-2">
            <Icon name="filter_alt" size={16} />
            Showing {scopeLabel}
            {scope && (
              <>
                {" · "}
                <Link
                  href={`/dashboard/products/${productId}/edit`}
                  className="rounded-sm underline-offset-2 hover:underline focus-visible:outline-2"
                >
                  edit product
                </Link>
              </>
            )}
          </span>
          <Link
            href={kind === "price" ? "/admin/inventory/history?kind=price" : "/admin/inventory/history"}
            className="inline-flex items-center gap-1 rounded-sm text-xs hover:underline focus-visible:outline-2"
          >
            <Icon name="close" size={14} />
            Show everything
          </Link>
        </div>
      )}

      {/* Which ledger. `reason` and `page` are deliberately dropped when
          switching: a reason belongs to the stock list alone, and page 4 of one
          ledger says nothing about the other. The narrowing is kept. */}
      <FilterPills
        label="Which history"
        param="kind"
        basePath="/admin/inventory/history"
        params={{ ...scopeParams, kind: kind === "price" ? "price" : undefined }}
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
          /* Only the reason and the narrowing: `page` is deliberately not
             carried across, so picking a reason lands on the first page of
             that reason's list. */
          params={{ ...scopeParams, reason }}
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
              emptyNote={
                scopeLabel
                  ? `No price changes recorded for ${scopeLabel}`
                  : "No prices have been changed by hand yet"
              }
            />
          ) : (
            <AdjustmentList
              entries={stock!.entries}
              emptyNote={
                reason
                  ? `No adjustments recorded as “${REASON_LABELS[reason]}”${scopeLabel ? ` for ${scopeLabel}` : ""}`
                  : scopeLabel
                    ? `No stock adjustments recorded for ${scopeLabel}`
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
