"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";
import { StockChangeReason } from "@/generated/prisma/enums";
import {
  MAX_NOTE_LENGTH,
  formatDelta,
  isAdjustMode,
  planAdjustment,
} from "@/lib/inventory/stock";
import { parsePriceInput, planPriceChange } from "@/lib/inventory/price";
import { formatPrice } from "@/lib/products/format";

export type StockActionState = {
  message?: string;
  success?: string;
  /** Which row the outcome belongs to, so one form's error is not shown on all. */
  key?: string;
};

/** Every surface a stock level is visible on. */
function revalidateStockViews(slug: string) {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/history");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  // Cards across the catalogue carry "out of stock", and the sold-out state
  // gates the add-to-cart button on the product page.
  revalidatePath("/products", "layout");
  revalidatePath(`/products/${slug}`);
}

/**
 * Change one stock unit's level, and record why.
 *
 * Three things make this more than an UPDATE.
 *
 * **It writes the row that actually sells.** A line with a variant owns its
 * units on the variant; a product with no variants owns its own. That is the
 * rule checkout claims by, so an adjustment that guessed differently would
 * move a number nothing decrements.
 *
 * **It refuses to overwrite a change it did not see.** The level is re-read
 * inside the transaction and the update is conditional on it not having moved.
 * A shop selling while an admin types is the ordinary case, not a rare one:
 * without the guard, a form opened when stock was 3 would write "3 + 40 = 43"
 * over a level that had since sold down to 1, silently inventing two units.
 * Losing the race reports it rather than retrying, because the right new
 * figure depends on what the other change was.
 *
 * **It records the movement and the level either side of it.** The delta alone
 * cannot be read back later without replaying every order; the two levels can.
 */
export async function adjustStock(
  _previous: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  // Re-checked against the database on every mutation, never from the JWT —
  // this function is a public POST endpoint, whatever the page renders.
  const admin = await requireAdmin();

  const productId = String(formData.get("productId") ?? "").trim();
  const variantIdRaw = String(formData.get("variantId") ?? "").trim();
  const variantId = variantIdRaw || null;
  const key = variantId ? `${productId}:${variantId}` : productId;

  const modeRaw = String(formData.get("mode") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const reasonRaw = String(formData.get("reason") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!isAdjustMode(modeRaw)) return { key, message: "Choose add, remove or set." };
  if (!amountRaw) return { key, message: "Enter a number of units." };

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount)) return { key, message: "Enter a number of units." };

  if (!(reasonRaw in StockChangeReason)) {
    return { key, message: "Choose a reason for the change." };
  }
  const reason = reasonRaw as StockChangeReason;

  if (note.length > MAX_NOTE_LENGTH) {
    return { key, message: `The note must be ${MAX_NOTE_LENGTH} characters or fewer.` };
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, slug: true },
  });
  if (!product) return { key, message: "That product no longer exists." };

  const outcome = await prisma
    .$transaction(async (tx) => {
      // The level as it is *now*, not as the page rendered it.
      const current = variantId
        ? (
            await tx.productVariant.findUnique({
              where: { id: variantId },
              select: { stock: true, productId: true },
            })
          )
        : await tx.product.findUnique({
            where: { id: productId },
            select: { stock: true },
          });

      if (!current) throw new Error("GONE");
      // A variant id from a stale page could belong to another product; writing
      // it would file the adjustment under the wrong one.
      if ("productId" in current && current.productId !== productId) throw new Error("GONE");

      const plan = planAdjustment(current.stock, modeRaw, amount);
      if (!plan.ok) throw new Error(`REFUSED:${plan.error}`);

      // Conditional on the level not having moved. Zero rows means someone
      // else — an admin or a checkout — got there first.
      const written = variantId
        ? await tx.productVariant.updateMany({
            where: { id: variantId, stock: current.stock },
            data: { stock: plan.data.stock },
          })
        : await tx.product.updateMany({
            where: { id: productId, stock: current.stock },
            data: { stock: plan.data.stock },
          });

      if (written.count === 0) throw new Error("CONCURRENT_UPDATE");

      await tx.stockAdjustment.create({
        data: {
          productId,
          variantId,
          delta: plan.data.delta,
          stockBefore: current.stock,
          stockAfter: plan.data.stock,
          reason,
          note: note || null,
          userId: admin.id,
        },
      });

      return plan.data;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      if (message === "GONE" || message === "CONCURRENT_UPDATE") return message;
      if (message.startsWith("REFUSED:")) return message;
      throw error;
    });

  if (outcome === "GONE") {
    return { key, message: "That product or configuration no longer exists." };
  }
  if (outcome === "CONCURRENT_UPDATE") {
    return {
      key,
      message:
        "Stock changed while this was open — a sale or another admin got there first. Reload to see the current level, then adjust again.",
    };
  }
  if (typeof outcome === "string") {
    return { key, message: outcome.slice("REFUSED:".length) };
  }

  revalidateStockViews(product.slug);

  return {
    key,
    success: `${product.name}: ${formatDelta(outcome.delta)} — now ${outcome.stock} in stock.`,
  };
}

