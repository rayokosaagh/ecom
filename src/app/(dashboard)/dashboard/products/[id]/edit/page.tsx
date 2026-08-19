import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductForm } from "@/components/products/ProductForm";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Card, CardContent } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { getFlatCategories } from "@/lib/categories/tree";
import { updateProduct, deleteProduct } from "@/lib/actions/products";
import { getSpecLabels } from "@/lib/specs/resolve";
import { centsToInput } from "@/lib/products/format";
import { getPriceHistory, getStockHistory } from "@/lib/inventory/service";
import { historyHref } from "@/lib/inventory/links";
import { AdjustmentList } from "@/components/inventory/AdjustmentList";
import { PriceChangeList } from "@/components/inventory/PriceChangeList";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [product, categories, brands, specLabels, stockHistory, priceHistory] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        colors: {
          orderBy: { sortOrder: "asc" },
          select: { name: true, hex: true, image: true, gallery: true },
        },
        // Ordered by the definition, so the form lists them the way the
        // product page will.
        specs: {
          orderBy: { definition: { sortOrder: "asc" } },
          select: { value: true, definition: { select: { label: true } } },
        },
        variants: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            sku: true,
            priceCents: true,
            compareAtPriceCents: true,
            stock: true,
            options: {
              select: {
                definitionId: true,
                value: true,
                definition: { select: { label: true, sortOrder: true } },
              },
            },
          },
        },
      },
    }),
    getFlatCategories(),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSpecLabels(),
    // The product's own ledgers, most recent few. The price and stock fields
    // above are read-only here, so this card is the answer to "why is it what
    // it is" — and the way to the page where it can be changed.
    getStockHistory({ productId: id, pageSize: 5 }),
    getPriceHistory({ productId: id, pageSize: 5 }),
  ]);

  if (!product) notFound();

  // Axes are derived from the options the variants carry, in definition order,
  // so the grid reopens the way the product page lists it.
  const axisOrder = new Map<string, { label: string; sortOrder: number }>();
  for (const variant of product.variants) {
    for (const option of variant.options) {
      if (!axisOrder.has(option.definitionId)) {
        axisOrder.set(option.definitionId, {
          label: option.definition.label,
          sortOrder: option.definition.sortOrder,
        });
      }
    }
  }
  const sortedAxes = [...axisOrder.entries()].sort(
    (a, b) => a[1].sortOrder - b[1].sortOrder,
  );
  const axisIds = sortedAxes.map(([id]) => id);
  const variantAxes = sortedAxes.map(([, axis]) => axis.label);

  // Bind the id so the form action keeps the (state, formData) signature
  // useActionState expects.
  const action = updateProduct.bind(null, product.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/products"
            className="text-on-surface-variant inline-flex items-center gap-1 rounded-sm text-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Icon name="arrow_back" size={16} />
            Products
          </Link>
          <h2 className="text-on-surface mt-2 text-2xl font-normal">{product.name}</h2>
        </div>

        <Link
          href={`/products/${product.slug}`}
          className="text-on-surface-variant state-layer inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="open_in_new" size={18} />
          View
        </Link>
      </div>

      <ProductForm
        action={action}
        categories={categories}
        brands={brands}
        specLabels={specLabels}
        submitLabel="Save changes"
        values={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          categoryId: product.categoryId,
          brandId: product.brandId,
          price: centsToInput(product.priceCents),
          // Empty rather than "0.00" when there is no sale, so the field reads
          // as untouched and saving does not invent one.
          compareAtPrice:
            product.compareAtPriceCents === null
              ? ""
              : centsToInput(product.compareAtPriceCents),
          stock: product.stock,
          image: product.image,
          gallery: product.gallery,
          colors: product.colors.map((c) => ({
            name: c.name,
            hex: c.hex,
            image: c.image ?? "",
            gallery: c.gallery.join(String.fromCharCode(10)),
          })),
          specs: product.specs.map((s) => ({
            label: s.definition.label,
            value: s.value,
          })),
          variantAxes,
          variants: product.variants.map((variant) => ({
            // The id travels with the row so saving updates this variant rather
            // than replacing it — see `updateProduct`.
            id: variant.id,
            // Values follow the axis order, not the order the options happen
            // to come back in — the grid is read positionally.
            values: variantAxes.map(
              (_label, index) =>
                variant.options.find(
                  (option) => option.definitionId === axisIds[index],
                )?.value ?? "",
            ),
            price: centsToInput(variant.priceCents),
            compareAtPrice:
              variant.compareAtPriceCents === null
                ? ""
                : centsToInput(variant.compareAtPriceCents),
            stock: String(variant.stock),
            sku: variant.sku ?? "",
          })),
          published: product.published,
        }}
      />

      <Card variant="outlined">
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-on-surface text-base font-medium">Recent stock and price changes</h3>
              <p className="text-on-surface-variant mt-0.5 text-sm">
                Every change made by hand, across all of this product&apos;s configurations.
                Change stock and prices from{" "}
                <Link
                  href={`/admin/inventory?q=${encodeURIComponent(product.slug)}`}
                  className="text-primary hover:underline"
                >
                  Inventory
                </Link>
                .
              </p>
            </div>
            <Link
              href={historyHref({ productId: product.id })}
              className="text-primary inline-flex shrink-0 items-center gap-1 rounded-sm text-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              All history
              <Icon name="chevron_right" size={16} />
            </Link>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="text-on-surface-variant label-caps mb-1">Stock</p>
              <AdjustmentList
                entries={stockHistory.entries}
                emptyNote="No stock adjustments yet"
              />
            </div>
            <div>
              <p className="text-on-surface-variant label-caps mb-1">Price</p>
              <PriceChangeList
                entries={priceHistory.entries}
                emptyNote="No price changes yet"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card variant="outlined" className="border-error/40">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-on-surface text-sm font-medium">Delete this product</p>
            <p className="text-on-surface-variant text-xs">
              This cannot be undone.
            </p>
          </div>
          <form action={deleteProduct}>
            <input type="hidden" name="id" value={product.id} />
            <Button type="submit" variant="outlined" icon="delete" className="border-error text-error">
              Delete
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
