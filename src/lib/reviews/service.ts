import "server-only";

import { prisma } from "@/lib/prisma";
import { PURCHASED_STATUSES } from "@/lib/orders/purchases";
import { ReviewStatus } from "@/generated/prisma/enums";

/**
 * Reading reviews and the ratings derived from them.
 *
 * Averages are computed on demand rather than denormalised onto Product. A
 * cached average is one more thing that can silently disagree with the rows it
 * summarises — every write path would have to remember to recompute it, and
 * the one that forgets is the one nobody notices. These are indexed aggregates
 * over a handful of rows per product; the cost is not the problem worth
 * solving.
 */

export type RatingSummary = {
  average: number;
  count: number;
  /** How many of those came from someone who bought this here. */
  verifiedCount: number;
  /** How many reviews gave each score, indexed 1–5. */
  distribution: Record<number, number>;
};

export const EMPTY_RATING: RatingSummary = {
  average: 0,
  count: 0,
  verifiedCount: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

/**
 * Average and count for many products at once.
 *
 * Batched because the alternative is one aggregate per card on a 24-product
 * grid. Products with no reviews are simply absent from the map, which callers
 * read as "no rating" rather than "zero stars" — they are not the same claim.
 */
export async function getRatings(
  productIds: string[],
): Promise<Map<string, { average: number; count: number }>> {
  if (productIds.length === 0) return new Map();

  const rows = await prisma.review.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds }, status: ReviewStatus.PUBLISHED },
    _avg: { rating: true },
    _count: { rating: true },
  });

  return new Map(
    rows.map((row) => [
      row.productId,
      { average: row._avg.rating ?? 0, count: row._count.rating },
    ]),
  );
}

/** The full breakdown for one product, for the summary bars. */
export async function getRatingSummary(productId: string): Promise<RatingSummary> {
  const [rows, verifiedCount] = await Promise.all([
    prisma.review.groupBy({
      by: ["rating"],
      where: { productId, status: ReviewStatus.PUBLISHED },
      _count: { rating: true },
    }),
    prisma.review.count({
      where: { productId, status: ReviewStatus.PUBLISHED, verified: true },
    }),
  ]);

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let count = 0;

  for (const row of rows) {
    distribution[row.rating] = row._count.rating;
    total += row.rating * row._count.rating;
    count += row._count.rating;
  }

  return {
    average: count === 0 ? 0 : total / count,
    count,
    verifiedCount,
    distribution,
  };
}

const REVIEW_SELECT = {
  id: true,
  rating: true,
  title: true,
  body: true,
  verified: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  user: { select: { name: true, email: true, image: true } },
  media: {
    orderBy: { sortOrder: "asc" as const },
    select: { id: true, url: true, kind: true },
  },
  /// How many found it helpful. An aggregate rather than a stored counter —
  /// see the note on the `ReviewLike` model.
  _count: { select: { likes: true } },
  /// Replies read oldest-first: this is a conversation, and a conversation
  /// read newest-first is answers before their question.
  replies: {
    where: { status: ReviewStatus.PUBLISHED },
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      body: true,
      verified: true,
      createdAt: true,
      userId: true,
      user: { select: { name: true, email: true, image: true } },
    },
  },
} as const;

/**
 * Published reviews for a product, newest first.
 *
 * `viewerId` is threaded through so the viewer's own review comes back even
 * when it has been hidden — someone whose review was moderated should see that
 * it still exists rather than watch it vanish and write another.
 */
export async function getReviews(productId: string, viewerId?: string) {
  return prisma.review.findMany({
    where: {
      productId,
      OR: [
        { status: ReviewStatus.PUBLISHED },
        ...(viewerId ? [{ userId: viewerId }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      ...REVIEW_SELECT,
      // Whether *this* viewer has already liked each review, fetched as a
      // bounded sub-select rather than a second query and a lookup map. A
      // signed-out visitor asks for nothing: `likes: false` would still be a
      // key Prisma has to honour, and an empty array is what the caller reads
      // as "not liked" anyway.
      ...(viewerId
        ? {
            likes: {
              where: { userId: viewerId },
              select: { userId: true },
              take: 1,
            },
          }
        : {}),
    },
  });
}

export type ReviewView = Awaited<ReturnType<typeof getReviews>>[number];

/**
 * Where this person stands: may they write, would it be verified, and what did
 * they write before?
 *
 * Both checks run here so the page can render the right prompt — an invitation
 * to sign in, an explanation, or a form — rather than offering a control that
 * will be refused. The action re-runs both before writing; this only decides
 * what to draw.
 */
export async function getReviewEligibility(productId: string, userId?: string) {
  if (!userId) {
    return { signedIn: false, canReview: false, purchased: false, own: null };
  }

  const [ordered, purchase, own] = await Promise.all([
    hasAnyOrder(userId),
    hasPurchased(productId, userId),
    prisma.review.findUnique({
      where: { userId_productId: { userId, productId } },
      select: REVIEW_SELECT,
    }),
  ]);

  return { signedIn: true, canReview: ordered, purchased: purchase, own };
}

/**
 * Has this account ever completed an order?
 *
 * The bar for writing at all. Deliberately account-level rather than
 * per-product: a customer who has bought here is a real person with something
 * to lose, and can speak about anything in the catalogue. A fresh account that
 * has bought nothing cannot review at all, which is what stops the obvious
 * astroturfing.
 */
export async function hasAnyOrder(userId: string): Promise<boolean> {
  const order = await prisma.order.findFirst({
    where: { userId, status: { in: [...PURCHASED_STATUSES] } },
    select: { id: true },
  });
  return Boolean(order);
}

/** Did this user buy this exact product? What the badge records. */
export async function hasPurchased(
  productId: string,
  userId: string,
): Promise<boolean> {
  const line = await prisma.orderItem.findFirst({
    where: { productId, order: { userId, status: { in: [...PURCHASED_STATUSES] } } },
    select: { id: true },
  });
  return Boolean(line);
}

/** Every review, for the moderation screen. */
export async function getReviewsForAdmin(status?: ReviewStatus) {
  return prisma.review.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      ...REVIEW_SELECT,
      product: { select: { id: true, name: true, slug: true, image: true } },
    },
  });
}

export async function getReviewCounts(): Promise<Record<ReviewStatus, number>> {
  const rows = await prisma.review.groupBy({ by: ["status"], _count: { _all: true } });
  const counts = { PUBLISHED: 0, HIDDEN: 0 } as Record<ReviewStatus, number>;
  for (const row of rows) counts[row.status] = row._count._all;
  return counts;
}
