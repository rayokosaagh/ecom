import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/dal";

/**
 * The signed-in user's wishlisted product ids, as a Set for O(1) lookups when
 * rendering hearts on product grids. Cached per request — the home page, the
 * navbar and the card grid all share one query.
 */
export const getWishlistProductIds = cache(async (): Promise<Set<string>> => {
  const user = await getCurrentUser();
  if (!user) return new Set();

  const items = await prisma.wishlistItem.findMany({
    where: { userId: user.id },
    select: { productId: true },
  });

  return new Set(items.map((item) => item.productId));
});

/**
 * What the navbar heart needs: how much is saved, and how much of it is news.
 *
 * Both in one call because they are one indexed scan apart and always wanted
 * together. `unseen` is what the badge shows — see `User.wishlistSeenAt` for
 * why the badge is not simply `total`.
 */
export async function getWishlistCounts(userId: string, seenAt: Date | null) {
  const [total, unseen] = await Promise.all([
    prisma.wishlistItem.count({ where: { userId } }),
    prisma.wishlistItem.count({
      where: { userId, ...(seenAt ? { createdAt: { gt: seenAt } } : {}) },
    }),
  ]);

  return { total, unseen };
}

/**
 * Record that the list has been looked at, which empties the badge.
 *
 * Called from the wishlist page itself, inside `after()` — the visit is the
 * thing being recorded, so there is no button to hang it on, and it must not
 * make the reader wait on a write they did not ask for. The page renders its
 * own badge as zero rather than reading this back, because the stamp lands
 * after the response it would have to appear in.
 */
export async function markWishlistSeen(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { wishlistSeenAt: new Date() },
  });
}

/** Full wishlist rows for the /wishlist page, newest first. */
export async function getWishlist(userId: string) {
  return prisma.wishlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          image: true,
          priceCents: true,
          compareAtPriceCents: true,
          stock: true,
          published: true,
          colors: { orderBy: { sortOrder: "asc" as const }, select: { name: true, hex: true } },
          category: { select: { name: true } },
          // Wishlists are where a shopper waits for a price to drop, so the
          // "was" line matters here more than anywhere.
          variants: { select: { priceCents: true, compareAtPriceCents: true, stock: true } },
        },
      },
    },
  });
}
