import "server-only";

import { prisma } from "@/lib/prisma";
import { DEFAULT_PER_PAGE, type DateWindow, type OrderSort } from "@/lib/orders/list-params";
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
 * A picture to hang a notification about this order on.
 *
 * The first line's product, which for the overwhelmingly common single-item
 * order is simply "the thing you bought" and for a mixed one is at least
 * something recognisable — better than a generic bag glyph on every row of the
 * bell, which is what the panel falls back to when this finds nothing.
 *
 * Returns null rather than throwing on every dead end there is: an order whose
 * product was deleted (`OrderItem.productId` is nulled, by design), one whose
 * product never had a photo, or an id that no longer exists. A notification is
 * not worth failing an order over, and the caller wants a value it can pass
 * straight through.
 */
export async function orderThumbnail(orderId: string): Promise<string | null> {
  const line = await prisma.orderItem.findFirst({
    where: { orderId, product: { image: { not: null } } },
    // Ordered so a two-line order does not show a different product each time
    // the notice is raised. Cuids sort by creation, so this is the first line.
    orderBy: { id: "asc" },
    select: { product: { select: { image: true } } },
  });

  return line?.product?.image ?? null;
}

/**
 * What an admin searching the order list is realistically holding: a customer
 * on the phone, an email in a support thread, or an order reference from a
 * receipt.
 *
 * The id is matched by `contains`, and that is not laziness. `orderReference`
 * builds the short form people actually quote out of the *last* eight
 * characters of the cuid, so a prefix match — which is what this did — could
 * never find one: an admin typing the reference printed on the row in front of
 * them got nothing back. Anchoring to the other end would fix that one case and
 * break pasting a full id, so it is anchored to neither.
 *
 * `check:orders-list` asserts the invariant this relies on — that the reference
 * is a substring of the id it came from.
 */
function orderSearchFilter(query: string) {
  const contains = { contains: query, mode: "insensitive" as const };

  // The reference is rendered as `#91K90LXZ` on the cards, and people copy what
  // they see. The hash is punctuation, not part of the value.
  const reference = query.replace(/^#/, "");

  return {
    OR: [
      { shippingName: contains },
      { shippingCity: contains },
      { shippingCountry: contains },
      { shippingPhone: contains },
      { user: { name: contains } },
      { user: { email: contains } },
      { id: { contains: reference, mode: "insensitive" as const } },
      // What was bought, not just who bought it — "which orders have the
      // headphones in them" is a question support gets asked constantly.
      //
      // Matched against the line's snapshotted name rather than through to
      // `Product.name`, so an order still turns up under the name it was sold
      // under after the product is renamed, and turns up at all after it is
      // deleted — `OrderItem.productId` is nulled on delete, and a join through
      // it would quietly lose exactly the orders someone is most likely to be
      // digging for.
      { items: { some: { name: contains } } },
    ],
  };
}

/**
 * How many lines of an order the list carries.
 *
 * The lines are fetched with the page rather than on demand, which is what
 * makes expanding a row instant and stateless. The bound is what stops that
 * being a bad trade: a hundred orders of two lines is two hundred small rows,
 * but one order with sixty lines on a page of a hundred is not. Past this the
 * expander says how many are left and points at the order itself, which is the
 * right place to read a long one anyway.
 */
const MAX_PREVIEW_LINES = 12;

/** The columns the admin list and its CSV export both read. */
const ADMIN_LIST_SELECT = {
  id: true,
  status: true,
  totalCents: true,
  createdAt: true,
  shippingName: true,
  shippingCity: true,
  shippingCountry: true,
  // Not shown as its own column, but it decides whether SHIPPED reads as
  // "Shipped" or "Ready to collect" — the badge says the wrong word without it.
  fulfilment: true,
  paymentMethod: true,
  user: { select: { name: true, email: true } },
  _count: { select: { items: true } },
  items: {
    take: MAX_PREVIEW_LINES,
    // Cuids sort by creation, so this is the order the lines were added in —
    // and, more to the point, it is *stable*. Without it an expanded row could
    // list the same two products in a different sequence on every render.
    orderBy: { id: "asc" as const },
    select: {
      id: true,
      // The snapshotted name, not the product's current one: a line has to keep
      // saying what was bought even after the product is renamed or deleted.
      name: true,
      quantity: true,
      priceCents: true,
      variant: true,
      color: true,
      colorHex: true,
      product: { select: { slug: true, image: true } },
    },
  },
} as const;

export type AdminOrderRow = Awaited<ReturnType<typeof getOrdersForAdmin>>["orders"][number];

/**
 * Ordering, with a tiebreaker that pagination depends on.
 *
 * Sorting by amount alone is not a total order — two orders of the same value
 * sit in whatever sequence Postgres feels like, and that sequence is free to
 * differ between the query for page 1 and the query for page 2. The result is a
 * row that appears on both pages while another appears on neither. `id` is a
 * cuid and therefore unique, so appending it makes every sort deterministic.
 */
function orderByFor(sort: OrderSort) {
  const tiebreak = { id: "desc" } as const;
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" as const }, tiebreak];
    case "highest":
      return [{ totalCents: "desc" as const }, tiebreak];
    case "lowest":
      return [{ totalCents: "asc" as const }, tiebreak];
    case "newest":
    default:
      return [{ createdAt: "desc" as const }, tiebreak];
  }
}

