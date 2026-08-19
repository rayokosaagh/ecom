import "server-only";

import { prisma } from "@/lib/prisma";
import { NotificationType } from "@/generated/prisma/enums";
import { notifyAdmins } from "@/lib/notifications/service";
import { describeVariant } from "@/lib/products/variants";
import { LOW_STOCK_THRESHOLD, stockAlertFor } from "@/lib/inventory/stock";

/**
 * Telling admins when a line runs low or runs out.
 *
 * The dashboard card and the inventory page show the same thing, but only to
 * someone who looks. This is the push: one bell notice, to every admin, the
 * moment a line *crosses* into Low or into Out — whichever write moved it.
 * Checkout and a hand adjustment both go through here, so the rule is stated
 * once.
 *
 * Three decisions keep it useful rather than noisy:
 *
 * - **Crossings, not levels.** A line sitting at 2 for a week is not news
 *   every time it is read; it was news once, when it got there. So the notice
 *   fires when the state changes on the way *down* — into Low, or into Out —
 *   and never on the way up. Decided by `stockAlertFor`, which is pure and
 *   checked by `check:inventory`.
 * - **One notice per line per day.** A busy line can cross the mark, be
 *   restocked, and cross again; a second notice within the day tells the same
 *   admin the same thing. Deduped on the notice itself — same line, same
 *   state, same day — so it needs no table of its own.
 * - **Best effort.** This runs after the write that moved the stock, outside
 *   its transaction, and a failure here must not unwind a sale or an
 *   adjustment. It never throws.
 */

export interface StockLevelChange {
  productId: string;
  variantId: string | null;
  before: number;
  after: number;
  /** The line's own low-stock mark, where it has one. */
  threshold?: number | null;
}

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Notify admins if this change took the line into Low or Out. Safe to call
 * on every stock write; decides for itself whether there is anything to say,
 * and only touches the database when there is.
 */
export async function alertOnStockLevel(change: StockLevelChange): Promise<void> {
  try {
    const threshold = change.threshold ?? LOW_STOCK_THRESHOLD;
    const crossed = stockAlertFor(change.before, change.after, threshold);
    if (!crossed) return;

    const product = await prisma.product.findUnique({
      where: { id: change.productId },
      select: {
        name: true,
        slug: true,
        image: true,
        variants: {
          where: { id: change.variantId ?? "" },
          select: {
            id: true,
            sku: true,
            image: true,
            options: {
              select: {
                definitionId: true,
                value: true,
                valueKey: true,
                definition: { select: { label: true, unit: true, sortOrder: true } },
              },
            },
          },
        },
      },
    });
    if (!product) return;

    const variant = product.variants[0];
    const configuration = variant
      ? describeVariant({
          id: variant.id,
          sku: variant.sku,
          priceCents: 0,
          stock: 0,
          image: null,
          options: variant.options.map((option) => ({
            definitionId: option.definitionId,
            label: option.definition.label,
            unit: option.definition.unit,
            sortOrder: option.definition.sortOrder,
            value: option.value,
            valueKey: option.valueKey,
          })),
        })
      : null;
    const label = configuration ? `${product.name} · ${configuration}` : product.name;

    const title =
      crossed === "OUT"
        ? variant
          ? "Configuration sold out"
          : "Product sold out"
        : variant
          ? "Configuration running low"
          : "Product running low";
    const description =
      crossed === "OUT"
        ? `${label} is out of stock`
        : `${label} is down to ${change.after} — at or below its low-stock mark of ${threshold}`;
    // Straight to the row that can fix it, filtered to this product.
    const href = `/admin/inventory?q=${encodeURIComponent(product.slug)}`;

    // Same line, same state, within the window: already told.
    const recent = await prisma.notification.findFirst({
      where: {
        type: NotificationType.STOCK,
        title,
        href,
        description: { startsWith: `${label} is` },
        createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (recent) return;

    await notifyAdmins({
      type: NotificationType.STOCK,
      title,
      description,
      href,
      imageUrl: variant?.image ?? product.image,
    });
  } catch (error) {
    // Never let a notice break the write it follows.
    console.error("[inventory] low-stock alert failed", error);
  }
}
