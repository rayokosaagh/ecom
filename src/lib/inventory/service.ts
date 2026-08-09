import "server-only";

import { prisma } from "@/lib/prisma";
import { StockChangeReason } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { describeVariant } from "@/lib/products/variants";
import { stockState, type StockState } from "@/lib/inventory/stock";

/**
 * Reading inventory.
 *
 * The unit of the whole page is a **stock unit**: the row that actually owns
 * units and that checkout decrements. A product with no variants is one unit;
 * a product with variants is one unit *per variant* and none of its own. That
 * is not a presentational choice — it is the same rule the cart claims stock
 * by (lib/actions/cart) and the same rule cancelling restores it by
 * (lib/actions/orders). A page that listed products would offer to restock a
 * number nothing sells from.
 */

/** Rows per page, on both the list and the history. */
export const PAGE_SIZE = 30;

export interface StockUnit {
  /** Stable identity for the adjust form: product id, plus variant id if any. */
  key: string;
  productId: string;
  variantId: string | null;
  /** The product's name — the thing an admin searches for. */
  name: string;
  /** "16 GB / 512 GB", or null when the product itself holds the units. */
  configuration: string | null;
  slug: string;
  sku: string | null;
  image: string | null;
  published: boolean;
  stock: number;
  priceCents: number;
  /** The standing "was" price, when this row is on sale. */
  compareAtPriceCents: number | null;
  /**
   * The flash sale currently holding this product's price, if any.
   *
   * A property of the *product*, not the unit — a flash sale takes a product
   * and writes every one of its variants — but carried on each unit because
   * that is what the price control on each row has to know before it offers to
   * change anything. See `planPriceChange`.
   */
  flashSaleName: string | null;
  category: string | null;
  brand: string | null;
  state: StockState;
}

export interface InventoryFilters {
  query?: string;
  category?: string;
  brand?: string;
  state?: StockState;
  /** 1-based. */
  page?: number;
}

export interface InventoryPage {
  units: StockUnit[];
  /** Units matching everything *except* the state filter — the pill counts. */
  counts: Record<StockState, number> & { all: number };
  /** Units on hand and what they are worth at the current price. */
  totals: { units: number; valueCents: number };
  page: number;
  totalPages: number;
  /** Matching the full filter, including state. */
  matched: number;
}

/**
 * Every stock unit matching the filters, worst first.
 *
 * The product-level filters run in Postgres; flattening to units and filtering
 * by state happens here, in memory. That split is deliberate rather than lazy:
 * "out of stock" spans two tables — a product's own column and its variants' —
 * and expressing it as one SQL predicate means a query that cannot also say
 * "…and the product has no variants", which is the half that makes the number
 * mean anything. The set is bounded by the catalogue, which the products list
 * already reads unpaginated for the same reason.
 */
export async function getInventory(filters: InventoryFilters = {}): Promise<InventoryPage> {
  const query = filters.query?.trim() ?? "";

  const where: Prisma.ProductWhereInput = {
    ...(filters.category ? { category: { slug: filters.category } } : {}),
    ...(filters.brand ? { brand: { slug: filters.brand } } : {}),
    // Slug as well as name, so a URL pasted from the storefront finds its row.
    // SKU too — the number on the box is what a stock take is working from.
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { slug: { contains: query, mode: "insensitive" as const } },
            { variants: { some: { sku: { contains: query, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };

  const products = await prisma.product.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      image: true,
      stock: true,
      priceCents: true,
      compareAtPriceCents: true,
      published: true,
      category: { select: { name: true } },
      brand: { select: { name: true } },
      variants: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sku: true,
          stock: true,
          priceCents: true,
          compareAtPriceCents: true,
          image: true,
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
  });

  /**
   * Which of these products a live flash sale is currently holding.
   *
   * One query for the whole page rather than a join onto every product: a shop
   * runs a handful of flash sales at once and most pages will match none of
   * them, so this is usually an empty result and never a large one.
   *
   * `appliedAt` rather than the date window, deliberately. The window says
   * whether a sale *should* be live; `appliedAt` says whether the price writes
   * have actually happened — and it is the writes, not the schedule, that make
   * editing the column unsafe. See `FlashSale.appliedAt`.
   */
  const flashItems = await prisma.flashSaleItem.findMany({
    where: {
      productId: { in: products.map((product) => product.id) },
      flashSale: { appliedAt: { not: null } },
    },
    select: { productId: true, flashSale: { select: { name: true } } },
  });
  const flashByProduct = new Map(
    flashItems.map((item) => [item.productId, item.flashSale.name]),
  );

  const all: StockUnit[] = [];

  for (const product of products) {
    const shared = {
      productId: product.id,
      name: product.name,
      slug: product.slug,
      published: product.published,
      flashSaleName: flashByProduct.get(product.id) ?? null,
      category: product.category?.name ?? null,
      brand: product.brand?.name ?? null,
    };

    if (product.variants.length === 0) {
      all.push({
        ...shared,
        key: product.id,
        variantId: null,
        configuration: null,
        sku: null,
        image: product.image,
        stock: product.stock,
        priceCents: product.priceCents,
        compareAtPriceCents: product.compareAtPriceCents,
        state: stockState(product.stock),
      });
      continue;
    }

    for (const variant of product.variants) {
      all.push({
        ...shared,
        key: `${product.id}:${variant.id}`,
        variantId: variant.id,
        configuration: describeVariant({
          id: variant.id,
          sku: variant.sku,
          priceCents: variant.priceCents,
          stock: variant.stock,
          image: variant.image,
          options: variant.options.map((option) => ({
            definitionId: option.definitionId,
            label: option.definition.label,
            unit: option.definition.unit,
            sortOrder: option.definition.sortOrder,
            value: option.value,
            valueKey: option.valueKey,
          })),
        }),
        sku: variant.sku,
        // Falls back to the product's, exactly as the storefront gallery does.
        image: variant.image ?? product.image,
        stock: variant.stock,
        priceCents: variant.priceCents,
        compareAtPriceCents: variant.compareAtPriceCents,
        state: stockState(variant.stock),
      });
    }
  }

  // Emptiest first: the page is a worklist, so what is losing sales sorts to
  // the top and stays there without anyone choosing a sort order.
  all.sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));

  const counts = {
    all: all.length,
    OUT: all.filter((unit) => unit.state === "OUT").length,
    LOW: all.filter((unit) => unit.state === "LOW").length,
    IN: all.filter((unit) => unit.state === "IN").length,
  };

  const totals = all.reduce(
    (running, unit) => ({
      units: running.units + Math.max(0, unit.stock),
      valueCents: running.valueCents + Math.max(0, unit.stock) * unit.priceCents,
    }),
    { units: 0, valueCents: 0 },
  );

  const matching = filters.state ? all.filter((unit) => unit.state === filters.state) : all;

  const totalPages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);
  const units = matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return { units, counts, totals, page, totalPages, matched: matching.length };
}

