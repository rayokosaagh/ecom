import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { FilterPills } from "@/components/admin/FilterPills";
import { ListToolbar } from "@/components/admin/ListToolbar";
import { Pagination } from "@/components/products/Pagination";
import { AdjustPrice } from "@/components/inventory/AdjustPrice";
import { AdjustStock } from "@/components/inventory/AdjustStock";
import { AdjustmentList } from "@/components/inventory/AdjustmentList";
import { StockBadge } from "@/components/inventory/StockBadge";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/products/format";
import { getInventory, getStockHistory } from "@/lib/inventory/service";
import { LOW_STOCK_THRESHOLD, type StockState } from "@/lib/inventory/stock";
import { releaseAbandonedOrders } from "@/lib/payments/expiry";

export const metadata: Metadata = { title: "Inventory" };

interface InventoryParams {
  q?: string;
  category?: string;
  brand?: string;
  state?: string;
  page?: string;
}

function asState(value?: string): StockState | undefined {
  return value === "OUT" || value === "LOW" || value === "IN" ? value : undefined;
}

/**
 * Stock, as a worklist.
 *
 * Separate from the products list on purpose. That page is the catalogue —
 * what exists, what it costs, whether it is published — and stock is one column
 * on it. This page is the opposite emphasis: one row per thing that can run
 * out, emptiest first, with the control to fix it in the row. A product sold in
 * four configurations is four rows here and one row there, because four
 * configurations is four things that run out independently.
 */
