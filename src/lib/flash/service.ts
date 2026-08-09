import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  applyPlan,
  planIsEmpty,
  readSnapshot,
  restorePlan,
  shouldBeLive,
  type PricedRow,
} from "@/lib/flash/pricing";
import type { ProductCardData } from "@/components/products/ProductCard";

/**
 * Opening and closing flash sales, and reading them back.
 *
 * There is no cron in this app, so the window is enforced *lazily*: every read
 * that could show a flash sale reconciles first, and every admin write
 * reconciles after. A sale therefore opens on the first request after its start
 * time rather than exactly at it, which for a promotion is the right trade —
 * the alternative is a scheduler this project does not have and would have to
 * keep alive.
 *
 * The one thing that must not happen is a price left written after a sale ends.
 * That is why closing is driven by the recorded snapshot rather than by
 * recomputing the discount, and why `reconcile` closes a sale whenever it finds
 * one applied that should not be — including sales that ended while the site had
 * no traffic at all.
 */

/** Interactive transactions here fan out over every product in a sale. */
const TRANSACTION_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

type SaleState = {
  id: string;
  percentOff: number;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
  appliedAt: Date | null;
};

/**
 * Make the world match the windows.
 *
 * Idempotent and safe to call on every request: the query below narrows to the
 * handful of sales whose applied state could disagree with their window, and in
 * the ordinary case that set is empty and this costs one indexed read.
 */
export async function reconcileFlashSales(now: Date = new Date()): Promise<void> {
  const candidates = await prisma.flashSale.findMany({
    where: {
      OR: [
        // Anything currently applied, so it can be checked for closing.
        { appliedAt: { not: null } },
        // Anything that ought to be applied and is not.
        { appliedAt: null, active: true, startsAt: { lte: now }, endsAt: { gt: now } },
      ],
    },
    select: {
      id: true,
      percentOff: true,
      startsAt: true,
      endsAt: true,
      active: true,
      appliedAt: true,
    },
  });

  for (const sale of candidates) {
    // The rule itself lives in `pricing`, so the admin screen's "is it live?"
    // and this decision cannot drift apart.
    const live = shouldBeLive(sale, now);

    if (live && sale.appliedAt === null) await openSale(sale, now);
    else if (!live && sale.appliedAt !== null) await closeSale(sale);
  }
}

/**
 * Write the reduced prices and mark the sale applied.
 *
 * The whole thing is one transaction, claim included. Two requests arriving
 * together both see `appliedAt: null` and both try to claim, but the conditional
 * `updateMany` takes a row lock: the second blocks until the first commits, then
 * re-evaluates its `where` and matches nothing. The loser returns having written
 * nothing, rather than applying the discount a second time on top of itself.
 */
