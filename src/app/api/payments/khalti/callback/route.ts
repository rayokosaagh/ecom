import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { khaltiConfig } from "@/lib/payments/config";
import { amountMatches, isPaid, lookup } from "@/lib/payments/khalti";
import { settleOrderPaid } from "@/lib/payments/settle";
import { returnOrderToCart } from "@/lib/payments/abandon";
import { paymentWasAbandoned } from "@/lib/payments/outcome";

/**
 * Where Khalti sends the customer back to.
 *
 * The query string it arrives with — `status=Completed`, an amount, a
 * transaction id — is **not evidence**. It is a URL in somebody's browser, and
 * anyone who has seen one can type another. The only thing taken from it is the
 * `pidx`, which is a lookup key; everything that decides whether the order is
 * paid comes from the server-to-server `lookup` below.
 *
 * Three things are checked before an order is settled, and all three matter:
 *
 *  1. **We started this payment.** The `pidx` must match an order we recorded
 *     one against. A `pidx` from somebody else's shop finds nothing.
 *  2. **Khalti says it completed.** Not the redirect — the lookup.
 *  3. **The amount is the one we asked for.** A payment can be completed for
 *     the wrong figure if the initiate call was ever tampered with, and an
 *     order settled for less than it costs is a loss nobody notices.
 *
 * A GET that changes state is unusual and is forced by the redirect: the
 * customer arrives by navigation, so there is no other verb available. The
 * write it performs is idempotent — see `settleOrderPaid`.
 */
export async function GET(request: NextRequest) {
  const pidx = request.nextUrl.searchParams.get("pidx")?.trim();

  const back = (orderId: string | null, query: string) =>
    NextResponse.redirect(
      appUrl(orderId ? `/orders/${orderId}?${query}` : `/orders?${query}`),
    );

  /** See the note on the eSewa route: a final failure unwinds and goes to /cart. */
  const abandon = async (orderId: string, code: string) => {
    const result = await returnOrderToCart(orderId, "GATEWAY");
    const query = `payment=${encodeURIComponent(code)}`;
    return result.ok
      ? NextResponse.redirect(appUrl(`/cart?${query}`))
      : back(orderId, query);
  };

  if (!pidx) return back(null, "payment=invalid");

  const order = await prisma.order.findUnique({
    where: { paymentRef: pidx },
    select: { id: true, totalCents: true },
  });
  if (!order) return back(null, "payment=unknown");

  const config = khaltiConfig();
  if (!config) return back(order.id, "payment=unconfigured");

  let result;
  try {
    result = await lookup(config, pidx);
  } catch (error) {
    // Logged next to the order it belongs to. The customer is sent to their
    // receipt rather than shown a stack trace — the payment may well have
    // succeeded, and the order page is where they can see whether it did.
    console.error(`[khalti] lookup failed for order ${order.id}`, error);
    return back(order.id, "payment=unverified");
  }

  if (!isPaid(result.status)) {
    // "User canceled" and "Expired" are Khalti's finals — see `isFinalFailure`.
    // "Pending" and "Initiated" are not, and keep the order while they settle.
    if (paymentWasAbandoned(result.status)) return abandon(order.id, result.status);
    return back(order.id, `payment=${encodeURIComponent(result.status)}`);
  }

  if (!amountMatches(result.total_amount, order.totalCents)) {
    // Deliberately not settled. Khalti believes it took a different figure from
    // the one this order costs, and guessing which is right is not something a
    // callback handler should do on its own.
    console.error(
      `[khalti] amount mismatch on order ${order.id}: khalti says ${result.total_amount}, order is ${order.totalCents}`,
    );
    return back(order.id, "payment=mismatch");
  }

  const settled = await settleOrderPaid({
    orderId: order.id,
    transactionId: result.transaction_id ?? null,
  });

  if (!settled.ok) {
    return back(
      order.id,
      settled.reason === "not-payable" ? "payment=settled-late" : "payment=unknown",
    );
  }

  return back(order.id, "payment=paid");
}
