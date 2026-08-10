import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { OrderStatus, ReviewStatus } from "@/generated/prisma/enums";

/**
 * What a customer has actually bought.
 *
 * The definition of "bought" lives here rather than in the review module that
 * used to hold it, because two features now turn on it — who may review, and
 * what appears under Recently purchased — and they must not be able to
 * disagree. A product offered for review that the shop does not count as
 * purchased, or the reverse, is a dead button either way.
 */

/**
 * Money has changed hands and the order was not unwound.
 *
 * PENDING is absent deliberately: an unpaid wallet order holds stock and may
 * still be swept away by `releaseAbandonedOrders`, so treating it as a purchase
 * would offer a review of something nobody has paid for. CANCELLED and
 * REFUNDED are absent for the obvious reason.
 */
export const PURCHASED_STATUSES = [
  OrderStatus.PAID,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
] as const;

/**
 * How many order lines are read before de-duplicating.
 *
 * Recently purchased is a list of *products*, but the rows are lines, and one
 * product bought four times is four rows. Scanning a bounded window and
 * reducing it here keeps the query a single indexed read with a fixed ceiling.
 *
 * The trade is stated rather than hidden: a shopper whose last 60 lines are all
 * the same few products will not see a distinct product older than that window.
 * For a panel called *recently* purchased that is the right answer anyway — the
 * full record is the order history above it, which is properly paginated.
 */
const SCAN_LIMIT = 60;

/** How many products the panel shows. */
export const RECENT_PURCHASE_LIMIT = 8;

export type RecentPurchase = {
  productId: string;
  name: string;
  slug: string | null;
  image: string | null;
  /** Still buyable, and so still reviewable — `submitReview` requires it. */
  published: boolean;
  /** When this product was last bought, not when it was first. */
  purchasedAt: Date;
  /** The reader's own verdict, if they have already given one. */
  review: { rating: number; status: ReviewStatus } | null;
};

/**
 * The products this account has bought, most recently first, one row each.
 *
 * `cache()` for the same reason the rest of the profile's reads have it: this
 * is per-account data on an authenticated page, deduplicated within a render
 * and never held between requests.
 *
 * De-duplication is done here rather than with Prisma's `distinct`, which is
 * applied by the query engine *after* `take` — so `distinct` with a limit would
 * quietly return fewer products than asked for whenever somebody had bought the
 * same thing twice in a row.
 */
export const getRecentPurchases = cache(
  async (
    userId: string,
    limit: number = RECENT_PURCHASE_LIMIT,
  ): Promise<RecentPurchase[]> => {
    const lines = await prisma.orderItem.findMany({
      where: {
        // A line whose product was deleted keeps its snapshot but has nothing
        // left to buy or review.
        productId: { not: null },
        order: { userId, status: { in: [...PURCHASED_STATUSES] } },
      },
      orderBy: { order: { createdAt: "desc" } },
      take: SCAN_LIMIT,
      select: {
        productId: true,
        order: { select: { createdAt: true } },
        product: {
          select: { id: true, name: true, slug: true, image: true, published: true },
        },
      },
    });

    // First sighting wins, and the rows arrive newest-first, so the date kept
    // is the most recent purchase of that product.
    const seen = new Map<string, RecentPurchase>();
    for (const line of lines) {
      if (!line.product || seen.has(line.product.id)) continue;
      seen.set(line.product.id, {
        productId: line.product.id,
        name: line.product.name,
        slug: line.product.slug,
        image: line.product.image,
        published: line.product.published,
        purchasedAt: line.order.createdAt,
        review: null,
      });
      if (seen.size >= limit) break;
    }

    const purchases = [...seen.values()];
    if (purchases.length === 0) return [];

    // One query for every verdict, rather than one per card.
    const reviews = await prisma.review.findMany({
      where: { userId, productId: { in: purchases.map((p) => p.productId) } },
      select: { productId: true, rating: true, status: true },
    });
    const byProduct = new Map(reviews.map((review) => [review.productId, review]));

    return purchases.map((purchase) => {
      const review = byProduct.get(purchase.productId);
      return {
        ...purchase,
        review: review ? { rating: review.rating, status: review.status } : null,
      };
    });
  },
);
