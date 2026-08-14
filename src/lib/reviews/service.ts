import "server-only";

import { prisma } from "@/lib/prisma";
import { PURCHASED_STATUSES } from "@/lib/orders/purchases";
import { orderReference } from "@/lib/orders/reference";
import {
  PER_PAGE,
  statusForTab,
  type DateWindow,
  type ReviewSort,
  type ReviewTab,
} from "@/lib/reviews/list-params";
import { ReviewStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

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

/* -------------------------------------------------------------------------- */
/* The moderation queue                                                       */
/* -------------------------------------------------------------------------- */

/**
 * What a review row carries in the admin list.
 *
 * The storefront's `REVIEW_SELECT` plus the three things a moderator decides on
 * that a shopper never sees: which product it is about, who has flagged it, and
 * who last acted on it. Replies are dropped — the queue is about the review,
 * and a thread of answers inside a list row is a page nobody can scan.
 */
const ADMIN_REVIEW_SELECT = {
  id: true,
  rating: true,
  title: true,
  body: true,
  verified: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  moderatedAt: true,
  userId: true,
  user: { select: { name: true, email: true, image: true } },
  media: {
    orderBy: { sortOrder: "asc" as const },
    select: { id: true, url: true, kind: true },
  },
  product: { select: { id: true, name: true, slug: true, image: true } },
  moderatedBy: { select: { name: true, email: true } },
  /// Open reports only, and just enough of each to summarise the flag on the
  /// card — the full list with its notes is a detail-panel question.
  reports: {
    where: { resolvedAt: null },
    orderBy: { createdAt: "desc" as const },
    select: { id: true, reason: true, note: true, createdAt: true },
  },
  _count: { select: { likes: true, replies: true } },
} as const;

export interface ReviewListFilters {
  tab: ReviewTab;
  query?: string;
  productId?: string;
  rating?: number;
  window?: DateWindow;
}

/**
 * The order a customer bought a product on, if they did.
 *
 * Two-step rather than one clause, because the precise question — "reviews
 * attached to *this* order" — pairs a customer with a product, and Prisma
 * cannot compare a nested filter against the outer row's `productId`. So the
 * orders are resolved first and turned into the (buyer, product) pairs they
 * stand for.
 *
 * Matched with `contains` for the same reason the order list does it: the
 * reference people quote is the last eight characters of the id, so neither end
 * can be anchored. Returns null when the text is not reference-shaped at all,
 * which is what keeps every ordinary word search from costing a second query.
 */
async function orderMatches(query: string) {
  const reference = query.replace(/^#/, "").trim();
  if (reference.length < 4 || !/^[a-z0-9]+$/i.test(reference)) return null;

  const orders = await prisma.order.findMany({
    where: {
      id: { contains: reference, mode: "insensitive" },
      status: { in: [...PURCHASED_STATUSES] },
    },
    select: { userId: true, items: { select: { productId: true } } },
    // A reference is meant to identify one order; the cap is only here so a
    // two-character-ish match cannot turn into an unbounded IN list.
    take: 20,
  });

  const pairs = orders.flatMap((order) =>
    order.items
      .filter((item) => item.productId)
      .map((item) => ({ userId: order.userId, productId: item.productId! })),
  );

  return pairs.length > 0 ? pairs : null;
}

/**
 * Everything the queue filters on, as one `where`.
 *
 * Async because of the order-reference lookup above; every other clause is
 * plain. Built once and shared by the list, the tab counts and the total, so a
 * count can never disagree with the rows underneath it.
 */
async function reviewWhere(
  filters: ReviewListFilters,
): Promise<Prisma.ReviewWhereInput> {
  const where: Prisma.ReviewWhereInput = {};

  const status = statusForTab(filters.tab);
  if (status) where.status = status;
  // Being flagged is not a status — see `REVIEW_TABS`.
  if (filters.tab === "reported") where.reports = { some: { resolvedAt: null } };

  if (filters.productId) where.productId = filters.productId;
  if (filters.rating) where.rating = filters.rating;

  if (filters.window?.from || filters.window?.to) {
    where.createdAt = {
      ...(filters.window.from ? { gte: filters.window.from } : {}),
      ...(filters.window.to ? { lte: filters.window.to } : {}),
    };
  }

  const query = filters.query?.trim();
  if (query) {
    const contains = { contains: query, mode: "insensitive" as const };
    const pairs = await orderMatches(query);

    where.OR = [
      { title: contains },
      { body: contains },
      { product: { name: contains } },
      { user: { name: contains } },
      { user: { email: contains } },
      ...(pairs
        ? pairs.map(({ userId, productId }) => ({ userId, productId }))
        : []),
    ];
  }

  return where;
}

const ORDER_BY: Record<ReviewSort, Prisma.ReviewOrderByWithRelationInput> = {
  newest: { createdAt: "desc" },
  oldest: { createdAt: "asc" },
  highest: { rating: "desc" },
  lowest: { rating: "asc" },
  // Not offered in the sort menu; the Reported tab uses it so the most-flagged
  // review is the one waiting at the top.
  reported: { reports: { _count: "desc" } },
};

/** One page of the moderation queue, with the totals the pager needs. */
export async function getReviewsForAdmin(
  filters: ReviewListFilters & { sort: ReviewSort; page: number },
) {
  const where = await reviewWhere(filters);

  const total = await prisma.review.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  // Clamped, so a stale `?page=9` after a filter change lands on the last page
  // of results rather than on a blank list.
  const page = Math.min(Math.max(1, filters.page), totalPages);

  const reviews = await prisma.review.findMany({
    where,
    orderBy: [ORDER_BY[filters.sort], { id: "desc" }],
    skip: (page - 1) * PER_PAGE,
    take: PER_PAGE,
    select: ADMIN_REVIEW_SELECT,
  });

  return { reviews, total, totalPages, page, perPage: PER_PAGE };
}

export type AdminReviewRow = Awaited<
  ReturnType<typeof getReviewsForAdmin>
>["reviews"][number];

/**
 * How many reviews each tab would show, under the filters that are already on.
 *
 * The search and the dropdowns narrow the counts because the counts are a
 * description of the list: a rail claiming 83 pending beside a filtered list
 * holding two of them is a rail describing a different page.
 *
 * These deliberately do not sum to All. A flagged review is still published or
 * hidden, and it is counted in both places — see `REVIEW_TABS`.
 */
export async function getReviewQueueCounts(
  filters: Omit<ReviewListFilters, "tab">,
) {
  const base = await reviewWhere({ ...filters, tab: "" });

  const [all, pending, published, hidden, reported] = await Promise.all([
    prisma.review.count({ where: base }),
    prisma.review.count({ where: { ...base, status: ReviewStatus.PENDING } }),
    prisma.review.count({ where: { ...base, status: ReviewStatus.PUBLISHED } }),
    prisma.review.count({ where: { ...base, status: ReviewStatus.HIDDEN } }),
    prisma.review.count({
      where: { ...base, reports: { some: { resolvedAt: null } } },
    }),
  ]);

  return { all, pending, published, hidden, reported };
}

export type ReviewQueueCounts = Awaited<ReturnType<typeof getReviewQueueCounts>>;

/**
 * The shop's review figures, for the summary row and the distribution bars.
 *
 * Two different bases, on purpose, because two different questions are being
 * asked. The average and the distribution are what a *shopper* sees, so they
 * count published reviews only — a hidden one has been taken out of the rating
 * and a pending one was never in it, and an average that included them would
 * disagree with every star on the storefront. The workflow numbers count every
 * row, because a queue with nothing in it is the thing the moderator is trying
 * to establish.
 */
export async function getReviewStats() {
  const [byRating, byStatus, verifiedPublished, reported, total] = await Promise.all([
    prisma.review.groupBy({
      by: ["rating"],
      where: { status: ReviewStatus.PUBLISHED },
      _count: { _all: true },
    }),
    prisma.review.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.review.count({
      where: { status: ReviewStatus.PUBLISHED, verified: true },
    }),
    prisma.review.count({ where: { reports: { some: { resolvedAt: null } } } }),
    prisma.review.count(),
  ]);

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let weighted = 0;
  let publishedCount = 0;

  for (const row of byRating) {
    distribution[row.rating] = row._count._all;
    weighted += row.rating * row._count._all;
    publishedCount += row._count._all;
  }

  const status = { PENDING: 0, PUBLISHED: 0, HIDDEN: 0 } as Record<ReviewStatus, number>;
  for (const row of byStatus) status[row.status] = row._count._all;

  return {
    total,
    published: status.PUBLISHED,
    pending: status.PENDING,
    hidden: status.HIDDEN,
    reported,
    average: publishedCount === 0 ? 0 : weighted / publishedCount,
    distribution,
    /** The base the average and the bars are drawn from. */
    publishedCount,
    verifiedPublished,
  };
}

export type ReviewStats = Awaited<ReturnType<typeof getReviewStats>>;

/**
 * The products that have been reviewed, for the queue's product filter.
 *
 * Only products with at least one review: a dropdown listing the whole
 * catalogue would be forty-odd names, most of which filter the list to nothing.
 */
export async function getReviewedProducts() {
  const grouped = await prisma.review.groupBy({
    by: ["productId"],
    _count: { _all: true },
    orderBy: { _count: { productId: "desc" } },
    take: 50,
  });

  if (grouped.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: grouped.map((row) => row.productId) } },
    select: { id: true, name: true },
  });

  const names = new Map(products.map((product) => [product.id, product.name]));

  return grouped
    .map((row) => ({
      id: row.productId,
      name: names.get(row.productId) ?? "Deleted product",
      count: row._count._all,
    }))
    .filter((entry) => names.has(entry.id));
}

