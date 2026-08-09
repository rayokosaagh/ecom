import "server-only";

import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { sendEmail } from "@/lib/email/send";
import { renderOrderEmail, type OrderEmailKind } from "@/lib/orders/email-template";
import { getStoreSettings } from "@/lib/settings/service";
import { FulfilmentMethod } from "@/generated/prisma/enums";

/**
 * Sending order mail.
 *
 * What it says lives in `./email-template`, which is pure; this is the part
 * that reads the order and hands it to the transport.
 *
 * Every caller should invoke this inside `after()`. Two reasons, and the second
 * is the important one: the customer is not left watching a spinner while a
 * mail provider takes its time, and a provider having a bad day can never fail
 * a checkout that has already claimed stock and taken a discount redemption.
 * An order that exists but whose confirmation did not send is a bad afternoon;
 * an order that failed to place because of a mail server is a broken shop.
 */
export async function sendOrderEmail(
  orderId: string,
  kind: OrderEmailKind,
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      shippingCents: true,
      discountCents: true,
      discountLabel: true,
      totalCents: true,
      shippingName: true,
      shippingLine1: true,
      shippingLine2: true,
      shippingCity: true,
      shippingRegion: true,
      shippingPostcode: true,
      shippingCountry: true,
      fulfilment: true,
      user: { select: { email: true } },
      items: {
        select: {
          name: true,
          variant: true,
          color: true,
          quantity: true,
          priceCents: true,
        },
      },
    },
  });

  // Deleted between the action and this running. Nothing to say and nobody to
  // say it to.
  if (!order?.user?.email) return;

  /**
   * Where to collect from, read at send time rather than snapshotted.
   *
   * Unlike the money and the delivery address, this is not a fact about the
   * order — it is the shop's own address, and if it has moved since the order
   * was placed then the new one is the one the customer needs to walk to.
   * Read only for a collection; a delivery has no use for it.
   */
  const settings =
    order.fulfilment === FulfilmentMethod.PICKUP ? await getStoreSettings() : null;

  const { subject, text, html } = renderOrderEmail({
    ...order,
    kind,
    lines: order.items,
    pickupAddress: settings?.pickupAddress ?? null,
    pickupHours: settings?.pickupHours ?? null,
    // Absolute, and built from configuration rather than the request's Host
    // header — see `lib/app-url` for why that distinction matters in mail.
    receiptUrl: appUrl(`/orders/${order.id}`),
  });

  await sendEmail({ to: order.user.email, subject, text, html });
}

/**
 * Send without letting a failure escape.
 *
 * The callers are `after()` callbacks, where a rejection is an unhandled one:
 * it would surface as a server error long after the response, attached to
 * nothing a reader can trace back. Logged here instead, next to the order id
 * that produced it.
 */
export async function sendOrderEmailSafely(
  orderId: string,
  kind: OrderEmailKind,
): Promise<void> {
  try {
    await sendOrderEmail(orderId, kind);
  } catch (error) {
    console.error(`[order-email] could not send ${kind} for ${orderId}`, error);
  }
}
