"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";

export type SaleActionState = { message?: string; success?: string };

/** Every surface a price appears on. */
function revalidateSaleViews(slug?: string) {
  revalidatePath("/");
  revalidatePath("/admin/sales");
  revalidatePath("/dashboard/products");
  // Cards across the catalogue carry the "was" line too.
  revalidatePath("/products", "layout");
  if (slug) revalidatePath(`/products/${slug}`);
}

/**
 * End a sale, leaving the price where it is.
 *
 * Clearing the "was" price is the whole operation — it does **not** put the
 * price back up. That is deliberate and is the only honest reading: the shop
 * has been charging the reduced figure, and silently restoring the old one
 * from a button labelled "end sale" would change what customers pay as a side
 * effect of tidying up a badge. Raising the price again is a price change, and
 * belongs in the product form where it is visible.
 *
 * Variants are cleared alongside the product, because either can carry a sale
 * and leaving half of one behind is how a product stays on the sale shelf with
 * no discount showing.
 */
export async function endSale(productId: string): Promise<SaleActionState> {
  await requireAdmin();

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, slug: true, name: true },
  });
  if (!product) return { message: "That product no longer exists." };

  await prisma.$transaction([
    prisma.product.update({
      where: { id: product.id },
      data: { compareAtPriceCents: null },
    }),
    prisma.productVariant.updateMany({
      where: { productId: product.id },
      data: { compareAtPriceCents: null },
    }),
  ]);

  revalidateSaleViews(product.slug);

  return {
    success: `${product.name} is no longer on sale. Its price is unchanged.`,
  };
}