async function openSale(sale: SaleState, now: Date): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.flashSale.updateMany({
      where: { id: sale.id, appliedAt: null },
      data: { appliedAt: now },
    });
    if (claimed.count === 0) return;

    const items = await tx.flashSaleItem.findMany({
      where: { flashSaleId: sale.id },
      select: {
        id: true,
        product: {
          select: {
            id: true,
            priceCents: true,
            compareAtPriceCents: true,
            variants: {
              select: { id: true, priceCents: true, compareAtPriceCents: true },
            },
          },
        },
      },
    });

    for (const item of items) {
      const plan = applyPlan(
        {
          id: item.product.id,
          priceCents: item.product.priceCents,
          compareAtPriceCents: item.product.compareAtPriceCents,
        },
        item.product.variants,
        sale.percentOff,
      );

      // A product already cheaper than this sale would make it. Not an error —
      // but the snapshot must be cleared, or a later close would restore a price
      // from some previous run of this sale.
      if (planIsEmpty(plan)) {
        await tx.flashSaleItem.update({
          where: { id: item.id },
          data: { priceSnapshot: Prisma.DbNull },
        });
        continue;
      }

      if (plan.product) {
        await tx.product.update({
          where: { id: plan.product.id },
          data: {
            priceCents: plan.product.priceCents,
            compareAtPriceCents: plan.product.compareAtPriceCents,
          },
        });
      }

      for (const variant of plan.variants) {
        await tx.productVariant.update({
          where: { id: variant.id },
          data: {
            priceCents: variant.priceCents,
            compareAtPriceCents: variant.compareAtPriceCents,
          },
        });
      }

      await tx.flashSaleItem.update({
        where: { id: item.id },
        data: {
          priceSnapshot: plan.snapshot as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }, TRANSACTION_OPTIONS);
}

/**
 * Put the prices back and clear the applied mark.
 *
 * Claimed the same way round as opening — `appliedAt: { not: null }` — so a
 * close cannot run twice and restore stale figures over a subsequent edit.
 */
async function closeSale(sale: SaleState): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.flashSale.updateMany({
      where: { id: sale.id, appliedAt: { not: null } },
      data: { appliedAt: null },
    });
    if (claimed.count === 0) return;

    const items = await tx.flashSaleItem.findMany({
      where: { flashSaleId: sale.id },
      select: {
        id: true,
        priceSnapshot: true,
        product: {
          select: {
            id: true,
            priceCents: true,
            compareAtPriceCents: true,
            variants: {
              select: { id: true, priceCents: true, compareAtPriceCents: true },
            },
          },
        },
      },
    });

    for (const item of items) {
      const snapshot = readSnapshot(item.priceSnapshot);
      // Nothing was written for this item, or the record is unreadable. Leaving
      // the prices alone is the only safe answer — a guess here would be a
      // wrong price on a live product.
      if (!snapshot) continue;

      const current: { product: PricedRow | null; variants: PricedRow[] } = {
        product: {
          id: item.product.id,
          priceCents: item.product.priceCents,
          compareAtPriceCents: item.product.compareAtPriceCents,
        },
        variants: item.product.variants,
      };

      const plan = restorePlan(snapshot, current);

      if (plan.product) {
        await tx.product.update({
          where: { id: plan.product.id },
          data: {
            priceCents: plan.product.priceCents,
            compareAtPriceCents: plan.product.compareAtPriceCents,
          },
        });
      }

      for (const variant of plan.variants) {
        await tx.productVariant.update({
          where: { id: variant.id },
          data: {
            priceCents: variant.priceCents,
            compareAtPriceCents: variant.compareAtPriceCents,
          },
        });
      }

      await tx.flashSaleItem.update({
        where: { id: item.id },
        data: { priceSnapshot: Prisma.DbNull },
      });
    }
  }, TRANSACTION_OPTIONS);
}

/**
 * Run a change to a sale with its prices back at their originals.
 *
 * Every edit to a *live* sale needs this, and the reason is order of operations.
 * Removing a product is the clearest case: the snapshot that says what its price
 * used to be lives on the row being deleted, so deleting first strands the
 * product at its discounted price with no record of what it was. Adding has the
 * mirror problem — `reconcile` only opens sales that are not yet applied, so a
 * product added to a running sale would never be discounted at all. Changing the
 * percentage has both.
 *
 * Rather than special-case each, the sale is closed, the change is made against
 * true prices, and `reconcile` reopens it if it should still be open. The extra
 * writes are irrelevant at admin-action frequency, and every path goes through
 * the same two functions that are exercised everywhere else.
 */
export async function withSaleClosed<T>(
  saleId: string,
  mutate: () => Promise<T>,
  now: Date = new Date(),
): Promise<T> {
  const sale = await prisma.flashSale.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      percentOff: true,
      startsAt: true,
      endsAt: true,
      active: true,
      appliedAt: true,
    },
  });

  if (sale?.appliedAt) await closeSale(sale);

  const result = await mutate();

  // Reopens this sale if its window still says so — and is the ordinary
  // no-op otherwise.
  await reconcileFlashSales(now);

  return result;
}

export interface FlashSaleView {
  id: string;
  name: string;
  percentOff: number;
  /** Epoch milliseconds — the countdown needs an instant, not a Date instance. */
  endsAtMs: number;
  /**
   * Milliseconds left, computed on the server at render time.
   *
   * Passed alongside `endsAtMs` so the countdown's first client render matches
   * the server's exactly. Deriving it in the browser instead would compare the
   * visitor's clock against a server timestamp and hydrate a different number
   * than was sent.
   */
  remainingMs: number;
  products: ProductCardData[];
}

const CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  image: true,
  priceCents: true,
  compareAtPriceCents: true,
  stock: true,
  published: true,
  colors: { orderBy: { sortOrder: "asc" as const }, select: { name: true, hex: true } },
  category: { select: { name: true } },
  brand: { select: { name: true, slug: true, iconSvg: true, logo: true, logoTreatment: true } },
  variants: {
    select: { priceCents: true, compareAtPriceCents: true, stock: true },
  },
} as const;

