import "server-only";

import { prisma } from "@/lib/prisma";
import { StockChangeReason } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { describeVariant } from "@/lib/products/variants";
import { LOW_STOCK_THRESHOLD, stockState, type StockState } from "@/lib/inventory/stock";

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
  /**
   * This line's own low-stock mark, or null for the shop default.
   * `threshold` is the one actually in force.
   */
  lowStockAt: number | null;
  threshold: number;
  /** Free text for whoever reorders. */
  reorderNote: string | null;
  priceCents: number;
  /** The standing regular price, when this row is on sale. */
  compareAtPriceCents: number | null;
  /** When the sale ends by itself, if a date was set. */
  saleEndsAt: Date | null;
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
  /** One state, or several — the dashboard wants Low and Out together. */
  state?: StockState | StockState[];
  /** Published products only — what the storefront can sell. */
  published?: boolean;
  /** 1-based. */
  page?: number;
  /**
   * Rows per page, when a caller wants something other than the list page's
   * thirty — the sales screen reads every line, and a search box shows a
   * short slice.
   */
  pageSize?: number;
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
 * The SQL that says what a line is.
 *
 * One row per thing that can run out: a product with no variants, or each
 * variant of one that has them — the same rule the cart claims by and
 * cancellation restores by. Classified right here, with each line's own
 * low-stock mark falling back to the shop default, so "low" means one thing
 * whether Postgres or TypeScript is asking.
 *
 * Written as a CTE that every inventory query builds on, rather than as a
 * view, because the schema is managed by `db push` and carries no migrations
 * a view could live in.
 */
function linesCte(filters: InventoryFilters) {
  const query = filters.query?.trim() ?? "";
  // Escaped so a SKU typed with an underscore matches that SKU and not any
  // character — `_` and `%` are wildcards to LIKE, and the catalogue's own
  // SKUs use underscores and hyphens freely.
  const like = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

  const productConditions = [
    filters.published === undefined ? null : Prisma.sql`p.published = ${filters.published}`,
    filters.category ? Prisma.sql`c.slug = ${filters.category}` : null,
    filters.brand ? Prisma.sql`b.slug = ${filters.brand}` : null,
    // Slug as well as name, so a URL pasted from the storefront finds its row.
    // SKU too — the number on the box is what a stock take is working from.
    query
      ? Prisma.sql`(
          p.name ILIKE ${like}
          OR p.slug ILIKE ${like}
          OR EXISTS (
            SELECT 1 FROM "ProductVariant" sv
            WHERE sv."productId" = p.id AND sv.sku ILIKE ${like}
          )
        )`
      : null,
  ].filter((condition) => condition !== null);

  const where =
    productConditions.length > 0
      ? Prisma.sql`AND ${Prisma.join(productConditions, " AND ")}`
      : Prisma.empty;

  return Prisma.sql`
    WITH lines AS (
      SELECT
        p.id            AS product_id,
        NULL::text      AS variant_id,
        p.name          AS name,
        p.stock         AS stock,
        p."priceCents"  AS price,
        COALESCE(p."lowStockAt", ${LOW_STOCK_THRESHOLD}) AS low_at
      FROM "Product" p
      LEFT JOIN "Category" c ON c.id = p."categoryId"
      LEFT JOIN "Brand" b ON b.id = p."brandId"
      WHERE NOT EXISTS (SELECT 1 FROM "ProductVariant" v0 WHERE v0."productId" = p.id)
      ${where}
      UNION ALL
      SELECT
        p.id,
        v.id,
        p.name,
        v.stock,
        v."priceCents",
        COALESCE(v."lowStockAt", ${LOW_STOCK_THRESHOLD})
      FROM "ProductVariant" v
      JOIN "Product" p ON p.id = v."productId"
      LEFT JOIN "Category" c ON c.id = p."categoryId"
      LEFT JOIN "Brand" b ON b.id = p."brandId"
      WHERE TRUE
      ${where}
    ),
    classified AS (
      SELECT
        lines.*,
        CASE
          WHEN stock <= 0 THEN 'OUT'
          WHEN stock <= low_at THEN 'LOW'
          ELSE 'IN'
        END AS state
      FROM lines
    )
  `;
}