/**
 * One review, with everything the detail panel shows.
 *
 * The order is looked up rather than stored on the review. `Review.verified`
 * already records *that* they bought it, and a second copy of *which order*
 * would be a snapshot that could disagree with the orders table after a
 * cancellation. The most recent qualifying order wins, which is the one a
 * support conversation is almost always about.
 */
export async function getReviewDetail(reviewId: string) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: {
      ...ADMIN_REVIEW_SELECT,
      moderatedById: true,
      // Every report, settled ones included: the panel is where a moderator
      // works out whether this is a first complaint or a pattern.
      reports: {
        orderBy: { createdAt: "desc" as const },
        select: {
          id: true,
          reason: true,
          note: true,
          createdAt: true,
          resolvedAt: true,
          user: { select: { name: true, email: true } },
        },
      },
      replies: {
        orderBy: { createdAt: "asc" as const },
        select: {
          id: true,
          body: true,
          status: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!review) return null;

  const [order, rating] = await Promise.all([
    prisma.order.findFirst({
      where: {
        userId: review.userId,
        status: { in: [...PURCHASED_STATUSES] },
        items: { some: { productId: review.product.id } },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, status: true },
    }),
    getRatings([review.product.id]),
  ]);

  const productRating = rating.get(review.product.id) ?? null;

  return {
    ...review,
    order: order
      ? {
          reference: orderReference(order.id),
          placedAt: order.createdAt,
          status: order.status,
        }
      : null,
    productRating,
  };
}

export type ReviewDetail = NonNullable<Awaited<ReturnType<typeof getReviewDetail>>>;