export interface HistoryFilters {
  productId?: string;
  reason?: StockChangeReason;
  page?: number;
  /** Overrides the page size — the list page shows a short recent strip. */
  pageSize?: number;
}

export type StockHistoryEntry = Awaited<ReturnType<typeof getStockHistory>>["entries"][number];

/**
 * The adjustment ledger, newest first.
 *
 * Paged in Postgres rather than in memory — unlike the unit list this only
 * grows, and a shop two years in should not read every adjustment ever made to
 * render thirty of them.
 */
export async function getStockHistory(filters: HistoryFilters = {}) {
  const where: Prisma.StockAdjustmentWhereInput = {
    ...(filters.productId ? { productId: filters.productId } : {}),
    ...(filters.reason ? { reason: filters.reason } : {}),
  };

  const pageSize = filters.pageSize ?? PAGE_SIZE;

  const total = await prisma.stockAdjustment.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);

  const rows = await prisma.stockAdjustment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      delta: true,
      stockBefore: true,
      stockAfter: true,
      reason: true,
      note: true,
      createdAt: true,
      productId: true,
      // Null once the account is deleted — the change still happened, and the
      // row says so rather than vanishing with whoever made it.
      user: { select: { name: true, email: true } },
      product: { select: { name: true, slug: true } },
      variant: {
        select: {
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
  });

  const entries = rows.map((row) => ({
    ...row,
    configuration: row.variant
      ? describeVariant({
          id: "",
          sku: row.variant.sku,
          priceCents: 0,
          stock: 0,
          image: null,
          options: row.variant.options.map((option) => ({
            definitionId: option.definitionId,
            label: option.definition.label,
            unit: option.definition.unit,
            sortOrder: option.definition.sortOrder,
            value: option.value,
            valueKey: option.valueKey,
          })),
        })
      : null,
  }));

  return { entries, page, totalPages, total };
}

export interface PriceHistoryFilters {
  productId?: string;
  page?: number;
  /** Overrides the page size — the list page shows a short recent strip. */
  pageSize?: number;
}

export type PriceHistoryEntry = Awaited<
  ReturnType<typeof getPriceHistory>
>["entries"][number];

/**
 * The price ledger, newest first.
 *
 * A separate function from `getStockHistory` rather than one that unions both,
 * even though the two shapes are close. A combined feed would have to invent a
 * discriminator, and every reader would then branch on it to know whether
 * "before" meant units or money — which is two ledgers wearing one type. The
 * history page shows them as two lists for the same reason.
 *
 * Paged in Postgres, like the stock ledger and for the same reason: it only
 * grows.
 */
export async function getPriceHistory(filters: PriceHistoryFilters = {}) {
  const where: Prisma.PriceChangeWhereInput = {
    ...(filters.productId ? { productId: filters.productId } : {}),
  };

  const pageSize = filters.pageSize ?? PAGE_SIZE;

  const total = await prisma.priceChange.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);

  const rows = await prisma.priceChange.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      fromCents: true,
      toCents: true,
      note: true,
      createdAt: true,
      productId: true,
      // Null once the account is deleted — the change still happened, and the
      // row says so rather than vanishing with whoever made it.
      user: { select: { name: true, email: true } },
      product: { select: { name: true, slug: true } },
      variant: {
        select: {
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
  });

  const entries = rows.map((row) => ({
    ...row,
    configuration: row.variant
      ? describeVariant({
          id: "",
          sku: row.variant.sku,
          priceCents: 0,
          stock: 0,
          image: null,
          options: row.variant.options.map((option) => ({
            definitionId: option.definitionId,
            label: option.definition.label,
            unit: option.definition.unit,
            sortOrder: option.definition.sortOrder,
            value: option.value,
            valueKey: option.valueKey,
          })),
        })
      : null,
  }));

  return { entries, page, totalPages, total };
}
