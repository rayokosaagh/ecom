import "server-only";

import { prisma } from "@/lib/prisma";
import { saleFor, saleOfRow, type SaleView } from "@/lib/products/sale";
import { availableStock } from "@/lib/products/variants";
import { getInventory, type StockUnit } from "@/lib/inventory/service";
import type { ProductCardData } from "@/components/products/ProductCard";

/**
 * Reads for the sale shelf and the admin screen that manages it.
 *
 * The rule for what counts as on sale lives in `lib/products/sale`, not here.
 * This module's only job is fetching a bounded candidate set and letting that
 * rule decide.
 */

/**
 * How many products the shelf will consider before ranking them.
 *
 * The ordering the shelf actually wants — deepest discount first — is a
 * comparison between two columns, which Postgres will not sort on without an
 * expression index this schema does not carry. So a bounded, cheap slice is
 * pulled and ranked in memory, exactly as catalogue search does with its own
 * SCAN_LIMIT. Rows are small; raise this alongside a real index if the
 * catalogue ever outgrows it.
 */
const CANDIDATE_LIMIT = 60;

/**
 * The shape the card needs, plus the sale it is advertising.
 *
 * `description` rides along for the lead card, which has room for a line of
 * copy the way the featured panel does. The grid cards ignore it.
 */
export type SaleProductView = ProductCardData & {
  sale: SaleView;
  description: string;
};

const SALE_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  image: true,
  priceCents: true,
  compareAtPriceCents: true,
  saleEndsAt: true,
  stock: true,
  published: true,
  colors: { orderBy: { sortOrder: "asc" as const }, select: { name: true, hex: true } },
  category: { select: { name: true } },
  // `slug` so the card's mark links through to the brand's listing.
  brand: { select: { name: true, slug: true, iconSvg: true, logo: true, logoTreatment: true } },
  variants: {
    select: { priceCents: true, compareAtPriceCents: true, saleEndsAt: true, stock: true },
  },
} as const;

/**
 * Which rows could possibly be on sale.
 *
 * Deliberately loose: it asks only whether a "was" price is set anywhere, not
 * whether it is actually higher than the price. Comparing two columns is the
 * part Prisma cannot express portably here, and doing it in `saleFor` instead
 * means the storefront, the admin list and the badge all agree by construction
 * rather than by two definitions being kept in step.
 */
export const SALE_CANDIDATES = {
  OR: [
    { compareAtPriceCents: { not: null } },
    { variants: { some: { compareAtPriceCents: { not: null } } } },
  ],
};

/**
 * Ceiling on the sale listing.
 *
 * Higher than `CANDIDATE_LIMIT` because that one bounds a shelf that only shows
 * four; this one bounds a page that shows everything. Still bounded: the page
 * has no pagination, so this is what stops a shop that puts its whole catalogue
 * on sale from rendering thousands of cards into one response. Raise it
 * alongside pagination, not instead of it.
 */
const LISTING_LIMIT = 200;

/**
 * Products currently on sale, deepest discount first.
 *
 * Sold-out products sink rather than disappear. A shelf is there to sell, so
 * something nobody can buy has no business at the front of it — but dropping
 * it outright would let a shop with one popular sale item show an empty
 * section, and the card already says "Sold out" plainly.
 */
async function rankedSaleProducts(candidateLimit: number) {
  const rows = await prisma.product.findMany({
    where: { published: true, ...SALE_CANDIDATES },
    // Most recently touched first, so the candidate window follows whatever an
    // admin has been working on rather than freezing on the oldest sales.
    orderBy: { updatedAt: "desc" },
    take: candidateLimit,
    select: SALE_SELECT,
  });

  return rows
    .map((product) => {
      const sale = saleFor(product, product.variants);
      if (!sale) return null;
      return {
        product,
        sale,
        soldOut: availableStock(product, product.variants) === 0,
      };
    })
    .filter((entry) => entry !== null)
    .sort(
      (a, b) =>
        Number(a.soldOut) - Number(b.soldOut) ||
        b.sale.percentOff - a.sale.percentOff ||
        b.sale.savingCents - a.sale.savingCents ||
        // Name last, so the order is stable between identical requests.
        a.product.name.localeCompare(b.product.name),
    );
}

/** The home shelf's slice — the best few. */
export async function getSaleProducts(limit = 8): Promise<SaleProductView[]> {
  const ranked = await rankedSaleProducts(CANDIDATE_LIMIT);
  return ranked.slice(0, limit).map((entry) => ({ ...entry.product, sale: entry.sale }));
}

/**
 * One page of the sale listing, plus how many there are in total.
 *
 * Same ranking as the shelf — deepest discount first, sold-out last — so the
 * first cards on the page are the ones the home page was already showing, in
 * the same order. Arriving from "View all" onto a differently ordered list
 * reads as having lost your place.
 *
 * The ranking is computed in memory (a discount is a comparison between two
 * columns), so the slice happens here rather than as a `skip`/`take`: ranking
 * one page against itself would not be the same order. Rows are narrow — no
 * inlined brand SVG — and bounded by `LISTING_LIMIT`.
 */
