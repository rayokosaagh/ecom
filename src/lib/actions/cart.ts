"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireUser } from "@/lib/auth/dal";
import { findCartId, getOrCreateCartId } from "@/lib/cart/identity";
import { getCart } from "@/lib/cart/service";
import { notifyAdmins, notifyUser } from "@/lib/notifications/service";
import { alertOnStockLevel } from "@/lib/inventory/alerts";
import { sendOrderEmailSafely, sendAdminOrderPlacedEmailSafely } from "@/lib/orders/email";
import { formatPrice } from "@/lib/products/format";
import { describeVariant } from "@/lib/products/variants";
import { VARIANT_SELECT, toVariantView } from "@/lib/cart/variants";
import { deliveryChargeFor, pickupAvailable } from "@/lib/checkout/fulfilment";
import { evaluateDiscount, normalizeCode } from "@/lib/discounts/service";
import { parseFulfilment } from "@/lib/checkout/validation";
import { rememberAddress } from "@/lib/actions/addresses";
import { getStoreSettings } from "@/lib/settings/service";
import {
  FulfilmentMethod,
  NotificationType,
  OrderStatus,
  PaymentMethod,
} from "@/generated/prisma/enums";
import { PAYMENT_METHODS, isPaymentMethod } from "@/lib/payments/methods";

export type CartActionState = { message?: string; success?: string };

export type CheckoutState = {
  message?: string;
  /** Field-keyed address errors, matching the shape the admin forms use. */
  errors?: Record<string, string>;
};

const MAX_QUANTITY = 99;

/**
 * What one cart line costs and how many are left, resolved once so every
 * caller agrees.
 *
 * A line pointing at a variant is priced by that variant; a line without one
 * falls back to the product, which is how every product behaved before
 * variants existed. A line whose variant has since been deleted is treated as
 * unavailable rather than silently repriced to the product — the shopper chose
 * a configuration that no longer exists, and quietly charging them the base
 * price for it would be wrong.
 */
function lineEconomics(item: {
  variantId: string;
  product: { priceCents: number; stock: number };
  variant?: { priceCents: number; stock: number } | null;
}): { priceCents: number; stock: number; missing: boolean } {
  if (!item.variantId) {
    return {
      priceCents: item.product.priceCents,
      stock: item.product.stock,
      missing: false,
    };
  }
  if (!item.variant) return { priceCents: 0, stock: 0, missing: true };
  return {
    priceCents: item.variant.priceCents,
    stock: item.variant.stock,
    missing: false,
  };
}

export async function addToCart(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const productId = String(formData.get("productId") ?? "");
  // "" means "no colour chosen" — see the note on CartItem.color.
  const color = String(formData.get("color") ?? "");
  // "" means "this product has no variants" — same reasoning as `color`.
  const variantId = String(formData.get("variantId") ?? "");
  const quantity = Math.min(
    Math.max(Number(formData.get("quantity") ?? 1) || 1, 1),
    MAX_QUANTITY,
  );

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      stock: true,
      priceCents: true,
      published: true,
      name: true,
      colors: { select: { name: true, hex: true } },
      variants: { select: VARIANT_SELECT },
    },
  });

  if (!product?.published) return { message: "That product is not available." };

  // The variant is re-read here rather than trusted from the form: the client
  // sends an id, and everything priced or counted comes from the row it names.
  // A form claiming a cheaper variant's id simply buys that variant.
  const variant = variantId
    ? (product.variants.find((v) => v.id === variantId) ?? null)
    : null;

  if (variantId && !variant) {
    return { message: "That configuration is no longer available." };
  }
  if (!variantId && product.variants.length > 0) {
    return { message: "Choose a configuration first." };
  }

  const available = variant ? variant.stock : product.stock;
  if (available < 1) {
    return {
      message: variant
        ? "That configuration is sold out."
        : "That product is sold out.",
    };
  }

  // Snapshotted so the line still describes itself after the variant is
  // renamed or removed, exactly as colorHex is.
  const variantLabel = variant ? describeVariant(toVariantView(variant)) : "";

  // Resolve the swatch from the product rather than trusting the form, then
  // snapshot it on the line so it survives later edits to the colourways.
  const colorHex = color
    ? (product.colors.find((c) => c.name === color)?.hex ?? "")
    : "";

  // Creates the cart — and, for a guest, the cookie identifying it — only
  // once there is something to put in it.
  const cartId = await getOrCreateCartId();

  const identity = {
    cartId_productId_variantId_color: { cartId, productId, variantId, color },
  };

  const existing = await prisma.cartItem.findUnique({ where: identity });

  // Never let the line quantity exceed what is actually in stock.
  const desired = (existing?.quantity ?? 0) + quantity;
  const capped = Math.min(desired, available, MAX_QUANTITY);

  await prisma.cartItem.upsert({
    where: identity,
    update: { quantity: capped, colorHex, variantLabel },
    create: {
      cartId,
      productId,
      variantId,
      variantLabel,
      color,
      colorHex,
      quantity: capped,
    },
  });

  revalidatePath("/cart");
  revalidatePath("/", "layout");

  return {
    success:
      capped < desired
        ? `Only ${available} in stock — cart updated to ${capped}.`
        : `${product.name}${variantLabel ? ` (${variantLabel})` : ""} added to your cart.`,
  };
}

