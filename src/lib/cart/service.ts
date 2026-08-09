import "server-only";

import { prisma } from "@/lib/prisma";
import { evaluateDiscount, type DiscountVerdict } from "@/lib/discounts/service";

/**
 * Cart contents plus derived totals, for the cart page and the nav badge.
 *
 * Lines are priced by their variant when they have one and by the product
 * otherwise, which is the same rule `lib/actions/cart` applies at checkout —
 * the two must agree or a shopper sees one total and is charged another.
 */
export async function getCart(cartId: string | null, userId?: string) {
  // Keyed by cart rather than by user: the same page serves a guest whose
  // cart is identified by a cookie and an account whose cart is identified by
  // its owner. Resolving that distinction is `lib/cart/identity`'s job.
  const cart = cartId
    ? await prisma.cart.findUnique({
        where: { id: cartId },
        include: {
          items: {
            orderBy: { createdAt: "asc" },
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  image: true,
                  priceCents: true,
                  stock: true,
                  published: true,
                },
              },
            },
          },
        },
      })
    : null;

  const rows = cart?.items ?? [];

  // One query for every variant referenced, rather than a join per line.
  const variantIds = rows.map((item) => item.variantId).filter(Boolean);
  const variants =
    variantIds.length > 0
      ? await prisma.productVariant.findMany({
          where: { id: { in: variantIds } },
          select: { id: true, priceCents: true, stock: true, image: true },
        })
      : [];
  const byId = new Map(variants.map((variant) => [variant.id, variant]));

  const items = rows.map((item) => {
    const variant = item.variantId ? (byId.get(item.variantId) ?? null) : null;

    // A line whose variant has since been deleted is shown as unavailable
    // rather than silently repriced to the product: the shopper chose a
    // configuration that no longer exists, and charging them the base price
    // for it would be the wrong resolution.
    const missing = Boolean(item.variantId) && !variant;

    return {
      ...item,
      /** What this line costs each, from whichever row owns the price. */
      unitPriceCents: variant?.priceCents ?? (missing ? 0 : item.product.priceCents),
      /** Units available for this exact line. */
      availableStock: variant?.stock ?? (missing ? 0 : item.product.stock),
      image: variant?.image ?? item.product.image,
      unavailable: missing || !item.product.published,
    };
  });

  const subtotalCents = items.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );
  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  /**
   * The stored code, re-judged against this basket every time.
   *
   * Never trusted from the row: the basket changes underneath a code all the
   * time — removing an item can drop the subtotal below the minimum spend —
   * so the only honest answer is the one computed now. A code that has stopped
   * applying comes back as a verdict with a reason rather than silently
   * vanishing, so the cart can say what happened.
   */
  const discount: DiscountVerdict | null = cart?.discountCode
    ? await evaluateDiscount(cart.discountCode, subtotalCents, userId)
    : null;

  const discountCents = discount?.ok ? discount.discountCents : 0;

  return {
    items,
    subtotalCents,
    count,
    discount,
    discountCents,
    /** Goods after the code, which is what delivery and the total build on. */
    payableCents: subtotalCents - discountCents,
  };
}

/** Just the badge number — avoids loading every line for a header render. */
export async function getCartCount(cartId: string | null): Promise<number> {
  if (!cartId) return 0;
  const result = await prisma.cartItem.aggregate({
    where: { cartId },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}
