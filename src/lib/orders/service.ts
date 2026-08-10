import "server-only";

import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@/generated/prisma/enums";

/** Everything both the customer receipt and the admin view need. */
const ORDER_SELECT = {
  id: true,
  status: true,
  totalCents: true,
  shippingCents: true,
  discountLabel: true,
  discountCents: true,
  createdAt: true,
  // Decides what the address block is headed, what SHIPPED is called, and
  // whether the charge line says Delivery or Collection.
  fulfilment: true,
  paymentMethod: true,
  // The gateway's own reference, so the shop can reconcile a disputed payment
  // without going through the database by hand.
  paymentTxnId: true,
  paidAt: true,
  shippingName: true,
  shippingLine1: true,
  shippingLine2: true,
  shippingCity: true,
  shippingRegion: true,
  shippingPostcode: true,
  shippingCountry: true,
  shippingPhone: true,
  // Null unless the order is cancelled; both sides show it back.
  cancelReason: true,
  cancelNote: true,
  user: { select: { id: true, name: true, email: true } },
  items: {
    select: {
      id: true,
      name: true,
      priceCents: true,
      quantity: true,
      color: true,
      colorHex: true,
      variant: true,
      // Kept so the admin view can link back to a product that still exists.
      product: { select: { slug: true, image: true } },
    },
  },
} as const;

export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrder>>>;

/**
 * One order.
 *
 * @param forUserId When given, the order must belong to that user. This is the
 *   authorization boundary for the customer-facing receipt: an order id is a
 *   cuid, but guessability is not a permission model.
 */
export async function getOrder(id: string, forUserId?: string) {
  if (!id) return null;
  return prisma.order.findFirst({
    where: { id, ...(forUserId ? { userId: forUserId } : {}) },
    select: ORDER_SELECT,
  });
}

/**
 * What an admin searching the order list is realistically holding: a customer
 * on the phone, an email in a support thread, or an order reference from a
 * receipt. Matching the id by prefix rather than in full is what makes the
 * short form people actually quote — the first few characters — find anything.
 */
function orderSearchFilter(query: string) {
  const contains = { contains: query, mode: "insensitive" as const };
  return {
    OR: [
      { shippingName: contains },
      { shippingCity: contains },
      { shippingCountry: contains },
      { shippingPhone: contains },
      { user: { name: contains } },
      { user: { email: contains } },
      { id: { startsWith: query, mode: "insensitive" as const } },
    ],
  };
}

/** The admin list, newest first, optionally narrowed to one status. */
export async function getOrdersForAdmin(status?: OrderStatus, query?: string) {
  const search = query?.trim();
  return prisma.order.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(search ? orderSearchFilter(search) : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      totalCents: true,
      createdAt: true,
      shippingName: true,
      shippingCity: true,
      shippingCountry: true,
      user: { select: { name: true, email: true } },
      _count: { select: { items: true } },
    },
  });
}

/**
 * How many orders sit in each status, for the filter rail.
 *
 * Counted under the search but not under the status filter: the rail's job is
 * to say what else is there, and a count that recounted under its own filter
 * would read "Cancelled 0" while standing on Paid.
 */
export async function getOrderCounts(query?: string): Promise<Record<string, number>> {
  const search = query?.trim();
  const grouped = await prisma.order.groupBy({
    by: ["status"],
    where: search ? orderSearchFilter(search) : {},
    _count: { _all: true },
  });
  return Object.fromEntries(grouped.map((row) => [row.status, row._count._all]));
}