export async function updateCartItem(formData: FormData): Promise<void> {
  const cartId = await findCartId();
  if (!cartId) return;

  const id = String(formData.get("id") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);

  // Matched against *this* cart, so a line id from someone else's cart —
  // guessed or leaked — simply finds nothing. This is the authorization
  // boundary for guests just as `userId` was for accounts.
  const item = await prisma.cartItem.findFirst({
    where: { id, cartId },
    include: { product: { select: { priceCents: true, stock: true } } },
  });
  if (!item) return;

  // The cap is the *variant's* stock when the line has one — the product's
  // total says nothing about how many of this configuration are left.
  const variant = item.variantId
    ? await prisma.productVariant.findUnique({
        where: { id: item.variantId },
        select: { priceCents: true, stock: true },
      })
    : null;

  const { stock } = lineEconomics({ ...item, variant });

  if (quantity < 1) {
    await prisma.cartItem.delete({ where: { id } });
  } else {
    // Floored at 1, because `stock` can be 0 — a product that sold out while
    // the line sat in the cart, or a variant that was deleted. Without the
    // floor the cap writes a quantity of 0, and a zero-quantity line is worse
    // than a sold-out one: it cannot be raised again (the cap pins it there),
    // it adds nothing to the total, and checkout's `stock < quantity` guard
    // reads 0 < 0 as false, so it rides through onto the order. Held at 1, the
    // line stays visible and that guard correctly refuses it.
    await prisma.cartItem.update({
      where: { id },
      data: { quantity: Math.max(1, Math.min(quantity, stock, MAX_QUANTITY)) },
    });
  }

  revalidatePath("/cart");
  revalidatePath("/", "layout");
}

export async function removeCartItem(formData: FormData): Promise<void> {
  const cartId = await findCartId();
  if (!cartId) return;

  const id = String(formData.get("id") ?? "");
  await prisma.cartItem.deleteMany({ where: { id, cartId } });

  revalidatePath("/cart");
  revalidatePath("/", "layout");
}

/**
 * Attach a code to the cart.
 *
 * Judged before it is stored so the shopper is told immediately, and stored
 * only if it currently applies — but storing it is not a promise. The cart
 * re-judges on every render and checkout re-judges again inside the
 * transaction, because a basket can fall below the minimum spend, and a code
 * can expire or be claimed by someone else, between now and paying.
 */
export async function applyDiscount(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const cartId = await findCartId();
  if (!cartId) return { message: "Your cart is empty." };

  const code = normalizeCode(String(formData.get("code") ?? ""));
  if (!code) return { message: "Enter a code." };

  const user = await getCurrentUser();
  const cart = await getCart(cartId, user?.id);
  if (cart.items.length === 0) return { message: "Your cart is empty." };

  // Judged against the goods total before any existing code, so replacing one
  // code with another is judged on its own merits.
  const verdict = await evaluateDiscount(code, cart.subtotalCents, user?.id);
  if (!verdict.ok) return { message: verdict.reason };

  await prisma.cart.update({ where: { id: cartId }, data: { discountCode: code } });

  revalidatePath("/cart");
  revalidatePath("/checkout");

  return { success: `${verdict.label} applied.` };
}

