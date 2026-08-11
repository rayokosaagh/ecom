import { orderReference } from "@/lib/orders/reference";
import { nextStatus } from "@/lib/orders/transitions";
import { formatOrderDate, pendingAge } from "@/lib/orders/when";
import { formatPrice } from "@/lib/products/format";
import type { FulfilmentMethod, OrderStatus, PaymentMethod } from "@/generated/prisma/enums";

/**
 * One row of the admin list, with every derived value already derived.
 *
 * The table and the bulk bar are client components, so this is the boundary
 * they receive. Formatting on the server and shipping strings does two things:
 * it keeps `Intl` out of the client bundle, and — the reason that actually
 * matters — it makes "2 hours ago" a fact decided once. Computing it on both
 * sides of hydration means computing it against two different clocks in two
 * different timezones, and React would be right to complain.
 */
export interface OrderRow {
  id: string;
  /** The short form a customer quotes, e.g. `91K90LXZ`. */
  reference: string;
  customer: string;
  email: string;
  /** "Kathmandu, NP" — null on a pickup order, which has no shipping address. */
  place: string | null;
  items: number;
  amount: string;
  date: { text: string; title: string };
  status: OrderStatus;
  fulfilment: FulfilmentMethod;
  /** Only ever set on a PENDING row, and only once it is late. */
  overdue: { short: string; long: string } | null;
  /** The single forward move, for the hover action. Null on a terminal status. */
  advance: OrderStatus | null;
  /** What was bought, revealed when the row is expanded. */
  lines: OrderLine[];
  /** Lines beyond the preview bound, so the expander can admit to them. */
  hiddenLines: number;
}

export interface OrderLine {
  id: string;
  name: string;
  quantity: number;
  /** The line total — price times quantity, which is what the row contributes. */
  total: string;
  /** Only worth showing when the quantity is more than one. */
  each: string | null;
  variant: string | null;
  color: string | null;
  colorHex: string | null;
  image: string | null;
  /** Null once the product is deleted; the line itself still reads fine. */
  href: string | null;
}

/** What `getOrdersForAdmin` selects, stated structurally so this stays client-safe. */
export interface AdminOrderRecord {
  id: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: Date;
  shippingName: string | null;
  shippingCity: string | null;
  shippingCountry: string | null;
  fulfilment: FulfilmentMethod;
  /** Not shown in the table — it is a column on the CSV export. */
  paymentMethod: PaymentMethod;
  user: { name: string | null; email: string };
  _count: { items: number };
  items: {
    id: string;
    name: string;
    quantity: number;
    priceCents: number;
    variant: string | null;
    color: string | null;
    colorHex: string | null;
    product: { slug: string; image: string | null } | null;
  }[];
}

export function toOrderRow(order: AdminOrderRecord, now: Date): OrderRow {
  // The name on the parcel first: it is what the courier and the customer both
  // see, and it is not always the account holder's — people order for others.
  const customer = order.shippingName ?? order.user.name ?? order.user.email;

  const place = order.shippingCity
    ? [order.shippingCity, order.shippingCountry].filter(Boolean).join(", ")
    : null;

  const age = order.status === "PENDING" ? pendingAge(order.createdAt, now) : null;

  return {
    id: order.id,
    reference: orderReference(order.id),
    customer,
    email: order.user.email,
    place,
    items: order._count.items,
    amount: formatPrice(order.totalCents),
    date: formatOrderDate(order.createdAt, now),
    status: order.status,
    fulfilment: order.fulfilment,
    overdue: age?.overdue ? { short: age.short, long: age.long } : null,
    advance: nextStatus(order.status),
    lines: order.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      total: formatPrice(item.priceCents * item.quantity),
      // Spelling out the unit price on a quantity of one would only repeat the
      // total beside itself.
      each: item.quantity > 1 ? formatPrice(item.priceCents) : null,
      variant: item.variant,
      color: item.color,
      colorHex: item.colorHex,
      image: item.product?.image ?? null,
      href: item.product ? `/products/${item.product.slug}` : null,
    })),
    hiddenLines: Math.max(0, order._count.items - order.items.length),
  };
}