export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<InventoryParams>;
}) {
  // The layout checks the session, but layouts do not re-render on every
  // navigation — so the page enforces the admin gate itself.
  await requireAdmin();

  /**
   * Swept before the levels are read, so this page never reports stock that is
   * only held by an order nobody is going to pay for.
   *
   * This page is where an admin decides whether to reorder. A count kept
   * artificially low by three abandoned wallet checkouts is exactly the kind of
   * wrong number that decision gets made on.
   */
  await releaseAbandonedOrders();

  const params = await searchParams;
  const state = asState(params.state);
  const page = Number(params.page) || 1;

  const [inventory, categories, brands, history] = await Promise.all([
    getInventory({
      query: params.q,
      category: params.category,
      brand: params.brand,
      state,
      page,
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }),
    getStockHistory({ page: 1, pageSize: 5 }),
  ]);

  const filtered = Boolean(params.q || params.category || params.brand || state);

  // Pills reset the page: choosing "Out of stock" while on page 4 of the full
  // list should land on the first page of the new one, not the fourth.
  const pillParams: Record<string, string | undefined> = {
    q: params.q,
    category: params.category,
    brand: params.brand,
  };

  const hrefFor = (next: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...pillParams, state })) {
      if (value) query.set(key, value);
    }
    if (next > 1) query.set("page", String(next));
    const search = query.toString();
    return search ? `/admin/inventory?${search}` : "/admin/inventory";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-on-surface text-2xl font-normal">Inventory</h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            Every configuration that can run out, emptiest first. Low means{" "}
            {LOW_STOCK_THRESHOLD} or fewer.
          </p>
        </div>

        <Link
          href="/admin/inventory/history"
          className="border-outline text-on-surface hover:bg-on-surface/[0.06] inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-5 text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="history" size={18} />
          Stock history
        </Link>
      </div>

      <Card variant="outlined">
        <CardContent className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-4">
          <Summary label="Out of stock" value={inventory.counts.OUT} tone="critical" />
          <Summary label={`Low (≤ ${LOW_STOCK_THRESHOLD})`} value={inventory.counts.LOW} />
          <Summary label="Units on hand" value={inventory.totals.units} />
          <div>
            <p className="text-on-surface-variant text-xs">Stock at retail</p>
            <p className="text-on-surface mt-0.5 text-xl font-medium">
              {formatPrice(inventory.totals.valueCents)}
            </p>
          </div>
        </CardContent>
      </Card>

      <ListToolbar
        searchLabel="Search by product, slug or SKU"
        alsoClear={["state", "page"]}
        filters={[
          {
            param: "category",
            label: "Category",
            options: categories.map((category) => ({
              value: category.slug,
              label: category.name,
            })),
          },
          {
            param: "brand",
            label: "Brand",
            options: brands.map((brand) => ({ value: brand.slug, label: brand.name })),
          },
        ]}
      />

      <FilterPills
        label="Filter by stock level"
        param="state"
        basePath="/admin/inventory"
        params={pillParams}
        options={[
          { value: "", label: "All", count: inventory.counts.all },
          { value: "OUT", label: "Out of stock", count: inventory.counts.OUT },
          { value: "LOW", label: "Low", count: inventory.counts.LOW },
          { value: "IN", label: "In stock", count: inventory.counts.IN },
        ]}
      />

      {inventory.units.length === 0 ? (
        <Card variant="outlined">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon
              name={filtered ? "search_off" : "inventory_2"}
              size={40}
              className="text-on-surface-variant"
            />
            <p className="text-on-surface">
              {filtered ? "Nothing matches those filters" : "Nothing to stock yet"}
            </p>
            <p className="text-on-surface-variant max-w-sm text-sm">
              {filtered
                ? "Try a shorter search, or clear a filter to widen the results."
                : "Add a product and its stock level appears here."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-on-surface-variant px-1 text-xs">
            {inventory.matched} line{inventory.matched === 1 ? "" : "s"}
            {filtered && " matching"}
          </p>

          <Card variant="outlined" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead className="text-on-surface-variant border-outline-variant border-b">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-medium">
                      Line
                    </th>
                    <th scope="col" className="px-6 py-3 font-medium">
                      Price
                    </th>
                    <th scope="col" className="px-6 py-3 font-medium">
                      Stock
                    </th>
                    <th scope="col" className="px-6 py-3 font-medium">
                      <span className="sr-only">Adjust stock</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.units.map((unit) => (
                    <tr
                      key={unit.key}
                      className="border-outline-variant border-b align-top transition-colors duration-200 last:border-0"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-start gap-3">
                          <div className="bg-surface-container-highest size-10 shrink-0 overflow-hidden rounded-md">
                            {unit.image ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={unit.image} alt="" className="size-full object-cover" />
                            ) : (
                              <div className="text-on-surface-variant grid size-full place-items-center">
                                <Icon name="image" size={18} />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="text-on-surface flex flex-wrap items-center gap-2">
                              <Link
                                href={`/dashboard/products/${unit.productId}/edit`}
                                className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                              >
                                {unit.name}
                              </Link>
                              {/* A draft cannot be bought, so an empty one is
                                  not losing sales — it is not a worklist item
                                  in the way a published one is. */}
                              {!unit.published && (
                                <span className="bg-surface-container-highest text-on-surface-variant rounded-full px-2 py-0.5 text-[11px]">
                                  Draft
                                </span>
                              )}
                            </p>
                            <p className="text-on-surface-variant mt-0.5 text-xs">
                              {unit.configuration ?? "No configurations"}
                              {unit.sku && <> · SKU {unit.sku}</>}
                              {unit.category && <> · {unit.category}</>}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="text-on-surface-variant px-6 py-3">
                        <span className="tabular-nums">
                          {formatPrice(unit.priceCents)}
                        </span>
                        {/* The "was" price, because it is the constraint on
                            repricing: the panel refuses anything at or above
                            it, and a figure that appears only in a refusal is
                            one the admin had no way to see coming. */}
                        {unit.compareAtPriceCents !== null && (
                          <span className="block text-xs line-through">
                            {formatPrice(unit.compareAtPriceCents)}
                          </span>
                        )}
                        {unit.flashSaleName && (
                          <span className="text-tertiary mt-0.5 flex items-center gap-1 text-xs">
                            <Icon name="bolt" size={13} />
                            {unit.flashSaleName}
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-3">
                        <StockBadge stock={unit.stock} />
                      </td>

                      <td className="px-6 py-3">
                        {/* Wraps rather than sitting on one line: each control
                            expands into a panel in place, and two open side by
                            side would each be half a column wide. */}
                        <div className="flex flex-wrap items-start justify-end gap-2">
                          <AdjustPrice
                            productId={unit.productId}
                            variantId={unit.variantId}
                            name={unit.name}
                            configuration={unit.configuration}
                            priceCents={unit.priceCents}
                            compareAtPriceCents={unit.compareAtPriceCents}
                            flashSaleName={unit.flashSaleName}
                          />
                          <AdjustStock
                            productId={unit.productId}
                            variantId={unit.variantId}
                            name={unit.name}
                            configuration={unit.configuration}
                            stock={unit.stock}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Pagination
            currentPage={inventory.page}
            totalPages={inventory.totalPages}
            hrefFor={hrefFor}
          />
        </>
      )}

      <Card variant="outlined">
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-on-surface text-base font-medium">Recent changes</h3>
            <Link
              href="/admin/inventory/history"
              className="text-primary inline-flex shrink-0 items-center gap-1 rounded-sm text-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              All history
              <Icon name="chevron_right" size={16} />
            </Link>
          </div>

          <AdjustmentList
            entries={history.entries}
            emptyNote="No stock has been adjusted by hand yet"
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** One figure in the summary strip. */
function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "critical";
}) {
  return (
    <div>
      <p className="text-on-surface-variant text-xs">{label}</p>
      <p
        className={
          tone === "critical" && value > 0
            ? "text-chart-critical mt-0.5 text-xl font-medium tabular-nums"
            : "text-on-surface mt-0.5 text-xl font-medium tabular-nums"
        }
      >
        {value}
      </p>
    </div>
  );
}