export async function removeDiscount(): Promise<void> {
  const cartId = await findCartId();
  if (!cartId) return;

  await prisma.cart.update({ where: { id: cartId }, data: { discountCode: null } });

  revalidatePath("/cart");
  revalidatePath("/checkout");
}

export async function clearCart(): Promise<void> {
  const cartId = await findCartId();
  if (!cartId) return;
  await prisma.cartItem.deleteMany({ where: { cartId } });
  revalidatePath("/cart");
  revalidatePath("/", "layout");
}

/**
 * Turn the cart into an order.
 *
 * Runs inside a transaction and re-reads stock at commit time, so two
 * simultaneous checkouts cannot both claim the last unit. Prices are snapshot
 * onto the order lines rather than referenced, so later edits to a product do
 * not rewrite past orders.
 */
export async function checkout(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const user = await requireUser();

  // Whether the shop has a counter at all. Read before parsing, because it
  // decides whether a form claiming collection is a valid submission or a
  // stale page from before collection was switched off.
  const settings = await getStoreSettings();

  // Validated before any stock is touched: an invalid postcode should send the
  // form back untouched, not claim units and then fail.
  const fulfilment = parseFulfilment(formData, pickupAvailable(settings));
  if (!fulfilment.ok) return { errors: fulfilment.errors };

  const paymentRaw = String(formData.get("paymentMethod") ?? "").trim();
  /**
   * Falls back to COD, which is what every order placed before this column
   * existed effectively was: the shop collected the money itself.
   *
   * Whether the *basket* qualifies for the chosen wallet is checked below, once
   * the total is known — Khalti has a floor, and no amount of validating the
   * form can decide that before the discount has been applied.
   */
  const paymentMethod =
    paymentRaw && isPaymentMethod(paymentRaw) ? paymentRaw : PaymentMethod.COD;

  /**
   * The address columns, by method.
   *
   * A collection order stores the collector's name and phone and leaves every
   * address line null — see the note on `Order`. Built here rather than inline
   * in the create so the two branches sit side by side and neither can quietly
   * acquire a field the other has.
   */
  const destination =
    fulfilment.data.method === FulfilmentMethod.DELIVERY
      ? {
          shippingName: fulfilment.data.address.name,
          shippingLine1: fulfilment.data.address.line1,
          shippingLine2: fulfilment.data.address.line2,
          shippingCity: fulfilment.data.address.city,
          shippingRegion: fulfilment.data.address.region,
          shippingPostcode: fulfilment.data.address.postcode,
          shippingCountry: fulfilment.data.address.country,
          shippingPhone: fulfilment.data.address.phone,
        }
      : {
          shippingName: fulfilment.data.contact.name,
          shippingLine1: null,
          shippingLine2: null,
          shippingCity: null,
          shippingRegion: null,
          shippingPostcode: null,
          shippingCountry: null,
          shippingPhone: fulfilment.data.contact.phone,
        };

  // Still an account-only step: an order has an owner, and the receipt has to
  // be reachable later. By this point sign-in has already claimed whatever the
  // shopper filled as a guest.
  const cart = await prisma.cart.findUnique({
    where: { userId: user.id },
    include: { items: { include: { product: true } } },
  });

  if (!cart || cart.items.length === 0) {
    return { message: "Your cart is empty." };
  }

  // Variants for every line that names one, in a single query.
  const variantIds = cart.items.map((item) => item.variantId).filter(Boolean);
  const variantRows = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, priceCents: true, stock: true, lowStockAt: true },
  });
  const variants = new Map(variantRows.map((variant) => [variant.id, variant]));

  const lines = cart.items.map((item) => {
    const variant = item.variantId ? (variants.get(item.variantId) ?? null) : null;
    return { item, ...lineEconomics({ ...item, variant }) };
  });

  const describe = (line: (typeof lines)[number]) =>
    line.item.variantLabel
      ? `${line.item.product.name} (${line.item.variantLabel})`
      : line.item.product.name;

  const unavailable = lines.filter(
    (line) =>
      !line.item.product.published || line.missing || line.stock < line.item.quantity,
  );
  if (unavailable.length > 0) {
    return {
      message: `Not enough stock for ${unavailable
        .map(describe)
        .join(", ")}. Adjust your cart and try again.`,
    };
  }

  const subtotalCents = lines.reduce(
    (sum, line) => sum + line.priceCents * line.item.quantity,
    0,
  );
  const order = await prisma.$transaction(async (tx) => {
    /**
     * Re-judge the code inside the transaction.
     *
     * This is the check that decides what is charged. The cart page's verdict
     * was true when it was rendered, but a code can expire, be switched off,
     * or have its last redemption taken by another customer in the meantime —
     * and only a check that shares a transaction with the increment below can
     * stop two simultaneous checkouts both claiming the last one.
     *
     * A code that has stopped applying does not fail the order. Silently
     * dropping money off is wrong, but so is refusing to sell someone their
     * basket because a voucher lapsed; they are charged the undiscounted
     * price, which is what the receipt will then show.
     */
    const verdict = cart.discountCode
      ? await evaluateDiscount(cart.discountCode, subtotalCents, user.id, tx)
      : null;

    const discountCents = verdict?.ok ? verdict.discountCents : 0;
    // Delivery is quoted on what the customer actually pays for goods, so a
    // code can carry a basket over the free-delivery threshold.
    const payableCents = subtotalCents - discountCents;
    // Zero for collection, whatever the basket comes to — the same function the
    // checkout summary re-totals with as the radio is clicked.
    const shippingCents = deliveryChargeFor(fulfilment.data.method, payableCents);
    const totalCents = payableCents + shippingCents;

    for (const line of lines) {
      const { item } = line;

      // Conditional update: affects 0 rows if someone else took the stock
      // first, which we detect and abort on. Stock is claimed from whichever
      // row owns it — the variant when the line has one, the product
      // otherwise — so a configurable product never decrements a total that
      // nothing is actually selling from.
      const claimed = item.variantId
        ? await tx.productVariant.updateMany({
            where: { id: item.variantId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          })
        : await tx.product.updateMany({
            where: { id: item.productId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });

      if (claimed.count === 0) {
        throw new Error(`OUT_OF_STOCK:${describe(line)}`);
      }
    }

    // Conditional on the count not having moved, so the last redemption
    // cannot be handed to two people at once. `updateMany` reporting 0 rows
    // means someone else got there first.
    let discountCodeId: string | null = null;
    if (verdict?.ok) {
      const row = await tx.discountCode.findUnique({
        where: { code: verdict.code },
        select: { id: true, redemptions: true, maxRedemptions: true },
      });

      if (row) {
        const claimed = await tx.discountCode.updateMany({
          where: { id: row.id, redemptions: row.redemptions },
          data: { redemptions: { increment: 1 } },
        });
        if (claimed.count === 0) throw new Error("DISCOUNT_TAKEN");
        discountCodeId = row.id;
      }
    }

    const created = await tx.order.create({
      data: {
        userId: user.id,
        totalCents,
        shippingCents,
        discountCodeId,
        // Snapshotted, so the receipt still adds up after the code is edited
        // or deleted.
        discountLabel: verdict?.ok ? verdict.label : null,
        discountCents,
        status: OrderStatus.PENDING,
        fulfilment: fulfilment.data.method,
        paymentMethod,
        // Copied onto the order, not referenced: editing a saved address later
        // must not rewrite where past orders were sent.
        ...destination,
        items: {
          create: lines.map((line) => ({
            productId: line.item.productId,
            name: line.item.product.name,
            // The price actually charged, which for a configured line is the
            // variant's — snapshotted so later edits cannot rewrite history.
            priceCents: line.priceCents,
            quantity: line.item.quantity,
            color: line.item.color || null,
            colorHex: line.item.colorHex || null,
            variant: line.item.variantLabel || null,
            // The id as well as the label: cancelling has to return stock to
            // the exact configuration it came from, and "16 GB / 512 GB"
            // cannot be matched back to one.
            variantId: line.item.variantId || null,
          })),
        },
      },
    });

    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    // The code goes with the emptied basket; carrying it into the next one
    // would silently re-apply a voucher nobody asked for again.
    await tx.cart.update({ where: { id: cart.id }, data: { discountCode: null } });
    return created;
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("OUT_OF_STOCK:")) {
      return { outOfStock: message.slice("OUT_OF_STOCK:".length) } as const;
    }
    if (message === "DISCOUNT_TAKEN") return { discountTaken: true } as const;
    throw error;
  });

  if ("outOfStock" in order) {
    return { message: `${order.outOfStock} sold out while you were checking out.` };
  }

  if ("discountTaken" in order) {
    return {
      message: "That code was claimed by someone else a moment ago. Try again.",
    };
  }

  /**
   * Keep the address, if the shopper asked and it was a new one.
   *
   * After the commit and inside `after`, for the same reason the email is:
   * the order exists, and the address book is a convenience that must never be
   * able to fail a sale. The checkbox only renders on the "use a different
   * address" branch — see `CheckoutForm` — so a shopper who picked a saved
   * address never lands here and nothing is duplicated.
   */
  if (
    fulfilment.data.method === FulfilmentMethod.DELIVERY &&
    formData.get("saveAddress") === "on"
  ) {
    const address = fulfilment.data.address;
    after(() => rememberAddress(user.id, address));
  }

  /**
   * The confirmation, deferred until after the response.
   *
   * The in-app notification below is not a receipt — a customer who closes the
   * tab has no record of what they just bought. This is that record.
   *
   * `after` rather than awaited: the order is already committed, so nothing
   * here may be allowed to fail it, and the redirect should not wait on a mail
   * provider.
   */
  after(() => sendOrderEmailSafely(order.id, "PLACED"));
  after(() => sendAdminOrderPlacedEmailSafely(order.id));

  // The picture for both notices below, taken from the cart that is still in
  // hand rather than read back off the order — the same photo, one query
  // cheaper. First line with one, so a basket whose opener has no photo still
  // shows something.
  const orderImage = lines.find((line) => line.item.product.image)?.item.product.image;

  // Real notifications, raised by a real event.
  await notifyUser(user.id, {
    type: NotificationType.ORDER,
    title: "Order placed",
    description: `${cart.items.length} item${
      cart.items.length === 1 ? "" : "s"
    } · ${formatPrice(order.totalCents)}`,
    // The receipt for this order, not the list — a notice about one order
    // should open that order.
    href: `/orders/${order.id}`,
    imageUrl: orderImage,
  });

  await notifyAdmins({
    type: NotificationType.ORDER,
    title: "New order received",
    description: `${user.name ?? user.email} spent ${formatPrice(order.totalCents)}`,
    href: `/admin/orders/${order.id}`,
    imageUrl: orderImage,
  });

  // Warn admins about anything this order took into Low or Out, counting down
  // from whichever row the units came from. The helper decides whether a line
  // crossed anything and says nothing otherwise; see lib/inventory/alerts.
  // After the response, since the customer's receipt should not wait on it.
  after(async () => {
    for (const line of lines) {
      await alertOnStockLevel({
        productId: line.item.productId,
        variantId: line.item.variantId ?? null,
        before: line.stock,
        after: line.stock - line.item.quantity,
        threshold: line.item.variantId
          ? (variants.get(line.item.variantId)?.lowStockAt ?? null)
          : line.item.product.lowStockAt,
      });
    }
  });

  revalidatePath("/cart");
  revalidatePath("/", "layout");

  /**
   * Where the customer goes next.
   *
   * A wallet order is placed *before* it is paid — PENDING, with its stock
   * already claimed — and only then sent to the gateway. Creating the order
   * first is what gives the callback something to find and settle, and what
   * stops two shoppers being sent off to pay for the same last unit.
   *
   * The cost is that an abandoned wallet payment leaves a PENDING order holding
   * stock, which is the same state an abandoned COD order leaves and is
   * resolved the same way: the customer or an admin cancels it, and cancelling
   * puts the units back.
   */
  if (PAYMENT_METHODS[paymentMethod].redirects) {
    redirect(`/checkout/pay/${order.id}`);
  }

  // The receipt, not the list: a confirmation should show what was bought.
  redirect(`/orders/${order.id}?placed=1`);
}
