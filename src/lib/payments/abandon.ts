import "server-only";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { OrderCancelReason, OrderStatus } from "@/generated/prisma/enums";
import { PAYMENT_METHODS } from "@/lib/payments/methods";
import { notifyUser } from "@/lib/notifications/service";
import { orderReference } from "@/lib/orders/reference";

/**
 * Undoing a wallet order that was never paid for.
 *
 * A wallet order is placed *before* it is paid: PENDING, holding its stock, with
 * the basket already emptied — that is what gives the callback something to
 * settle and stops two shoppers being sent off to pay for the same last unit.
 * The cost is the state this function exists to clear up. Until it did, pressing
 * Cancel at the gateway left the shopper looking at an empty basket with their
 * things nowhere they would think to look, and left the shop holding stock for
 * an order nobody was going to pay for.
 *
 * Unwinding it is one transaction and all four parts belong in it:
 *
 *  1. the order moves to CANCELLED, conditionally on it still being PENDING;
 *  2. the units go back to whichever row they were claimed from;
 *  3. the lines go back in the basket;
 *  4. the discount code goes back on the basket with them.
 *
 * The guard on (1) is what makes the rest safe. A payment that settles at the
 * same moment takes the order out of PENDING first, this update matches nothing,
 * and the transaction rolls back having neither restocked nor refilled — the
 * shopper keeps the order they just paid for. `settleOrderPaid` holds the same
 * line from the other side: it only ever moves PENDING → PAID, so whoever gets
 * there second finds nothing to do.
 */

/** Why the order is being unwound. Decides only whether the customer is told. */
export type AbandonCause =
  /** They pressed Cancel at the gateway, or it reported a final failure. */
  | "GATEWAY"
  /** Nobody paid within the window — see `releaseAbandonedOrders`. */
  | "TIMEOUT";

export type AbandonResult =
  | { ok: true; restored: number; unavailable: number }
  | { ok: false; reason: "missing" | "not-pending" | "not-a-wallet-order" };

