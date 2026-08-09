import { Icon } from "@/components/ui/Icon";
import { TicketBarcode, TicketPanel } from "@/components/ui/TicketPanel";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { formatPrice } from "@/lib/products/format";
import { orderReference } from "@/lib/orders/reference";
import { FulfilmentMethod, type OrderStatus } from "@/generated/prisma/enums";
import { fulfilmentLabels } from "@/lib/checkout/fulfilment";

export type TicketOrder = {
  id: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: Date;
  fulfilment: FulfilmentMethod;
  shippingCity: string | null;
  shippingCountry: string | null;
  items: {
    id: string;
    name: string;
    quantity: number;
    priceCents: number;
    variant: string | null;
    color: string | null;
    colorHex: string | null;
  }[];
};

/** How many lines are listed before the rest are summarised. */
const VISIBLE_ITEMS = 3;

/**
 * An order rendered as a raffle ticket.
 *
 * The shape is doing real work rather than decoration: the stub below the
 * perforation carries the two things you look for when scanning a list of
 * orders — what it cost and where it has got to — and the notches make the
 * boundary obvious at a glance.
 */
export function OrderTicket({
  order,
  highlighted = false,
}: {
  order: TicketOrder;
  highlighted?: boolean;
}) {
  const items = order.items.slice(0, VISIBLE_ITEMS);
  const hidden = order.items.length - items.length;
  const units = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <TicketPanel
      href={`/orders/${order.id}`}
      aria-label={`Order ${orderReference(order.id)}, ${formatPrice(order.totalCents)}`}
      // A ring would be clipped by the notch mask, so the highlight for a
      // just-placed order is a background shift instead.
      className={highlighted ? "bg-primary-container" : undefined}
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
            <Icon
              name="chevron_right"
              size={18}
              className="text-on-surface-variant transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </div>
        </>
      }
    >
      <div className="px-5 pt-5 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-on-surface-variant text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
              Order no.
            </p>
            <p className="text-on-surface mt-0.5 font-mono text-xl tracking-[0.12em] tabular-nums">
              {orderReference(order.id)}
            </p>
          </div>

          <div className="text-right">
            <p className="text-on-surface-variant text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
              Placed
            </p>
            <p className="text-on-surface mt-0.5 text-sm">
              {order.createdAt.toLocaleDateString("en-US", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-on-surface-variant flex min-w-0 items-center gap-2">
                {item.color && (
                  <span
                    aria-hidden
                    title={item.color}
                    className="border-outline-variant size-2.5 shrink-0 rounded-full border"
                    style={{ backgroundColor: item.colorHex || "transparent" }}
                  />
                )}
                <span className="truncate">
                  {item.name}
                  {item.variant && ` · ${item.variant}`}
                </span>
              </span>
              <span className="text-on-surface-variant shrink-0 tabular-nums">
                ×{item.quantity}
              </span>
            </li>
          ))}
          {hidden > 0 && (
            <li className="text-on-surface-variant text-sm">
              + {hidden} more item{hidden === 1 ? "" : "s"}
            </li>
          )}
        </ul>

        {/* Where it is headed. A collection order has no city to name, so it
            says what it is instead — leaving the line blank would read as an
            order missing its address rather than one that never needed one. */}
        {order.fulfilment === FulfilmentMethod.PICKUP ? (
          <p className="text-on-surface-variant mt-3 flex items-center gap-1.5 text-xs">
            <Icon name={fulfilmentLabels(order.fulfilment).icon} size={14} />
            {fulfilmentLabels(order.fulfilment).method}
          </p>
        ) : (
          (order.shippingCity || order.shippingCountry) && (
            <p className="text-on-surface-variant mt-3 flex items-center gap-1.5 text-xs">
              <Icon name="local_shipping" size={14} />
              {[order.shippingCity, order.shippingCountry].filter(Boolean).join(", ")}
            </p>
          )
        )}
      </div>
    </TicketPanel>
  );
}
