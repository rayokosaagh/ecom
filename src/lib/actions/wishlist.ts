"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/dal";

/**
 * Add or remove a product from the signed-in user's wishlist.
 *
 * Called directly from a client component (not via a form), so it takes plain
 * arguments. `currentPath` brings guests back to where they tapped the heart
 * after signing in.
 */
export async function toggleWishlist(
  productId: string,
  currentPath: string,
): Promise<void> {
  const user = await getCurrentUser();

  if (!user) {
    const safePath =
      currentPath.startsWith("/") && !currentPath.startsWith("//")
        ? currentPath
        : "/products";
    redirect(`/login?redirectTo=${encodeURIComponent(safePath)}`);
  }

  // Only real, published products can be wishlisted.
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { published: true },
  });
  if (!product?.published) return;

  const existing = await prisma.wishlistItem.findUnique({
    where: { userId_productId: { userId: user.id, productId } },
  });

  if (existing) {
    await prisma.wishlistItem.delete({ where: { id: existing.id } });
  } else {
    await prisma.wishlistItem.create({ data: { userId: user.id, productId } });
  }

  // Hearts appear on every product surface, so refresh the whole layout.
  revalidatePath("/", "layout");
}