export async function returnOrderToCart(
  orderId: string,
  cause: AbandonCause,
): Promise<AbandonResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      status: true,
      paymentMethod: true,
      discountCodeId: true,
      items: {
        select: {
          productId: true,
          variantId: true,
          quantity: true,
          color: true,
          colorHex: true,
          variant: true,
        },
      },
    },
  });

  if (!order) return { ok: false, reason: "missing" };
  if (order.status !== OrderStatus.PENDING) return { ok: false, reason: "not-pending" };
  // Cash on delivery is not waiting on anything, so there is nothing to abandon:
  // an unpaid COD order is simply an order. Refusing here rather than trusting
  // callers keeps a future one from quietly emptying a customer's real order
  // into their basket.
  if (!PAYMENT_METHODS[order.paymentMethod].redirects) {
    return { ok: false, reason: "not-a-wallet-order" };
  }

  /**
   * Which of the ordered products still exist.
   *
   * A line whose product has been deleted since has nothing to put back — the
   * cart row is a foreign key, so writing it would fail the whole transaction
   * and strand an order that could otherwise have been unwound. Those lines are
   * counted and reported rather than dropped silently.
   */
  const orderedIds = [...new Set(order.items.map((item) => item.productId).filter(Boolean))];
  const living = await prisma.product.findMany({
    where: { id: { in: orderedIds as string[] } },
    select: { id: true },
  });
  const livingIds = new Set(living.map((product) => product.id));

  const restorable = order.items.filter(
    (item) => item.productId !== null && livingIds.has(item.productId),
  );

  const outcome = await prisma
    .$transaction(async (tx) => {
      // Conditional on the order still being PENDING — see the note above.
      const cancelled = await tx.order.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING },
        data: {
          status: OrderStatus.CANCELLED,
          // No note: the schema keeps `cancelNote` for OTHER, and this reason
          // says the whole thing on its own.
          cancelReason: OrderCancelReason.PAYMENT_FAILED,
        },
      });
      if (cancelled.count === 0) throw new Error("RACED");

      // Back to whichever row the units were claimed from. Checkout takes them
      // from the variant when the line has one and from the product otherwise,
      // so this has to mirror that exactly — the same reasoning as `moveStatus`
      // in lib/actions/orders.
      for (const item of order.items) {
        if (item.variantId) {
          await tx.productVariant.updateMany({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        } else if (item.productId) {
          await tx.product.updateMany({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      // The order's owner's basket, which is not necessarily the one whose
      // cookie is on this request — the sweep runs with no customer present at
      // all. Created if the row has since been pruned.
      const cart =
        (await tx.cart.findUnique({ where: { userId: order.userId }, select: { id: true } })) ??
        (await tx.cart.create({ data: { userId: order.userId }, select: { id: true } }));

      /**
       * Lines the basket does not already hold.
       *
       * `skipDuplicates` against the `[cartId, productId, variantId, color]`
       * unique, rather than incrementing what is there. A shopper who gave up at
       * the gateway and added the same thing again by hand means to buy it once;
       * summing the two would put two in the basket and read as a bug of its
       * own. Restoring what is missing and leaving what is present is the only
       * rule that is never wrong in the expensive direction.
       */
      const added = await tx.cartItem.createMany({
        data: restorable.map((item) => ({
          cartId: cart.id,
          productId: item.productId!,
          quantity: item.quantity,
          color: item.color ?? "",
          colorHex: item.colorHex ?? "",
          // The cart's columns are empty strings rather than nulls — see the
          // note on CartItem.variantId.
          variantId: item.variantId ?? "",
          variantLabel: item.variant ?? "",
        })),
        skipDuplicates: true,
      });

      /**
       * The voucher goes back too.
       *
       * Checkout takes the code off the basket when it turns into an order, so
       * an unwound order that did not restore it would quietly cost the shopper
       * their discount. The redemption it already counted is deliberately not
       * given back: cancelling anywhere else in this codebase does not, and
       * `evaluateDiscount` re-checks every limit at the next checkout anyway —
       * a code that has since run out simply stops applying rather than failing
       * the order.
       */
      if (order.discountCodeId) {
        const code = await tx.discountCode.findUnique({
          where: { id: order.discountCodeId },
          select: { code: true },
        });
        // Never over a code the shopper has typed since: that one is their
        // current intent, and this is a restoration.
        if (code) {
          await tx.cart.updateMany({
            where: { id: cart.id, discountCode: null },
            data: { discountCode: code.code },
          });
        }
      }

      return added.count;
    })
    .catch((error: unknown) => {
      if (error instanceof Error && error.message === "RACED") return "RACED" as const;
      throw error;
    });

  // Someone settled or cancelled it first. Nothing was written.
  if (outcome === "RACED") return { ok: false, reason: "not-pending" };

  /**
   * Only the swept ones are announced.
   *
   * A shopper who cancelled at the gateway is looking at the banner that says
   * so; telling them again in the bell is noise. A shopper whose order timed out
   * has been gone for half an hour and has no other way to find out that the
   * order they left behind is no longer holding anything for them.
   */
  if (cause === "TIMEOUT") {
    await notifyUser(order.userId, {
      type: "ORDER",
      title: `Order ${orderReference(order.id)} expired`,
      description:
        outcome > 0
          ? "It was not paid in time, so nothing has been charged and the items are back in your basket."
          : "It was not paid in time, so nothing has been charged.",
      href: "/cart",
    });
  }

  revalidateAbandonViews(order.id);

  return { ok: true, restored: outcome, unavailable: order.items.length - restorable.length };
}

/** Everything that changes when an order is unwound: a basket, an order, stock. */
function revalidateAbandonViews(orderId: string) {
  revalidatePath("/cart");
  revalidatePath("/checkout");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/inventory");
  revalidatePath("/dashboard");
  // The units are back, so anything that renders "out of stock" is now wrong.
  revalidatePath("/products", "layout");
  // The bell and the cart count live in the layout.
  revalidatePath("/", "layout");
}
