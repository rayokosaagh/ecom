import "server-only";

import { prisma } from "@/lib/prisma";
import { OrderStatus, Role } from "@/generated/prisma/enums";
import { LOW_STOCK_THRESHOLD } from "@/lib/inventory/stock";
import { getInventory } from "@/lib/inventory/service";
import {
  bucketByDay,
  currentPeriod,
  delta,
  eachDay,
  previousPeriod,
  type Period,
  type RangeDays,
} from "@/lib/dashboard/range";

/**
 * What the overview knows.
 *
 * One rule runs through all of it: **revenue means money actually taken.** A
 * pending order is a shopper who has not paid, and counting it would let the
 * headline figure be inflated by abandoned checkouts. A cancelled one is money
 * that came back. So only PAID and SHIPPED are revenue — everywhere, without
 * exception, which is why the set is declared once here and imported rather
 * than written into each query.
 *
 * Orders *placed* is a different measure and counts everything, because that is
 * what "orders" means to the person asking. The two disagreeing is expected;
 * the tiles name which is which.
 */
export const REVENUE_STATUSES = [
  OrderStatus.PAID,
  OrderStatus.SHIPPED,
  // Delivered is money the shop kept, so leaving it out would make revenue
  // *fall* as orders completed — the one direction a sales figure must never
  // move for a good reason.
  OrderStatus.DELIVERED,
] as const;

/**
 * At or below this, a published product is worth flagging.
 *
 * Re-exported from lib/inventory rather than declared here: the inventory page
 * classifies the same levels, and two copies of the number is how the overview
 * comes to call something low that inventory calls fine.
 */
export { LOW_STOCK_THRESHOLD };

/** Rows in the "top products" and "needs attention" lists. */
const LIST_SIZE = 5;

/**
 * One line of the "needs attention" list: a thing that can run out.
 *
 * A product with no variants is one line; a product with variants is one line
 * per variant and none of its own. The same rule the inventory page lists by
 * and checkout decrements by — and literally the same read: the card asks
 * `getInventory` for the emptiest published lines that are Low or Out, so a
 * line's own low-stock mark, the shop default and the sort order cannot
 * disagree between the two screens. The card used to read `product.stock`
 * for everything, which for a configurable product is a column nothing sells
 * from, so it flagged healthy products as empty and missed configurations
 * that actually were.
 */
export interface AttentionLine {
  /** Product id, plus variant id when the line is one configuration. */
  key: string;
  productId: string;
  name: string;
  slug: string;
  /** "16 GB / 512 GB", or null when the product itself holds the units. */
  configuration: string | null;
  stock: number;
  /** The mark this line is judged against. */
  threshold: number;
}

type OrderRow = { createdAt: Date; totalCents: number; status: OrderStatus };

/** Splits one fetched span into the two windows it covers. */
function within(rows: OrderRow[], period: Period): OrderRow[] {
  return rows.filter((row) => row.createdAt >= period.start && row.createdAt < period.end);
}

function isRevenue(row: OrderRow): boolean {
  return (REVENUE_STATUSES as readonly OrderStatus[]).includes(row.status);
}

/** A measure, its series, and how it compares with the window before. */
export type Measure = {
  total: number;
  series: number[];
  previousTotal: number;
  previousSeries: number[];
  delta: ReturnType<typeof delta>;
};

function measure(
  current: OrderRow[],
  previous: OrderRow[],
  period: Period,
  earlier: Period,
  value: (row: OrderRow) => number,
): Measure {
  const series = bucketByDay(current, period, (row) => row.createdAt, value);
  const previousSeries = bucketByDay(previous, earlier, (row) => row.createdAt, value);
  const total = series.reduce((a, b) => a + b, 0);
  const previousTotal = previousSeries.reduce((a, b) => a + b, 0);
  return { total, series, previousTotal, previousSeries, delta: delta(total, previousTotal) };
}

export type PipelineCounts = Record<OrderStatus, number>;

