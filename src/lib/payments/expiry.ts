import "server-only";

import { prisma } from "@/lib/prisma";
import { OrderStatus, PaymentMethod } from "@/generated/prisma/enums";
import { PAYMENT_METHODS } from "@/lib/payments/methods";
import { returnOrderToCart } from "@/lib/payments/abandon";

/**
 * Letting go of stock nobody paid for.
 *
 * The callback covers the shopper who comes back. This covers the one who does
 * not: the tab closed at the wallet, the phone that ran out of battery, the
 * payment page opened and forgotten. Their order sits PENDING holding units the
 * shop could be selling, and nothing else in the system will ever move it.
 *
 * Swept lazily on page render rather than by a cron, which this project does not
 * have — the same shape as `reconcileFlashSales`, and for the same reason: the
 * work is idempotent, cheap when there is nothing to do, and only actually
 * matters on the pages that read stock. A shop with no abandoned orders pays one
 * indexed query that returns no rows.
 */

/**
 * How long an unpaid wallet order may hold its stock.
 *
 * Thirty minutes is longer than either wallet's own session and long enough for
 * a bank app, an OTP and a retry, which is what the window has to survive. It
 * runs from `Order.updatedAt` — the last time the shopper was handed to a
 * gateway — not from when the order was created, so reopening the payment page
 * starts the clock again rather than continuing an old one.
 */
export const UNPAID_ORDER_TIMEOUT_MINUTES = 30;

/** The methods that hand the shopper to somebody else and wait to hear back. */
const REDIRECTING_METHODS = (Object.keys(PAYMENT_METHODS) as PaymentMethod[]).filter(
  (method) => PAYMENT_METHODS[method].redirects,
);

/**
 * Cancel every unpaid wallet order past the window, returning its stock and its
 * lines to the basket it came from.
 *
 * `now` is a parameter rather than read inside, so a test can put the clock
 * where it needs it.
 *
 * Orders are unwound one at a time rather than in one `updateMany`: each needs
 * its own transaction to restock and refill under the same PENDING guard, and a
 * single order that cannot be unwound — a deleted product, a payment settling
 * in the same instant — must not take the rest of the sweep down with it.
 */
export async function releaseAbandonedOrders(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - UNPAID_ORDER_TIMEOUT_MINUTES * 60_000);

  const stale = await prisma.order.findMany({
    where: {
      status: OrderStatus.PENDING,
      updatedAt: { lt: cutoff },
      paymentMethod: { in: REDIRECTING_METHODS },
    },
    orderBy: { updatedAt: "asc" },
    select: { id: true },
    // A bound, so one very neglected shop cannot turn a page render into a
    // hundred transactions. The rest are swept by the next request.
    take: 20,
  });

  let released = 0;
  for (const order of stale) {
    try {
      const result = await returnOrderToCart(order.id, "TIMEOUT");
      if (result.ok) released += 1;
    } catch (error) {
      // Logged and stepped over. This runs inside somebody's page render, and
      // failing to tidy up an old order is not a reason to fail their request.
      console.error(`[payments] could not release abandoned order ${order.id}`, error);
    }
  }

  return released;
}