export async function getSaleProductPage(
  page: number,
  pageSize: number,
): Promise<{
  products: SaleProductView[];
  total: number;
  totalPages: number;
  /** Deepest discount across the whole sale, not this page. */
  bestPercentOff: number;
  /** What every reduction adds up to, across the whole sale. */
  totalSavingCents: number;
}> {
  const ranked = await rankedSaleProducts(LISTING_LIMIT);

  const total = ranked.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Clamped rather than empty: a bookmark of page 3 should land on the last
  // page once a sale has shrunk, not on a blank grid.
  const current = Math.min(Math.max(page, 1), totalPages);

  return {
    products: ranked
      .slice((current - 1) * pageSize, current * pageSize)
      .map((entry) => ({ ...entry.product, sale: entry.sale })),
    total,
    totalPages,
    /**
     * Computed here, over every ranked row, so the page header says the same
     * thing on page 3 as on page 1. Reading them off the returned slice instead
     * would quietly make "up to 30% off" mean "up to 30% off, on this page".
     */
    bestPercentOff: ranked.reduce(
      (best, entry) => Math.max(best, entry.sale.percentOff),
      0,
    ),
    totalSavingCents: ranked.reduce((sum, entry) => sum + entry.sale.savingCents, 0),
  };
}

/**
 * One line the sales screen manages: a product, or one configuration of it.
 *
 * The same unit the inventory page lists by and the price panel writes to —
 * a configurable product is on sale one configuration at a time, because that
 * is how it is priced. See `StockUnit`.
 */
export type SaleLine = StockUnit & {
  /** The discount as customers would see it, or null when none is showing. */
  sale: SaleView | null;
};

/**
 * Ceiling on the lines the sales screen reads.
 *
 * The screen has no pagination, so this is what stops a shop that marks down
 * its whole catalogue from rendering thousands of rows. Well above any real
 * sale; raise it alongside pagination, not instead of it.
 */
const SALE_LINES_LIMIT = 500;

/**
 * Everything for the admin sales screen.
 *
 * Drafts are kept — an admin setting up a sale before launch needs to see it,
 * and the list marks it as a draft rather than pretending it is live.
 *
 * Two kinds of row are returned apart from the sales themselves, because each
 * is almost certainly a mistake someone wants to see rather than a row that
 * should vanish:
 *
 * - `broken`: a regular price that is not above the price, so no discount is
 *   showing. Fixable in place, with the same panel.
 * - `ignored`: a regular price on a product that is priced by configuration.
 *   The storefront reads the configurations and never this column, so it is
 *   noise with no effect — cleared with one click.
 */
export async function getSalesForAdmin() {
  const [inventory, ignoredRows] = await Promise.all([
    getInventory({ pageSize: SALE_LINES_LIMIT }),
    prisma.product.findMany({
      where: { compareAtPriceCents: { not: null }, variants: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, priceCents: true, compareAtPriceCents: true },
    }),
  ]);

  const lines: SaleLine[] = inventory.units
    .filter((unit) => unit.compareAtPriceCents !== null)
    .map((unit) => ({
      ...unit,
      sale: saleOfRow({ priceCents: unit.priceCents, compareAtPriceCents: unit.compareAtPriceCents }),
    }));

  const onSale = lines
    .filter((line) => line.sale !== null)
    // Deepest discount first, as the shelf shows them; name last so the order
    // is stable between identical requests.
    .sort(
      (a, b) =>
        b.sale!.percentOff - a.sale!.percentOff ||
        b.sale!.savingCents - a.sale!.savingCents ||
        a.name.localeCompare(b.name),
    );
  const broken = lines.filter((line) => line.sale === null);

  return {
    onSale,
    broken,
    ignored: ignoredRows,
    /** Lines customers can actually see on the Sale page right now. */
    live: onSale.filter((line) => line.published).length,
    bestPercentOff: onSale.reduce((best, line) => Math.max(best, line.sale!.percentOff), 0),
    totalSavingCents: onSale.reduce((sum, line) => sum + line.sale!.savingCents, 0),
    /** Whether the read was cut short — the screen says so rather than lying. */
    truncated: inventory.totalPages > 1,
  };
}

/**
 * Lines matching a search, for putting something on sale.
 *
 * The inventory read, because it is already the list of things that have a
 * price of their own. A short slice: the box is for finding one product, not
 * browsing the catalogue.
 */
export async function findSaleCandidates(query: string, limit = 12): Promise<SaleLine[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const inventory = await getInventory({ query: trimmed, pageSize: limit });
  return inventory.units
    .map((unit) => ({
      ...unit,
      sale: saleOfRow({ priceCents: unit.priceCents, compareAtPriceCents: unit.compareAtPriceCents }),
    }))
    // Name order, not stock order: someone typing a name expects to see it
    // where they would look for it, not sorted by how many are left.
    .sort((a, b) => a.name.localeCompare(b.name) || (a.configuration ?? "").localeCompare(b.configuration ?? ""));
}

/** How many products are on sale right now, for the dashboard tile. */
export async function countActiveSales(): Promise<number> {
  const rows = await prisma.product.findMany({
    where: { published: true, ...SALE_CANDIDATES },
    select: {
      priceCents: true,
      compareAtPriceCents: true,
      variants: { select: { priceCents: true, compareAtPriceCents: true } },
    },
  });

  return rows.filter((product) => saleFor(product, product.variants)).length;
}
