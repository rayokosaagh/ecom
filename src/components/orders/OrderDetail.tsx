import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { TicketBarcode, TicketPanel } from "@/components/ui/TicketPanel";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { formatPrice } from "@/lib/products/format";
import { orderReference } from "@/lib/orders/reference";
import { describeCancellation } from "@/lib/orders/cancellation";
import { fulfilmentLabels } from "@/lib/checkout/fulfilment";
import { paymentMethodLabel } from "@/lib/payments/methods";
import { PaymentMark } from "@/components/checkout/PaymentMark";
import { FulfilmentMethod } from "@/generated/prisma/enums";
import type { OrderDetail as Order } from "@/lib/orders/service";

/**
 * One order, rendered the same way for the customer and the admin.
 *
 * Shared deliberately: a receipt and a fulfilment view differ in what you can
 * *do* with the order, not in what the order says. Keeping one component means
 * the address the customer sees and the address the warehouse reads cannot
 * drift apart. The admin page supplies its controls as `actions`.
 *
 * Shaped as the same ticket the orders list uses, and laid out in the same
 * order — reference top-left, date top-right, total and status on the stub —
 * so opening one reads as the same object enlarged rather than a different
 * screen about it.
 */
export function OrderDetail({
  order,
  actions,
  surface,
}: {
  order: Order;
  actions?: React.ReactNode;
  /** Passed through to the ticket — see `TicketPanel`. The admin shell is
      near-white, so its page overrides this to keep the ticket legible. */
  surface?: string;
}) {
  const subtotalCents = order.items.reduce(
    (sum, item) => sum + item.priceCents * item.quantity,
    0,
  );
  const units = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const cancellation = describeCancellation(order.cancelReason, order.cancelNote);
  const labels = fulfilmentLabels(order.fulfilment);
  const collecting = order.fulfilment === FulfilmentMethod.PICKUP;

  return (
    <div className="space-y-6">
      <TicketPanel
        surface={surface}
        stub={
          <>
            <div className="min-w-0">
              <p className="text-on-surface-variant text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
                Total · {units} item{units === 1 ? "" : "s"}
              </p>
              <p className="text-on-surface mt-0.5 text-2xl font-medium tabular-nums">
                {formatPrice(order.totalCents)}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <TicketBarcode
                seed={order.id}
                className="text-on-surface-variant/70 hidden sm:flex"
              />
              <OrderStatusBadge status={order.status} fulfilment={order.fulfilment} />
            </div>
          </>
        }
      >
        <div className="px-5 pt-5 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-on-surface-variant text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
                Order no.
              </p>
              {/* The short reference leads, matching the ticket in the list.
                  The full id stays underneath because that is what an admin
                  searches by. */}
              <p className="text-on-surface mt-0.5 font-mono text-xl tracking-[0.12em] tabular-nums">
                {orderReference(order.id)}
              </p>
              <p className="text-on-surface-variant mt-1 font-mono text-[0.6875rem] break-all">
                {order.id}
              </p>
            </div>

            <div className="text-right">
              <p className="text-on-surface-variant text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
                Placed
              </p>
              <p className="text-on-surface mt-0.5 text-sm">
                {order.createdAt.toLocaleDateString("en-US", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          {/* Directly under the reference and above the goods, because on a
              cancelled order this is the first thing either side is looking
              for. Shown to the customer as well as the admin: when the shop
              cancelled it, why is the whole message, and when the customer
              did, it is the record of what they said. */}
          {cancellation && (
            <div className="border-outline-variant mt-5 border-t pt-4">
              <h2 className="text-on-surface-variant text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
                Cancelled because
              </h2>
              <p className="text-on-surface mt-1.5 text-sm">{cancellation}</p>
            </div>
          )}

          <ul className="divide-outline-variant/60 mt-5 divide-y">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <span className="bg-surface-container-highest size-14 shrink-0 overflow-hidden rounded-lg">
                  {item.product?.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.product.image}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="text-on-surface-variant grid size-full place-items-center">
                      <Icon name="image" size={20} />
                    </span>
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  {/* Links only where the product still exists — every other
                      field here is a snapshot and survives deletion. */}
                  {item.product ? (
                    <Link
                      href={`/products/${item.product.slug}`}
                      className="text-on-surface rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {item.name}
                    </Link>
                  ) : (
                    <p className="text-on-surface text-sm font-medium">{item.name}</p>
                  )}

                  <p className="text-on-surface-variant mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                    <span>Qty {item.quantity}</span>
                    {item.variant && <span>· {item.variant}</span>}
                    {item.color && (
                      <span className="flex items-center gap-1">
                        ·
                        <span
                          aria-hidden
                          className="border-outline-variant size-3 rounded-full border"
                          style={{ backgroundColor: item.colorHex || "transparent" }}
                        />
                        {item.color}
                      </span>
                    )}
                  </p>
                </div>

                <p className="text-on-surface shrink-0 text-sm tabular-nums">
                  {formatPrice(item.priceCents * item.quantity)}
                </p>
              </li>
            ))}
          </ul>

          <dl className="border-outline-variant mt-4 space-y-2 border-t pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-on-surface-variant">Subtotal</dt>
              <dd className="text-on-surface tabular-nums">
                {formatPrice(subtotalCents)}
              </dd>
            </div>
            {/* Snapshotted on the order, so this still reads correctly after
                the code itself has been edited or deleted. */}
            {order.discountCents > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-tertiary truncate">
                  {order.discountLabel ?? "Discount"}
                </dt>
                <dd className="text-tertiary shrink-0 tabular-nums">
                  −{formatPrice(order.discountCents)}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-on-surface-variant">{labels.charge}</dt>
              <dd className="text-on-surface tabular-nums">
                {order.shippingCents === 0 ? "Free" : formatPrice(order.shippingCents)}
              </dd>
            </div>

            {/* How it was paid for, on the receipt itself. A customer checking
                whether they still owe money should not have to infer it from
                the status badge. */}
            <div className="flex justify-between">
              <dt className="text-on-surface-variant">Payment</dt>
              <dd className="text-on-surface flex items-center gap-2">
                <PaymentMark method={order.paymentMethod} />
                {paymentMethodLabel(order.paymentMethod, order.fulfilment)}
              </dd>
            </div>
          </dl>

          {/* The gateway's own reference, once there is one. This is what the
              shop and the customer quote at each other when a payment is
              disputed, so it belongs on the copy they both hold. */}
          {order.paymentTxnId && (
            <p className="text-on-surface-variant mt-2 text-xs">
              Payment reference{" "}
              <span className="text-on-surface font-mono">{order.paymentTxnId}</span>
            </p>
          )}

          {/* Inside the ticket rather than beside it: where an order is going
              is part of the receipt, not a footnote to it.

              A collection order has no address lines — only a name — so it is
              the *name* that decides whether there is anything to show here,
              not `shippingLine1`. Orders placed before checkout collected
              either still show nothing. */}
          {order.shippingName && (
            <div className="border-outline-variant mt-4 border-t pt-4">
              <h2 className="text-on-surface-variant text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
                {collecting ? "Collected by" : labels.destination}
              </h2>
              <address className="text-on-surface mt-1.5 text-sm not-italic">
                {order.shippingName}
                {order.shippingLine1 && (
                  <>
                    <br />
                    {order.shippingLine1}
                  </>
                )}
                {order.shippingLine2 && (
                  <>
                    <br />
                    {order.shippingLine2}
                  </>
                )}
                {(order.shippingCity ||
                  order.shippingRegion ||
                  order.shippingPostcode) && (
                  <>
                    <br />
                    {[order.shippingCity, order.shippingRegion, order.shippingPostcode]
                      .filter(Boolean)
                      .join(", ")}
                  </>
                )}
                {order.shippingCountry && (
                  <>
                    <br />
                    {order.shippingCountry}
                  </>
                )}
                {order.shippingPhone && (
                  <>
                    <br />
                    <span className="text-on-surface-variant">{order.shippingPhone}</span>
                  </>
                )}
              </address>

              {/* Said on the receipt rather than only in the email: this is the
                  copy a customer opens at the counter. */}
              {collecting && (
                <p className="text-on-surface-variant mt-2 flex items-center gap-1.5 text-xs">
                  <Icon name="storefront" size={14} />
                  Collecting from the shop — nothing to deliver.
                </p>
              )}
            </div>
          )}
        </div>
      </TicketPanel>

      {actions}
    </div>
  );
}
