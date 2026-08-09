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
