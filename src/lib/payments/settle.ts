import "server-only";

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/generated/prisma/enums";
import { notifyUser } from "@/lib/notifications/service";
import { sendOrderEmailSafely } from "@/lib/orders/email";
import { orderReference } from "@/lib/orders/reference";
import { orderThumbnail } from "@/lib/orders/service";

/**
 * Marking an order paid, once and only once.
 *
 * Both gateways funnel through here, and the reason is idempotency rather than
 * tidiness. A callback arrives in the customer's browser, which means it can
 * arrive twice — a refresh, a back button, a link forwarded to a friend — and
 * the second arrival must not send a second confirmation email or fire a second
 * notification.
 *
 * The guard is the conditional update: `status` must still be `PENDING` for the
 * write to land. Postgres decides that, not this process, so two callbacks
 * racing on two connections cannot both win. `count === 0` means somebody got
 * there first, which is a success from the customer's point of view — the order
 * is paid — and is reported as `alreadyPaid` rather than as an error.
 *
 * What this deliberately does **not** do is decide whether payment happened.
 * Each callback route establishes that with the gateway first and calls this
 * only once it has an answer it trusts.
 */
export type SettleResult =
  | { ok: true; alreadyPaid: boolean }
  | { ok: false; reason: "missing" }
  /**
   * The gateway says paid; the order is not payable any more.
   *
   * Its own outcome rather than a flavour of "unknown", because it is the one
   * failure here where money has probably moved. It became reachable when
   * unpaid orders started being swept — a payment that completes after the
   * sweep has cancelled its order lands exactly here — and reporting it as
   * success would tell a customer their cancelled order was confirmed.
   */
  | { ok: false; reason: "not-payable"; status: OrderStatus };

export async function settleOrderPaid(input: {
  orderId: string;
  /** The gateway's own transaction id, for reconciliation. */
  transactionId: string | null;
}): Promise<SettleResult> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, userId: true, status: true, totalCents: true },
  });
  if (!order) return { ok: false, reason: "missing" };

  const claimed = await prisma.order.updateMany({
    // Only from PENDING. A cancelled order that a late callback tries to settle
    // stays cancelled — the stock has already gone back, and quietly reviving
    // it would sell units the shop has since promised to somebody else.
    where: { id: order.id, status: OrderStatus.PENDING },
    data: {
      status: OrderStatus.PAID,
      // Written in the same statement as the status, so a paid order always
      // says when — see the note on `Order.paidAt`.
      paidAt: new Date(),
      paymentTxnId: input.transactionId,
    },
  });

  if (claimed.count === 0) {
    const fresh = await prisma.order.findUnique({
      where: { id: order.id },
      select: { status: true },
    });
    // Already PAID is the ordinary double-callback: a refresh, a back button, a
    // forwarded link. Nothing to do, and nothing wrong.
    if (fresh?.status === OrderStatus.PAID) return { ok: true, alreadyPaid: true };

    // Anything else — cancelled by the customer, by an admin, or by the unpaid
    // sweep — is not this function's to override. Reviving it would sell units
    // the shop has already put back on the shelf. Logged loudly because the
    // caller has just been told by a gateway that money moved.
    console.error(
      `[payments] order ${order.id} settled while ${fresh?.status ?? "missing"} — not marked paid`,
    );
    return {
      ok: false,
      reason: "not-payable",
      status: fresh?.status ?? OrderStatus.CANCELLED,
    };
  }

  const reference = orderReference(order.id);

  await notifyUser(order.userId, {
    type: "ORDER",
    title: `Payment received for ${reference}`,
    description: "Thank you — your order is confirmed and being prepared.",
    href: `/orders/${order.id}`,
    imageUrl: await orderThumbnail(order.id),
  });

  // After the response, like the rest of the order mail: a customer waiting on
  // a redirect back from a wallet should not also be waiting on an SMTP round
  // trip, and a mail failure must not turn a completed payment into an error.
  after(() => sendOrderEmailSafely(order.id, "PAID"));

  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${order.id}`);
  revalidatePath("/dashboard");

  return { ok: true, alreadyPaid: false };
}
