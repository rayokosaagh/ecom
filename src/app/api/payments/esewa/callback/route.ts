import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { esewaConfig } from "@/lib/payments/config";
import {
  ESEWA_COMPLETE,
  amountMatches,
  formatAmount,
  orderIdFromTransactionUuid,
  readCallback,
} from "@/lib/payments/esewa";
import { settleOrderPaid } from "@/lib/payments/settle";
import { returnOrderToCart } from "@/lib/payments/abandon";
import { paymentWasAbandoned } from "@/lib/payments/outcome";

/**
 * Where eSewa sends the customer back to.
 *
 * eSewa returns a base64 `data` blob carrying its own HMAC, which makes this
 * the mirror image of the Khalti route: the redirect here *is* signed, so it
 * can be authenticated locally, and it is — `readCallback` re-derives the
 * signature with the merchant secret before anything is read out of it.
 *
 * The status API is then called anyway, and that is the point worth explaining
 * rather than the signature. A valid signature proves eSewa produced this blob;
 * it does not prove the blob is fresh. The same redirect URL replayed a week
 * later still verifies. So the signature decides whether to *listen*, and the
 * status call decides what is *true now* — the same division as Khalti, reached
 * from the other direction.
 *
 * Both are cheap, and skipping either has a failure mode that only shows up in
 * the ledger.
 */
export async function GET(request: NextRequest) {
  const data = request.nextUrl.searchParams.get("data")?.trim();

  const back = (orderId: string | null, query: string) =>
    NextResponse.redirect(
      appUrl(orderId ? `/orders/${orderId}?${query}` : `/orders?${query}`),
    );

  /**
   * A payment that will never complete: unwind the order and send the shopper
   * to their basket, which now holds what they were trying to buy.
   *
   * The cart rather than the receipt, because after this there is nothing on the
   * receipt to act on — the order is cancelled and the next step is to check out
   * again. If the unwind loses the race with a settling payment the order is
   * still live, so the receipt is where they belong after all.
   */
  const abandon = async (orderId: string, code: string) => {
    const result = await returnOrderToCart(orderId, "GATEWAY");
    const query = `payment=${encodeURIComponent(code)}`;
    return result.ok
      ? NextResponse.redirect(appUrl(`/cart?${query}`))
      : back(orderId, query);
  };

  const config = esewaConfig();
  if (!config) return back(null, "payment=unconfigured");

  // The failure_url is this same route without a `data` blob — eSewa sends the
  // customer here when they abandon or the payment fails.
  if (!data) {
    const abandoned = request.nextUrl.searchParams.get("order")?.trim();
    // No order on the failure URL means nothing to unwind — eSewa dropped the
    // parameter, and guessing which order this was is not something to do on a
    // request that cancels one. The sweep clears it within the window instead.
    if (!abandoned) return back(null, "payment=cancelled");
    return abandon(abandoned, "cancelled");
  }

  const callback = readCallback(data, config.secret);
  // Null covers both a malformed blob and a signature that does not verify.
  // They are the same thing to us: not something eSewa said.
  if (!callback) return back(null, "payment=invalid");

  /**
   * Found by the order the transaction id names, not by an exact match on the
   * stored reference.
   *
   * Opening the payment page twice mints a second transaction id and overwrites
   * the first. Requiring an exact match would then strand a customer who
   * completed the payment in the older tab: money taken, order still pending,
   * nothing to reconcile it against. See `orderIdFromTransactionUuid`.
   */
  const order = await prisma.order.findUnique({
    where: { id: orderIdFromTransactionUuid(callback.transaction_uuid) },
    select: { id: true, totalCents: true },
  });
  if (!order) return back(null, "payment=unknown");

  if (callback.status !== ESEWA_COMPLETE) {
    if (paymentWasAbandoned(callback.status)) return abandon(order.id, callback.status);
    return back(order.id, `payment=${encodeURIComponent(callback.status)}`);
  }

  if (!amountMatches(callback.total_amount, order.totalCents)) {
    console.error(
      `[esewa] amount mismatch on order ${order.id}: esewa says ${callback.total_amount}, order is ${order.totalCents}`,
    );
    return back(order.id, "payment=mismatch");
  }

  /**
   * Confirm with eSewa directly before settling.
   *
   * This is what makes a replayed redirect harmless: the blob verifies, but the
   * status API is asked about *this* transaction now, and a refunded or
   * cancelled one answers accordingly.
   */
  let status: string;
  let transactionCode: string | null = null;
  try {
    const url = new URL(config.statusUrl);
    url.searchParams.set("product_code", config.productCode);
    url.searchParams.set("total_amount", formatAmount(order.totalCents));
    url.searchParams.set("transaction_uuid", callback.transaction_uuid);

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`status ${response.status}`);

    const body = (await response.json()) as {
      status?: string;
      ref_id?: string;
      transaction_code?: string;
    };
    status = String(body.status ?? "");
    transactionCode = body.ref_id ?? body.transaction_code ?? null;
  } catch (error) {
    console.error(`[esewa] status check failed for order ${order.id}`, error);
    return back(order.id, "payment=unverified");
  }

  if (status !== ESEWA_COMPLETE) {
    if (paymentWasAbandoned(status)) return abandon(order.id, status);
    return back(order.id, `payment=${encodeURIComponent(status)}`);
  }

  const settled = await settleOrderPaid({
    orderId: order.id,
    // eSewa's own reference, preferred over the one in the redirect: it comes
    // from the call we just made rather than from a URL.
    transactionId: transactionCode ?? callback.transaction_code ?? null,
  });

  if (!settled.ok) {
    return back(
      order.id,
      settled.reason === "not-payable" ? "payment=settled-late" : "payment=unknown",
    );
  }

  return back(order.id, "payment=paid");
}
