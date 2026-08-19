"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";

export type SaleActionState = { message?: string; success?: string };

/**
 * Clear a regular price set on a product that is priced by configuration.
 *
 * The storefront prices a configurable product from its variants and never
 * reads the product's own `compareAtPriceCents`, so the column has no effect
 * there — it is left over from before sales moved to the inventory page, or
 * from a product created on sale and then given configurations. Clearing it
 * changes nothing a customer sees and nothing a ledger would record (it is not
 * a stock unit's price), which is why this is a plain update rather than a
 * pass through `adjustPrice`.
 *
 * Refused for a product with no variants: there the column *is* the sale, and
 * ending it belongs with the price, on the inventory page, where it is
 * previewed and ledgered.
 */
export async function clearIgnoredRegularPrice(productId: string): Promise<SaleActionState> {
  await requireAdmin();

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, slug: true, _count: { select: { variants: true } } },
  });
  if (!product) return { message: "That product no longer exists." };
  if (product._count.variants === 0) {
    return { message: "This product is priced on its own row — end its sale from Inventory." };
  }

  await prisma.product.update({
    where: { id: product.id },
    data: { compareAtPriceCents: null },
  });

  revalidatePath("/admin/sales");
  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${product.id}/edit`);

  return { success: `${product.name}: cleared. Its configurations are unchanged.` };
}
