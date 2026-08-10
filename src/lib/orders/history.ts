import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/generated/prisma/enums";
import type { TicketOrder } from "@/components/orders/OrderTicket";

/**
 * A customer's own orders, a page at a time.
 *
 * Paginated rather than fetched whole, which is what the page used to do. An
 * order carries its line items, so "every order" is a join that grows without
 * limit against a customer who keeps shopping — the one query on this page
 * whose cost is unbounded by anything the shop controls.
 *
 * `cache()` deduplicates it within a render: the profile page needs both the
 * rows and the count to draw a pager, and both come from here. It is per-request
 * only, which is the right scope for per-account data on an authenticated page —
 * nothing is held between requests, so no shopper can be served another's
 * orders.
 */

/**
 * How many orders the profile's panel shows at a time.
 *
 * Three, not the five it was: an order ticket is a tall object, and five of
 * them made the panel most of the page — you scrolled past the whole history to
 * reach anything else on the account. The status tabs and the pager both still
 * work, and /orders (which passes its own, larger page size) is where the full
 * list lives.
 */
export const ORDERS_PER_PAGE = 3;

/**
 * Exactly what `OrderTicket` and the reorder button read, and nothing else.
 *
 * Notably absent: the address columns, the payment reference, the discount
 * snapshot. A list of orders does not show them, and pulling seven unused text
 * columns per row is the sort of thing that only becomes visible once somebody
 * has a hundred orders.
 */
const HISTORY_SELECT = {
  id: true,
  status: true,
  totalCents: true,
  createdAt: true,
  fulfilment: true,
  shippingCity: true,
  shippingCountry: true,
  items: {
    select: {
      id: true,
      name: true,
      quantity: true,
      priceCents: true,
      variant: true,
      color: true,
      colorHex: true,
    },
  },
} as const;

export type OrderHistoryPage = {
  orders: TicketOrder[];
  /** Orders matching the current filter — what the pager divides. */
  total: number;
  page: number;
  totalPages: number;
  /** Every status's count, so the tabs can carry numbers and none is a dead end. */
  counts: Record<OrderStatus, number>;
  /** All orders on the account, whatever their status. */
  totalAll: number;
};

/**
 * Read one page of history, optionally of one status.
 *
 * `page` is clamped rather than trusted: `?page=0` would make `skip` negative
 * and `?page=-4` would make Prisma throw, and neither is worth an error page
 * when the first page is the obvious thing to show.
 *
 * The counts come from a single `groupBy` rather than one count per tab. They
 * are also what makes the tabs honest — a filter that silently leads to an
 * empty page is worse than one that says "Cancelled (0)" before it is pressed.
 */
export const getOrderHistory = cache(
  async (
    userId: string,
    page: number,
    perPage: number = ORDERS_PER_PAGE,
    status?: OrderStatus,
  ): Promise<OrderHistoryPage> => {
    const where = { userId, ...(status ? { status } : {}) };

    const grouped = await prisma.order.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
    });

    const counts = {
      [OrderStatus.PENDING]: 0,
      [OrderStatus.PAID]: 0,
      [OrderStatus.SHIPPED]: 0,
      [OrderStatus.DELIVERED]: 0,
      [OrderStatus.CANCELLED]: 0,
    } as Record<OrderStatus, number>;
    for (const row of grouped) counts[row.status] = row._count._all;

    const totalAll = grouped.reduce((sum, row) => sum + row._count._all, 0);
    const total = status ? counts[status] : totalAll;

    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const current = Math.min(Math.max(page, 1), totalPages);

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (current - 1) * perPage,
      take: perPage,
      select: HISTORY_SELECT,
    });

    return { orders, total, page: current, totalPages, counts, totalAll };
  },
);

/** `?page=` as an integer, with anything unreadable meaning the first page. */
export function parsePage(raw: string | string[] | undefined): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

/** The filter tabs, in the order the journey happens. */
export const HISTORY_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.PAID,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
] as const;

/**
 * `?status=` as a status, with anything unrecognised meaning "all".
 *
 * Undefined rather than an error: a stale link or a typo should show the whole
 * history, not a page explaining that PENDNIG is not a status.
 */
export function parseStatus(raw: string | string[] | undefined): OrderStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return HISTORY_STATUSES.includes(value as OrderStatus)
    ? (value as OrderStatus)
    : undefined;
}
