import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { connectipsConfig } from "@/lib/payments/config";
import { amountMatches, isPaid, validate } from "@/lib/payments/connectips";
import { settleOrderPaid } from "@/lib/payments/settle";
import { returnOrderToCart } from "@/lib/payments/abandon";
import { paymentWasAbandoned } from "@/lib/payments/outcome";

/**
 * Where connectIPS sends the customer back to.
 *
 * The plainest of the three routes, because connectIPS's redirect carries no
 * signature and no status worth reading — just the `TXNID` and the
 * `REFERENCEID` we sent it. Everything is decided by the validation call.
 *
 * That makes the rule this whole folder follows unusually visible here: the
 * redirect is a *notification that something happened*, and the gateway's own
 * API is the only thing that says *what*. Khalti and eSewa reach the same
 * conclusion by different routes; connectIPS leaves no room to do otherwise.
 */
export async function GET(request: NextRequest) {
  const referenceId = request.nextUrl.searchParams.get("REFERENCEID")?.trim();

  const back = (orderId: string | null, query: string) =>
    NextResponse.redirect(
      appUrl(orderId ? `/orders/${orderId}?${query}` : `/orders?${query}`),
    );

  if (!referenceId) return back(null, "payment=invalid");

  // REFERENCEID is the order id — see the pay page, which sends it as such.
  const order = await prisma.order.findUnique({
    where: { id: referenceId },
    select: { id: true, totalCents: true },
  });
  if (!order) return back(null, "payment=unknown");

  const config = connectipsConfig();
  if (!config) return back(order.id, "payment=unconfigured");

  let result;
  try {
    result = await validate(config, {
      referenceId: order.id,
      amountMinorUnits: order.totalCents,
    });
  } catch (error) {
    console.error(`[connectips] validation failed for order ${order.id}`, error);
    return back(order.id, "payment=unverified");
  }

  if (!isPaid(result.status ?? "")) {
    const status = result.status ?? "unknown";
    /**
     * connectIPS has no documented cancelled status of its own, so in practice
     * this falls through to the receipt and the unpaid sweep clears the order
     * later. The check is here anyway rather than omitted: the abandon list is
     * where that decision is recorded for all three gateways, and a route that
     * silently opted out of it would be the one place the rule did not hold.
     */
    if (paymentWasAbandoned(status)) {
      const result = await returnOrderToCart(order.id, "GATEWAY");
      const query = `payment=${encodeURIComponent(status)}`;
      return result.ok
        ? NextResponse.redirect(appUrl(`/cart?${query}`))
        : back(order.id, query);
    }
    return back(order.id, `payment=${encodeURIComponent(status)}`);
  }

  /**
   * The amount is re-checked even though we asked about a specific amount.
   *
   * `validate` sends `TXNAMT` as part of the query, so a mismatch would
   * normally surface as a failed lookup rather than a successful one for the
   * wrong figure. Checked anyway: it costs nothing, and "the gateway agreed
   * with a number we supplied" is a weaker statement than it looks.
   */
  if (result.txnAmount !== undefined && !amountMatches(result.txnAmount, order.totalCents)) {
    console.error(
      `[connectips] amount mismatch on order ${order.id}: gateway says ${result.txnAmount}, order is ${order.totalCents}`,
    );
    return back(order.id, "payment=mismatch");
  }

  const settled = await settleOrderPaid({
    orderId: order.id,
    transactionId: result.referenceId ?? referenceId,
  });

  if (!settled.ok) {
    return back(
      order.id,
      settled.reason === "not-payable" ? "payment=settled-late" : "payment=unknown",
    );
  }

  return back(order.id, "payment=paid");
}