function pipeline(rows: OrderRow[]): PipelineCounts {
  const counts: PipelineCounts = {
    [OrderStatus.PENDING]: 0,
    [OrderStatus.PAID]: 0,
    [OrderStatus.SHIPPED]: 0,
    [OrderStatus.DELIVERED]: 0,
    [OrderStatus.CANCELLED]: 0,
  };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

export type AdminOverview = Awaited<ReturnType<typeof getAdminOverview>>;

/**
 * Everything the store-wide overview renders, for one window.
 *
 * `now` is a parameter rather than read inside so the whole page can be
 * rendered against a fixed clock in a test or a screenshot.
 */
export async function getAdminOverview(range: RangeDays, now: Date = new Date()) {
  const period = currentPeriod(range, now);
  const earlier = previousPeriod(period);

  const [orders, newUsers, items, attention, catalogue, published, recent] =
    await Promise.all([
      // Both windows in one read, split in memory below — two round trips for
      // one contiguous span would be the same rows fetched twice.
      prisma.order.findMany({
        where: { createdAt: { gte: earlier.start, lt: period.end } },
        select: { createdAt: true, totalCents: true, status: true },
      }),
      prisma.user.findMany({
        where: { role: Role.USER, createdAt: { gte: earlier.start, lt: period.end } },
        select: { createdAt: true },
      }),
      // Line items, not an aggregate: revenue per product is price × quantity,
      // which `groupBy` cannot sum for us. The window keeps it bounded.
      prisma.orderItem.findMany({
        where: {
          order: {
            createdAt: { gte: period.start, lt: period.end },
            status: { in: [...REVENUE_STATUSES] },
          },
        },
        select: {
          productId: true,
          name: true,
          priceCents: true,
          quantity: true,
          product: { select: { slug: true } },
        },
      }),
      // The emptiest published lines that are Low or Out, plus the Out count —
      // see `AttentionLine`. One read, paged to the list size in Postgres.
      getInventory({ published: true, state: ["OUT", "LOW"], pageSize: LIST_SIZE }),
      prisma.product.count(),
      prisma.product.count({ where: { published: true } }),
      prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        take: LIST_SIZE,
        select: {
          id: true,
          createdAt: true,
          status: true,
          totalCents: true,
          user: { select: { name: true, email: true } },
        },
      }),
    ]);

  const currentOrders = within(orders, period);
  const previousOrders = within(orders, earlier);

  const revenue = measure(
    currentOrders.filter(isRevenue),
    previousOrders.filter(isRevenue),
    period,
    earlier,
    (row) => row.totalCents,
  );
  const orderCount = measure(currentOrders, previousOrders, period, earlier, () => 1);

  // Average order value is derived from the two totals rather than averaged
  // per day: a mean of daily means weights a quiet Tuesday the same as a busy
  // Saturday, which is not what anyone means by "average order".
  const paidNow = currentOrders.filter(isRevenue).length;
  const paidBefore = previousOrders.filter(isRevenue).length;
  const aov = paidNow === 0 ? 0 : Math.round(revenue.total / paidNow);
  const previousAov = paidBefore === 0 ? 0 : Math.round(revenue.previousTotal / paidBefore);

  const customerSeries = bucketByDay(newUsers, period, (row) => row.createdAt);
  const previousCustomers = bucketByDay(newUsers, earlier, (row) => row.createdAt);
  const customerTotal = customerSeries.reduce((a, b) => a + b, 0);
  const previousCustomerTotal = previousCustomers.reduce((a, b) => a + b, 0);

  // Keyed by product where there still is one, and by the snapshotted name
  // otherwise — a deleted product's sales are still sales, and dropping them
  // would quietly shrink the period's totals.
  const byProduct = new Map<
    string,
    { name: string; slug: string | null; revenueCents: number; units: number }
  >();
  for (const item of items) {
    const key = item.productId ?? `deleted:${item.name}`;
    const entry = byProduct.get(key) ?? {
      name: item.name,
      slug: item.product?.slug ?? null,
      revenueCents: 0,
      units: 0,
    };
    entry.revenueCents += item.priceCents * item.quantity;
    entry.units += item.quantity;
    byProduct.set(key, entry);
  }

  const lowStock: AttentionLine[] = attention.units.map((unit) => ({
    key: unit.key,
    productId: unit.productId,
    name: unit.name,
    slug: unit.slug,
    configuration: unit.configuration,
    stock: unit.stock,
    threshold: unit.threshold,
  }));
  const outOfStock = attention.counts.OUT;

  const topProducts = [...byProduct.values()]
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, LIST_SIZE);

  return {
    period,
    earlier,
    days: eachDay(period),
    revenue,
    orders: orderCount,
    aov: { total: aov, previousTotal: previousAov, delta: delta(aov, previousAov) },
    customers: {
      total: customerTotal,
      series: customerSeries,
      previousTotal: previousCustomerTotal,
      previousSeries: previousCustomers,
      delta: delta(customerTotal, previousCustomerTotal),
    },
    pipeline: pipeline(currentOrders),
    topProducts,
    inventory: { lowStock, outOfStock, catalogue, published, drafts: catalogue - published },
    recent,
  };
}

export type CustomerOverview = Awaited<ReturnType<typeof getCustomerOverview>>;

/**
 * The same shape of page for someone who is not an admin.
 *
 * The overview is reachable by every signed-in account, so it cannot simply be
 * the store's books. A customer gets their own: what they have ordered, what
 * they have spent, and what they are still waiting for. Every query is scoped
 * by `userId`, which is the boundary — not the fact that the page happens to
 * render different components.
 */
export async function getCustomerOverview(
  userId: string,
  range: RangeDays,
  now: Date = new Date(),
) {
  const period = currentPeriod(range, now);
  const earlier = previousPeriod(period);

  const [orders, wishlist, reviews, lifetime, recent] = await Promise.all([
    prisma.order.findMany({
      where: { userId, createdAt: { gte: earlier.start, lt: period.end } },
      select: { createdAt: true, totalCents: true, status: true },
    }),
    prisma.wishlistItem.count({ where: { userId } }),
    prisma.review.count({ where: { userId } }),
    prisma.order.aggregate({
      where: { userId, status: { in: [...REVENUE_STATUSES] } },
      _sum: { totalCents: true },
      _count: true,
    }),
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: LIST_SIZE,
      select: { id: true, createdAt: true, status: true, totalCents: true },
    }),
  ]);

  const currentOrders = within(orders, period);
  const previousOrders = within(orders, earlier);

  const spend = measure(
    currentOrders.filter(isRevenue),
    previousOrders.filter(isRevenue),
    period,
    earlier,
    (row) => row.totalCents,
  );
  const placed = measure(currentOrders, previousOrders, period, earlier, () => 1);

  return {
    period,
    earlier,
    days: eachDay(period),
    spend,
    placed,
    pipeline: pipeline(currentOrders),
    wishlist,
    reviews,
    lifetime: { spentCents: lifetime._sum.totalCents ?? 0, orders: lifetime._count },
    recent,
  };
}
