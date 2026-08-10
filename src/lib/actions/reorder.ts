"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/dal";
import { getOrCreateCartId } from "@/lib/cart/identity";
import { VARIANT_SELECT, toVariantView } from "@/lib/cart/variants";
import { describeVariant } from "@/lib/products/variants";

export type ReorderState = { message?: string; success?: string };

/** Matches the ceiling `addToCart` puts on a single line. */
const MAX_QUANTITY = 99;

/**
 * Put a past order back in the basket.
 *
 * The important thing this is *not*: a replay of the old order. An order line
 * is a snapshot — the name and the price it was sold at — and none of that is
 * carried over. What is reused is only which product, which variant and which
 * colour; everything priced or counted is read fresh from the catalogue, so a
 * product that has gone up in price is added at today's price and one that has
 * sold out is not added at all.
 *
 * Nothing is removed from the basket either. "Buy again" adds to what is
 * already there, in the same way pressing Add to cart twice does, and quantities
 * are capped at what is actually in stock.
 *
 * Lines that cannot come back are reported rather than skipped silently: a
 * shopper who reorders four things and gets three has to be told which one is
 * missing, or they will find out at the till.
 */
export async function reorder(
  _prev: ReorderState,
  formData: FormData,
): Promise<ReorderState> {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") ?? "");

  // Scoped by userId, so an id from somebody else's receipt reads as no order
  // at all rather than filling this basket from theirs.
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: user.id },
    select: {
      items: {
        select: { productId: true, variantId: true, color: true, quantity: true, name: true },
      },
    },
  });

  if (!order) return { message: "That order could not be found." };
  if (order.items.length === 0) return { message: "That order has nothing to reorder." };

  // Every product on the order in one query, rather than one per line.
  const productIds = order.items.map((item) => item.productId).filter(Boolean) as string[];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      stock: true,
      published: true,
      colors: { select: { name: true, hex: true } },
      variants: { select: VARIANT_SELECT },
    },
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  const cartId = await getOrCreateCartId();
  const unavailable: string[] = [];
  let added = 0;

  for (const item of order.items) {
    // The product row was deleted; the line survives on the order, but there
    // is nothing left to buy.
    const product = item.productId ? byId.get(item.productId) : undefined;
    if (!product?.published) {
      unavailable.push(item.name);
      continue;
    }

    // A variant the product no longer has is not silently downgraded to the
    // base product — that would put a different thing in the basket from the
    // one the button offered.
    const variant = item.variantId
      ? (product.variants.find((v) => v.id === item.variantId) ?? null)
      : null;
    if (item.variantId && !variant) {
      unavailable.push(item.name);
      continue;
    }

    const available = variant ? variant.stock : product.stock;
    if (available < 1) {
      unavailable.push(item.name);
      continue;
    }

    // Re-derived from the variant as it reads today, not copied from the
    // order's snapshot: the snapshot says how the configuration was described
    // when it sold, and `getCart` renders whatever label the line carries — so
    // reusing a stale one would make the same variant read differently
    // depending on which button put it in the basket.
    const variantLabel = variant ? describeVariant(toVariantView(variant)) : "";

    const color = item.color ?? "";
    // Re-resolved from the product rather than reused from the snapshot, so a
    // recoloured product does not carry an old swatch into the new basket.
    const colorHex = color
      ? (product.colors.find((c) => c.name === color)?.hex ?? "")
      : "";

    const identity = {
      cartId_productId_variantId_color: {
        cartId,
        productId: product.id,
        variantId: item.variantId ?? "",
        color,
      },
    };

    const existing = await prisma.cartItem.findUnique({ where: identity });
    const capped = Math.min(
      (existing?.quantity ?? 0) + item.quantity,
      available,
      MAX_QUANTITY,
    );

    await prisma.cartItem.upsert({
      where: identity,
      update: { quantity: capped, colorHex, variantLabel },
      create: {
        cartId,
        productId: product.id,
        variantId: item.variantId ?? "",
        variantLabel,
        color,
        colorHex,
        quantity: capped,
      },
    });

    added += 1;
  }

  revalidatePath("/cart");
  revalidatePath("/", "layout");

  if (added === 0) {
    return { message: "Nothing from that order is available to buy right now." };
  }

  return {
    success:
      unavailable.length > 0
        ? `Added ${added} item${added === 1 ? "" : "s"} to your cart. Not available: ${unavailable.join(", ")}.`
        : `Added ${added} item${added === 1 ? "" : "s"} back to your cart.`,
  };
}
