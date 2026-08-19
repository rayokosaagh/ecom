import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ListToolbar } from "@/components/admin/ListToolbar";
import { Pagination } from "@/components/products/Pagination";
import { StockTakeForm } from "@/components/inventory/StockTakeForm";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { getInventory } from "@/lib/inventory/service";
import { MAX_STOCK_TAKE_LINES } from "@/lib/inventory/stock-take";
import { releaseAbandonedOrders } from "@/lib/payments/expiry";

export const metadata: Metadata = { title: "Stock take" };

/** Lines per page: a shelf's worth, and well under the batch ceiling. */
const PAGE = 50;

interface StockTakeParams {
  q?: string;
  category?: string;
  brand?: string;
  page?: string;
}

/**
 * Count a shelf against the book.
 *
 * The inventory page is for fixing one line; this is for walking a shelf with
 * a clipboard. Same filters, same lines, but the list is in catalogue order
 * — name, then configuration — rather than emptiest first, because a person
 * counting goes along the shelf, not by how empty things are. One reason and
 * one note cover the whole count, and one Save writes it in one transaction.
 */
export default async function StockTakePage({
  searchParams,
}: {
  searchParams: Promise<StockTakeParams>;
}) {
  await requireAdmin();
  // The same sweep the inventory page runs, for the same reason: a count made
  // against a level held artificially low by an abandoned checkout is wrong.
  await releaseAbandonedOrders();

  const params = await searchParams;
  const page = Number(params.page) || 1;

  const [inventory, categories, brands] = await Promise.all([
    getInventory({
      query: params.q,
      category: params.category,
      brand: params.brand,
      page,
      pageSize: PAGE,
    }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }),
  ]);

  // Catalogue order for counting — see the note above. Done here rather than
  // in the query: the page is one shelf, and this keeps the inventory read
  // with one sort order it can promise everywhere else.
  const rows = [...inventory.units]
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        (a.configuration ?? "").localeCompare(b.configuration ?? "", undefined, { numeric: true }),
    )
    .map((unit) => ({
      key: unit.key,
      name: unit.name,
      configuration: unit.configuration,
      sku: unit.sku,
      image: unit.image,
      published: unit.published,
      stock: unit.stock,
      threshold: unit.threshold,
    }));

  const hrefFor = (next: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ q: params.q, category: params.category, brand: params.brand })) {
      if (value) query.set(key, value);
    }
    if (next > 1) query.set("page", String(next));
    const search = query.toString();
    return search ? `/admin/inventory/stock-take?${search}` : "/admin/inventory/stock-take";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          href="/admin/inventory"
          className="text-on-surface-variant inline-flex items-center gap-1 rounded-sm text-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="chevron_left" size={16} />
          Inventory
        </Link>
        <h2 className="text-on-surface mt-2 text-2xl font-normal">Stock take</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          Type what the shelf holds in the Counted column and leave the rest blank. One reason
          and note cover the count; saving writes every line at once, each to its own history
          row. Up to {MAX_STOCK_TAKE_LINES} lines per save — narrow by category, brand or search
          to count one shelf at a time.
        </p>
      </div>

      <ListToolbar
        searchLabel="Search by product, slug or SKU"
        alsoClear={["page"]}
        filters={[
          {
            param: "category",
            label: "Category",
            options: categories.map((category) => ({ value: category.slug, label: category.name })),
          },
          {
            param: "brand",
            label: "Brand",
            options: brands.map((brand) => ({ value: brand.slug, label: brand.name })),
          },
        ]}
      />

      <p className="text-on-surface-variant px-1 text-xs">
        {inventory.matched} line{inventory.matched === 1 ? "" : "s"}
        {inventory.totalPages > 1 && ` · page ${inventory.page} of ${inventory.totalPages}`}
      </p>

      <Card variant="outlined">
        <CardContent>
          <StockTakeForm rows={rows} />
        </CardContent>
      </Card>

      <Pagination currentPage={inventory.page} totalPages={inventory.totalPages} hrefFor={hrefFor} />
    </div>
  );
}