/**
 * Every stock unit matching the filters, worst first.
 *
 * Filtering, classification, counting and paging all happen in Postgres (see
 * `linesCte`); only the rows on the requested page come back to be shaped.
 * This used to read the whole catalogue into memory on every load and page it
 * there, which was fine at fifty products and would not have been at five
 * thousand — and now that the sales screen and the dashboard read through the
 * same function, the catalogue is read a few times per admin visit, not once.
 *
 * Two things are deliberately *not* clever: the hydration is an ordinary
 * Prisma read keyed by the ids the SQL returned, so the unit shape is typed
 * rather than hand-mapped from raw columns; and the order of the page is the
 * SQL's order, reapplied by key, so the two queries cannot disagree about what
 * "emptiest first" means.
 */
export async function getInventory(filters: InventoryFilters = {}): Promise<InventoryPage> {
  const states: StockState[] =
    filters.state === undefined ? [] : Array.isArray(filters.state) ? filters.state : [filters.state];
  const cte = linesCte(filters);

  const stateWhere =
    states.length > 0 ? Prisma.sql`WHERE state IN (${Prisma.join(states)})` : Prisma.empty;

  const pageSize = Math.max(1, filters.pageSize ?? PAGE_SIZE);

  const [summary] = await prisma.$queryRaw<
    {
      all: number;
      out: number;
      low: number;
      in: number;
      matched: number;
      units: bigint | number;
      value: bigint | number;
    }[]
  >(Prisma.sql`
    ${cte}
    SELECT
      count(*)::int                                   AS all,
      count(*) FILTER (WHERE state = 'OUT')::int      AS out,
      count(*) FILTER (WHERE state = 'LOW')::int      AS low,
      count(*) FILTER (WHERE state = 'IN')::int       AS "in",
      ${
        states.length > 0
          ? Prisma.sql`count(*) FILTER (WHERE state IN (${Prisma.join(states)}))::int`
          : Prisma.sql`count(*)::int`
      }                                               AS matched,
      COALESCE(sum(GREATEST(stock, 0)), 0)::bigint    AS units,
      COALESCE(sum(GREATEST(stock, 0) * price), 0)::bigint AS value
    FROM classified
  `);

  const matched = summary?.matched ?? 0;
  const totalPages = Math.max(1, Math.ceil(matched / pageSize));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);

  // Emptiest first: the page is a worklist, so what is losing sales sorts to
  // the top and stays there without anyone choosing a sort order.
  const keys = await prisma.$queryRaw<{ product_id: string; variant_id: string | null }[]>(
    Prisma.sql`
      ${cte}
      SELECT product_id, variant_id
      FROM classified
      ${stateWhere}
      ORDER BY stock ASC, name ASC, variant_id ASC NULLS FIRST
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `,
  );

  const units = await hydrateUnits(keys);

  return {
    units,
    counts: {
      all: summary?.all ?? 0,
      OUT: summary?.out ?? 0,
      LOW: summary?.low ?? 0,
      IN: summary?.in ?? 0,
    },
    totals: {
      units: Number(summary?.units ?? 0),
      valueCents: Number(summary?.value ?? 0),
    },
    page,
    totalPages,
    matched,
  };
}

const UNIT_VARIANT_SELECT = {
  id: true,
  sku: true,
  stock: true,
  lowStockAt: true,
  reorderNote: true,
  priceCents: true,
  compareAtPriceCents: true,
  saleEndsAt: true,
  image: true,
  options: {
    select: {
      definitionId: true,
      value: true,
      valueKey: true,
      definition: { select: { label: true, unit: true, sortOrder: true } },
    },
  },
} as const;