function createdAtFilter(window: DateWindow) {
  if (!window.from && !window.to) return {};
  return {
    createdAt: {
      ...(window.from ? { gte: window.from } : {}),
      ...(window.to ? { lte: window.to } : {}),
    },
  };
}

/**
 * Everything that narrows the list *except* the status pill.
 *
 * Split out because the filter rail counts under these but not under status —
 * see `getOrderCounts`.
 */
function baseFilter(query: string | undefined, window: DateWindow) {
  const search = query?.trim();
  return {
    ...(search ? orderSearchFilter(search) : {}),
    ...createdAtFilter(window),
  };
}

export interface AdminOrderQuery {
  status?: OrderStatus;
  query?: string;
  sort?: OrderSort;
  window?: DateWindow;
  page?: number;
  perPage?: number;
}

/**
 * One page of the admin list.
 *
 * Counted before it is read so the page number can be clamped: a filter that
 * shrinks the result set while someone is standing on page 9 should land them
 * on the last page that exists, not on a blank one with a pager that offers no
 * way back. The same reason `/admin/inventory` does it.
 */
export async function getOrdersForAdmin({
  status,
  query,
  sort = "newest",
  window = {},
  page = 1,
  perPage = DEFAULT_PER_PAGE,
}: AdminOrderQuery) {
  const where = {
    ...(status ? { status } : {}),
    ...baseFilter(query, window),
  };

  const total = await prisma.order.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, page), totalPages);

  const orders = await prisma.order.findMany({
    where,
    orderBy: orderByFor(sort),
    skip: (current - 1) * perPage,
    take: perPage,
    select: ADMIN_LIST_SELECT,
  });

  return { orders, total, totalPages, page: current, perPage };
}

/**
 * Every order matching the current filters, ignoring the pager.
 *
 * Only the CSV export calls this, and only because an export that stopped at
 * the page boundary would be a quietly wrong file rather than a visibly empty
 * one. `take` is a ceiling rather than a page: a spreadsheet nobody can open is
 * not a better outcome than a truncated one they are told about.
 */
export async function getOrdersForExport(
  { status, query, sort = "newest", window = {} }: AdminOrderQuery,
  limit: number,
) {
  return prisma.order.findMany({
    where: { ...(status ? { status } : {}), ...baseFilter(query, window) },
    orderBy: orderByFor(sort),
    take: limit,
    select: ADMIN_LIST_SELECT,
  });
}

/** The named orders behind a bulk selection, for an export of just those rows. */
export async function getOrdersByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.order.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: "desc" },
    select: ADMIN_LIST_SELECT,
  });
}

/**
 * How many orders sit in each status, for the filter rail.
 *
 * Counted under the search and the date range but not under the status filter:
 * the rail's job is to say what else is there, and a count that recounted under
 * its own filter would read "Cancelled 0" while standing on Paid.
 */
export async function getOrderCounts(
  query?: string,
  window: DateWindow = {},
): Promise<Record<string, number>> {
  const grouped = await prisma.order.groupBy({
    by: ["status"],
    where: baseFilter(query, window),
    _count: { _all: true },
  });
  return Object.fromEntries(grouped.map((row) => [row.status, row._count._all]));
}