/**
 * The flash sale to put on the storefront, or null.
 *
 * Reconciles first, so a sale whose window opened since the last request is
 * live by the time this reads it. At most one is returned: two countdowns on one
 * page is a decision about which to believe, and the shopper should not have to
 * make it. The soonest to end wins — it is the one the timer is most urgent for.
 */
export async function getLiveFlashSale(
  now: Date = new Date(),
): Promise<FlashSaleView | null> {
  await reconcileFlashSales(now);

  const sale = await prisma.flashSale.findFirst({
    where: {
      active: true,
      appliedAt: { not: null },
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    orderBy: { endsAt: "asc" },
    select: {
      id: true,
      name: true,
      percentOff: true,
      endsAt: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: { product: { select: CARD_SELECT } },
      },
    },
  });

  if (!sale) return null;

  // Drafts are dropped rather than hidden by the query alone: a product can be
  // added to a sale and unpublished afterwards, and the storefront must not
  // resurrect it because a stale row still points at it.
  const products = sale.items
    .map((item) => item.product)
    .filter((product) => product.published);

  if (products.length === 0) return null;

  return {
    id: sale.id,
    name: sale.name,
    percentOff: sale.percentOff,
    endsAtMs: sale.endsAt.getTime(),
    remainingMs: Math.max(0, sale.endsAt.getTime() - now.getTime()),
    products,
  };
}

/** Where a sale is in its life, for the admin list. */
export type FlashSaleStatus = "LIVE" | "SCHEDULED" | "ENDED" | "OFF";

export function flashSaleStatus(
  sale: { startsAt: Date; endsAt: Date; active: boolean },
  now: Date = new Date(),
): FlashSaleStatus {
  if (shouldBeLive(sale, now)) return "LIVE";
  if (!sale.active) return "OFF";
  if (now.getTime() >= sale.endsAt.getTime()) return "ENDED";
  return "SCHEDULED";
}

export interface FlashSaleRow {
  id: string;
  name: string;
  percentOff: number;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
  applied: boolean;
  productCount: number;
  status: FlashSaleStatus;
}

/** Every sale, newest window first. Reconciles so the list cannot lie. */
export async function getFlashSalesForAdmin(
  now: Date = new Date(),
): Promise<FlashSaleRow[]> {
  await reconcileFlashSales(now);

  const sales = await prisma.flashSale.findMany({
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      name: true,
      percentOff: true,
      startsAt: true,
      endsAt: true,
      active: true,
      appliedAt: true,
      _count: { select: { items: true } },
    },
  });

  return sales.map((sale) => ({
    id: sale.id,
    name: sale.name,
    percentOff: sale.percentOff,
    startsAt: sale.startsAt,
    endsAt: sale.endsAt,
    active: sale.active,
    applied: sale.appliedAt !== null,
    productCount: sale._count.items,
    status: flashSaleStatus(sale, now),
  }));
}

/** One sale and its products, for the edit screen. */
export async function getFlashSaleForEdit(id: string) {
  return prisma.flashSale.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      percentOff: true,
      startsAt: true,
      endsAt: true,
      active: true,
      appliedAt: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          priceSnapshot: true,
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              priceCents: true,
              compareAtPriceCents: true,
              published: true,
              brand: { select: { name: true } },
              variants: {
                select: { id: true, priceCents: true, compareAtPriceCents: true },
              },
            },
          },
        },
      },
    },
  });
}

/**
 * Products that could still be added to this sale.
 *
 * Excludes what is already in it, and anything in *another* sale that is
 * currently applied — two sales writing the same product's price would have each
 * snapshot recording the other's figure as the original, and closing them in the
 * wrong order would leave the discount permanently baked in.
 */
export async function getFlashableProducts(saleId: string | null) {
  return prisma.product.findMany({
    where: {
      NOT: [
        ...(saleId ? [{ flashSales: { some: { flashSaleId: saleId } } }] : []),
        { flashSales: { some: { flashSale: { appliedAt: { not: null } } } } },
      ],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      published: true,
      priceCents: true,
      brand: { select: { name: true } },
    },
  });
}