/** One page of keys, in order, turned into typed units in the same order. */
async function hydrateUnits(
  keys: { product_id: string; variant_id: string | null }[],
): Promise<StockUnit[]> {
  if (keys.length === 0) return [];

  const productIds = [...new Set(keys.map((key) => key.product_id))];
  const variantIds = keys.flatMap((key) => (key.variant_id ? [key.variant_id] : []));

  const [products, flashItems] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        slug: true,
        image: true,
        stock: true,
        lowStockAt: true,
        reorderNote: true,
        priceCents: true,
        compareAtPriceCents: true,
        saleEndsAt: true,
        published: true,
        category: { select: { name: true } },
        brand: { select: { name: true } },
        variants: { where: { id: { in: variantIds } }, select: UNIT_VARIANT_SELECT },
      },
    }),
    /**
     * Which of these products a live flash sale is currently holding.
     *
     * `appliedAt` rather than the date window, deliberately. The window says
     * whether a sale *should* be live; `appliedAt` says whether the price
     * writes have actually happened — and it is the writes, not the schedule,
     * that make editing the column unsafe. See `FlashSale.appliedAt`.
     */
    prisma.flashSaleItem.findMany({
      where: { productId: { in: productIds }, flashSale: { appliedAt: { not: null } } },
      select: { productId: true, flashSale: { select: { name: true } } },
    }),
  ]);

  const productById = new Map(products.map((product) => [product.id, product]));
  const flashByProduct = new Map(flashItems.map((item) => [item.productId, item.flashSale.name]));

  const units: StockUnit[] = [];
  for (const key of keys) {
    const product = productById.get(key.product_id);
    if (!product) continue; // deleted between the two queries

    const shared = {
      productId: product.id,
      name: product.name,
      slug: product.slug,
      published: product.published,
      flashSaleName: flashByProduct.get(product.id) ?? null,
      category: product.category?.name ?? null,
      brand: product.brand?.name ?? null,
    };

    if (key.variant_id === null) {
      const threshold = product.lowStockAt ?? LOW_STOCK_THRESHOLD;
      units.push({
        ...shared,
        key: product.id,
        variantId: null,
        configuration: null,
        sku: null,
        image: product.image,
        stock: product.stock,
        lowStockAt: product.lowStockAt,
        threshold,
        reorderNote: product.reorderNote,
        priceCents: product.priceCents,
        compareAtPriceCents: product.compareAtPriceCents,
        saleEndsAt: product.saleEndsAt,
        state: stockState(product.stock, threshold),
      });
      continue;
    }

    const variant = product.variants.find((candidate) => candidate.id === key.variant_id);
    if (!variant) continue;
    const threshold = variant.lowStockAt ?? LOW_STOCK_THRESHOLD;
    units.push({
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
      lowStockAt: variant.lowStockAt,
      threshold,
      reorderNote: variant.reorderNote,
      priceCents: variant.priceCents,
      compareAtPriceCents: variant.compareAtPriceCents,
      saleEndsAt: variant.saleEndsAt,
      state: stockState(variant.stock, threshold),
    });
  }

  return units;
}

export interface HistoryFilters {
  productId?: string;
  /**
   * Narrow to one line of the product: a variant's id, or `null` for the
   * product's own row. Undefined means every line of the product. Only
   * meaningful alongside `productId`.
   */
  variantId?: string | null;
  reason?: StockChangeReason;
  page?: number;
  /** Overrides the page size — the list page shows a short recent strip. */
  pageSize?: number;
}

/** The `where` both ledgers share for "this product" / "this line". */
function lineWhere(filters: { productId?: string; variantId?: string | null }) {
  return {
    ...(filters.productId ? { productId: filters.productId } : {}),
    ...(filters.productId && filters.variantId !== undefined
      ? { variantId: filters.variantId }
      : {}),
  };
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
    ...lineWhere(filters),
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
  /** As on `HistoryFilters`: one line of the product, or every line. */
  variantId?: string | null;
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
  const where: Prisma.PriceChangeWhereInput = lineWhere(filters);

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
      fromCompareAtCents: true,
      toCompareAtCents: true,
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