/** Every surface a price is visible on. Wider than stock's: prices are cached. */
function revalidatePriceViews(slug: string) {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/history");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath("/admin/sales");
  // The catalogue sorts and range-filters on price inside Postgres, so every
  // listing can reorder from one change — not just the card that shows it.
  revalidatePath("/products", "layout");
  revalidatePath(`/products/${slug}`);
  revalidatePath("/sale");
  revalidatePath("/");
  // A basket already holding this line quotes the live price until checkout
  // snapshots it, so the cart is showing the old figure until it re-renders.
  revalidatePath("/cart");
}

/**
 * Change one stock unit's price, and record who did it.
 *
 * Built as the sibling of `adjustStock` and sharing its three guarantees — it
 * writes the row that actually charges, it refuses to overwrite a change it did
 * not see, and it records both sides of the movement. The comments there apply
 * here almost word for word; what follows is only what differs.
 *
 * **A price has an owner that stock does not.** A live flash sale holds
 * `priceCents` and puts it back when it closes, and it decides what to put back
 * by checking the column still holds what it wrote. An edit here would silently
 * opt the product out of that restore — leaving it permanently on the edited
 * price with the sale's invented "was" price beside it. So a product in a live
 * flash sale is refused, and told where to go instead.
 *
 * **The re-read is the same race, with worse consequences.** Stock losing a
 * race invents units; price losing one un-does somebody's deliberate repricing
 * without either admin seeing it happen. Same conditional update, same refusal.
 */
export async function adjustPrice(
  _previous: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  // Re-checked against the database on every mutation, never from the JWT —
  // this function is a public POST endpoint, whatever the page renders.
  const admin = await requireAdmin();

  const productId = String(formData.get("productId") ?? "").trim();
  const variantIdRaw = String(formData.get("variantId") ?? "").trim();
  const variantId = variantIdRaw || null;
  const key = variantId ? `${productId}:${variantId}` : productId;

  const priceRaw = String(formData.get("price") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  const parsed = parsePriceInput(priceRaw);
  if (!parsed.ok) return { key, message: parsed.error };

  if (note.length > MAX_NOTE_LENGTH) {
    return { key, message: `The note must be ${MAX_NOTE_LENGTH} characters or fewer.` };
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, slug: true },
  });
  if (!product) return { key, message: "That product no longer exists." };

  /**
   * Read inside the same request but outside the transaction, deliberately.
   *
   * A flash sale opening in the microseconds after this check would find the
   * price already written and simply discount from the new figure, which is
   * correct. The failure this guards against is the standing one — a sale that
   * has been live for an hour — not a photo finish.
   */
  const liveFlash = await prisma.flashSaleItem.findFirst({
    where: { productId, flashSale: { appliedAt: { not: null } } },
    select: { flashSale: { select: { name: true } } },
  });

  const outcome = await prisma
    .$transaction(async (tx) => {
      // The price as it is *now*, not as the page rendered it.
      const current = variantId
        ? await tx.productVariant.findUnique({
            where: { id: variantId },
            select: { priceCents: true, compareAtPriceCents: true, productId: true },
          })
        : await tx.product.findUnique({
            where: { id: productId },
            select: { priceCents: true, compareAtPriceCents: true },
          });

      if (!current) throw new Error("GONE");
      // A variant id from a stale page could belong to another product; writing
      // it would reprice somebody else's row.
      if ("productId" in current && current.productId !== productId) throw new Error("GONE");

      const plan = planPriceChange(
        {
          currentCents: current.priceCents,
          compareAtCents: current.compareAtPriceCents,
          inLiveFlashSale: liveFlash !== null,
          flashSaleName: liveFlash?.flashSale.name ?? null,
        },
        parsed.cents,
      );
      if (!plan.ok) throw new Error(`REFUSED:${plan.error}`);

      // Conditional on the price not having moved. Zero rows means someone
      // else — another admin, or a flash sale opening — got there first.
      const written = variantId
        ? await tx.productVariant.updateMany({
            where: { id: variantId, priceCents: current.priceCents },
            data: { priceCents: plan.data.toCents },
          })
        : await tx.product.updateMany({
            where: { id: productId, priceCents: current.priceCents },
            data: { priceCents: plan.data.toCents },
          });

      if (written.count === 0) throw new Error("CONCURRENT_UPDATE");

      await tx.priceChange.create({
        data: {
          productId,
          variantId,
          fromCents: current.priceCents,
          toCents: plan.data.toCents,
          note: note || null,
          userId: admin.id,
        },
      });

      return { ...plan.data, fromCents: current.priceCents };
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      if (message === "GONE" || message === "CONCURRENT_UPDATE") return message;
      if (message.startsWith("REFUSED:")) return message;
      throw error;
    });

  if (outcome === "GONE") {
    return { key, message: "That product or configuration no longer exists." };
  }
  if (outcome === "CONCURRENT_UPDATE") {
    return {
      key,
      message:
        "The price changed while this was open — another admin or a flash sale got there first. Reload to see the current price, then change it again.",
    };
  }
  if (typeof outcome === "string") {
    return { key, message: outcome.slice("REFUSED:".length) };
  }

  revalidatePriceViews(product.slug);

  return {
    key,
    success: `${product.name}: ${formatPrice(outcome.fromCents)} → ${formatPrice(outcome.toCents)}.`,
  };
}
