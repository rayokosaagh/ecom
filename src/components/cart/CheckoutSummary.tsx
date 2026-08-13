"use client";

import { FulfilmentMethod } from "@/generated/prisma/enums";
import { formatPrice } from "@/lib/products/format";
import { deliveryChargeFor, fulfilmentLabels } from "@/lib/checkout/fulfilment";
import { remainingForFreeShipping } from "@/lib/checkout/shipping";

export interface SummaryLine {
  id: string;
  name: string;
  variantLabel: string | null;
  color: string | null;
  quantity: number;
  unitPriceCents: number;
}

/**
 * The order summary, re-totalled as the fulfilment choice changes.
 *
 * A client component, which it did not need to be until collection existed:
 * the delivery line and the total now depend on a radio, and a summary rendered
 * on the server would keep quoting a delivery charge after the shopper had
 * chosen to come and collect. Quoting one figure and charging another is the
 * one thing a checkout must never do.
 *
 * It re-totals with `deliveryChargeFor`, which is the same function the
 * checkout action commits with — the arithmetic is shared rather than
 * reimplemented, so the two cannot drift.
 */
export function CheckoutSummary({
  items,
  count,
  subtotalCents,
  payableCents,
  discountCents,
  discountLabel,
  method,
}: {
  items: SummaryLine[];
  count: number;
  subtotalCents: number;
  /** Goods after any discount code — what delivery is quoted on. */
  payableCents: number;
  discountCents: number;
  discountLabel: string | null;
  method: FulfilmentMethod;
}) {
  const labels = fulfilmentLabels(method);
  const shippingCents = deliveryChargeFor(method, payableCents);
  const shortfall =
    method === FulfilmentMethod.DELIVERY
      ? remainingForFreeShipping(payableCents)
      : 0;

  return (
    <>
      <h2 className="text-on-surface text-sm font-medium">
        {count} item{count === 1 ? "" : "s"}
      </h2>

      <ul className="space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex justify-between gap-3">
            <span className="text-on-surface-variant min-w-0">
              <span className="text-on-surface">{item.name}</span>
              {item.variantLabel && ` · ${item.variantLabel}`}
              {item.color && ` · ${item.color}`}
              {item.quantity > 1 && ` × ${item.quantity}`}
            </span>
            <span className="text-on-surface shrink-0">
              {formatPrice(item.unitPriceCents * item.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="border-outline-variant space-y-2 border-t pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-on-surface-variant">Subtotal</dt>
          <dd className="text-on-surface">{formatPrice(subtotalCents)}</dd>
        </div>
        {discountCents > 0 && discountLabel && (
          <div className="flex justify-between">
            <dt className="text-tertiary truncate">{discountLabel}</dt>
            <dd className="text-tertiary shrink-0">−{formatPrice(discountCents)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          {/* "Delivery" or "Collection" — a row labelled Delivery reading Free
              on an order nothing is delivering is a line that answers a
              question nobody asked. */}
          <dt className="text-on-surface-variant">{labels.charge}</dt>
          <dd className="text-on-surface">
            {shippingCents === 0 ? "Free" : formatPrice(shippingCents)}
          </dd>
        </div>
      </dl>

      {/* Only worth saying while it is still reachable — and only while it is
          still relevant, which collection makes it not. */}
      {shortfall > 0 && (
        <p className="text-on-surface-variant text-xs">
          Spend {formatPrice(shortfall)} more for free delivery.
        </p>
      )}

      <div className="border-outline-variant flex items-baseline justify-between border-t pt-4">
        <span className="text-on-surface text-title-md">Total</span>
        <span data-numeric className="text-on-surface text-title-lg">
          {formatPrice(payableCents + shippingCents)}
        </span>
      </div>
    </>
  );
}
