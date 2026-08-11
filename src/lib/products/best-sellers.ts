import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";
import { REVENUE_STATUSES } from "@/lib/dashboard/metrics";
import { availableStock, priceRange } from "@/lib/products/variants";

/**
 * What has actually sold, for the shelf under the hero.
 *
 * The distinction that gives this section a reason to exist: **featured is what
 * the shop chose, best-selling is what customers chose.** The home page was
 * showing the featured list twice in a row — once as this accordion and again
 * as the spotlight below it — so the row was a second telling of the same
 * story. Ranking by sales makes it a different one, from a source no admin
 * controls.
 *
 * Ranked by **units, not revenue.** The dashboard's "top products" sorts by
 * revenue, which is the right question for a shopkeeper — where the money came
 * from — and the wrong one here: sorted that way, one laptop outranks two
 * hundred cables, and a shelf headed "best sellers" would be listing the most
 * expensive things instead of the most popular ones. Both readings are correct
 * for their own page; this is the one a shopper means.
 */

export interface BestSellerView {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  brand: string | null;
  minCents: number;
  priceVaries: boolean;
  soldOut: boolean;
}

/**
 * How far back "best selling" looks.
 *
 * A window rather than all time, because all time ossifies: something that sold
 * well in the shop's first month would sit on the front page for ever, and the
 * shelf would slowly stop describing anything that is happening. Ninety days is
 * long enough to survive a quiet fortnight and short enough that the list still
 * moves.
 */
const WINDOW_DAYS = 90;

/**
 * Below this the shelf is not worth showing — and it is the accordion's own
 * floor, not a number invented here: it renders nothing under three panels,
 * because two is a pair and one is a picture.
 */
const MIN_PRODUCTS = 3;

/** Ordered product ids, most units first. */
async function rankProductIds(since: Date | null, take: number): Promise<string[]> {
  // `groupBy` can sum a column, which is all this needs — the dashboard has to
  // drop to raw line items only because *revenue* is price × quantity, and no
  // aggregate multiplies two columns for you.
  const rows = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      // Nulled when a product is deleted. Its sales were still sales, and the
      // dashboard counts them by their snapshotted name — but this shelf links
      // to a page, and a deleted product has none.
      productId: { not: null },
      order: {
        status: { in: [...REVENUE_STATUSES] },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take,
  });

  return rows.map((row) => row.productId).filter((id): id is string => id !== null);
}

async function loadBestSellers(limit: number): Promise<BestSellerView[]> {
  // Over-fetched, because the ranking runs on orders and the shelf renders
  // products: anything since unpublished drops out between the two steps, and
  // asking for exactly `limit` ids would leave the row short by however many
  // that was. Cheap — this is one grouped read over an indexed column.
  const overFetch = Math.max(limit * 3, limit + 6);

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  let ids = await rankProductIds(since, overFetch);
  let products = await resolve(ids, limit);

  /**
   * Fall back to all time when the window is too thin.
   *
   * Without this the shelf is empty for every shop younger than its own window,
   * and for any shop having a quiet quarter — which is exactly when a front
   * page can least afford a hole. The window is the preference, not a
   * requirement: a real best-seller list beats a correct-but-absent one.
   */
  if (products.length < MIN_PRODUCTS) {
    ids = await rankProductIds(null, overFetch);
    products = await resolve(ids, limit);
  }

  return products;
}

/** Turn ranked ids into renderable products, keeping the ranking. */
async function resolve(ids: string[], limit: number): Promise<BestSellerView[]> {
  if (ids.length === 0) return [];

  const rows = await prisma.product.findMany({
    where: { id: { in: ids }, published: true },
    select: {
      id: true,
      slug: true,
      name: true,
      image: true,
      priceCents: true,
      stock: true,
      brand: { select: { name: true } },
      variants: { select: { priceCents: true, stock: true } },
    },
  });

  const byId = new Map(rows.map((row) => [row.id, row]));

  // Walked in ranking order rather than sorting the fetched rows: `findMany`
  // returns them in whatever order it likes, and the whole point of this shelf
  // is the order.
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .slice(0, limit)
    .map((row) => {
      const range = priceRange(row, row.variants);
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        image: row.image,
        brand: row.brand?.name ?? null,
        minCents: range.minCents,
        priceVaries: range.varies,
        soldOut: availableStock(row, row.variants) === 0,
      };
    });
}

/**
 * The shelf, cached across requests on a timer.
 *
 * A timer here, where the announcement strip refused one — and the difference
 * is worth being explicit about, because the two look like the same decision.
 * An announcement becomes true when an admin says so, so a clock could only be
 * wrong about it; this list becomes true when somebody buys something, which
 * happens with no request to this app at all and nothing to invalidate a tag
 * from. Tagging it would mean the checkout knowing about the home page's shelf.
 *
 * An hour is generous on purpose: nobody is harmed by a best-seller list that
 * is an hour behind, and the trade is one query an hour instead of one per
 * visitor on the busiest page in the shop.
 */
export const getBestSellers = cache(
  unstable_cache(loadBestSellers, ["best-sellers"], { revalidate: 3600 }),
);
