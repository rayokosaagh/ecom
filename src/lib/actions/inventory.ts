"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";
import { StockChangeReason } from "@/generated/prisma/enums";
import {
  MAX_NOTE_LENGTH,
  MAX_STOCK,
  formatDelta,
  isAdjustMode,
  planAdjustment,
} from "@/lib/inventory/stock";
import {
  describeSaleChange,
  parseCompareAtInput,
  parseSaleEndInput,
  parsePriceInput,
  planPriceChange,
} from "@/lib/inventory/price";
import { formatPrice } from "@/lib/products/format";
import { alertOnStockLevel } from "@/lib/inventory/alerts";
import { planStockTake } from "@/lib/inventory/stock-take";
import { syncProductPriceFromVariants } from "@/lib/products/price-sync";

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
              select: { stock: true, lowStockAt: true, productId: true },
            })
          )
        : await tx.product.findUnique({
            where: { id: productId },
            select: { stock: true, lowStockAt: true },
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

      return { ...plan.data, lowStockAt: current.lowStockAt };
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

  // A hand adjustment that takes a line into Low or Out is as much news as a
  // sale doing it — and more easily missed, since the admin who did it may
  // not be the one who reorders. Decides for itself whether to say anything.
  await alertOnStockLevel({
    productId,
    variantId,
    before: outcome.stock - outcome.delta,
    after: outcome.stock,
    threshold: outcome.lowStockAt,
  });

  return {
    key,
    success: `${product.name}: ${formatDelta(outcome.delta)} — now ${outcome.stock} in stock.`,
  };
}

export type StockTakeState = {
  message?: string;
  success?: string;
  /** Lines that moved between the page loading and Save, by key. */
  conflicts?: string[];
};

/**
 * Apply a stock take: every counted line set to its count, in one transaction.
 *
 * The same three guarantees as `adjustStock`, for many lines at once — each
 * write goes to the row that sells, each is conditional on the level the page
 * showed, and each gets its own ledger row — plus one of its own: **all or
 * nothing**. A stock take is one act of counting, and a batch that saved
 * twenty lines and silently dropped three would leave the shelf and the book
 * agreeing on the twenty and nobody knowing about the three. So if any line
 * moved since the page loaded, the whole batch is rolled back and the admin
 * is told which lines, so they can recount those and save again.
 *
 * One reason and one note for the batch, because that is what a stock take
 * is: the same thing happened to every line — somebody counted it.
 */
export async function applyStockTake(
  _previous: StockTakeState,
  formData: FormData,
): Promise<StockTakeState> {
  const admin = await requireAdmin();

  const reasonRaw = String(formData.get("reason") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!(reasonRaw in StockChangeReason)) return { message: "Choose a reason for the count." };
  const reason = reasonRaw as StockChangeReason;
  if (note.length > MAX_NOTE_LENGTH) {
    return { message: `The note must be ${MAX_NOTE_LENGTH} characters or fewer.` };
  }

  const planned = planStockTake({
    keys: formData.getAll("key").map(String),
    expected: formData.getAll("expected").map(String),
    counted: formData.getAll("counted").map(String),
  });
  if (!planned.ok) return { message: planned.error };

  const { changes, unchanged, skipped } = planned.data;
  if (changes.length === 0) {
    return {
      success:
        unchanged > 0
          ? `Every counted line already matched — nothing to record (${unchanged} agreed, ${skipped} not counted).`
          : "No counts entered — type what the shelf holds in the Counted column.",
    };
  }

  const outcome = await prisma
    .$transaction(async (tx) => {
      const conflicts: string[] = [];
      for (const change of changes) {
        const written = change.variantId
          ? await tx.productVariant.updateMany({
              where: { id: change.variantId, productId: change.productId, stock: change.expected },
              data: { stock: change.plan.stock },
            })
          : await tx.product.updateMany({
              where: { id: change.productId, stock: change.expected },
              data: { stock: change.plan.stock },
            });
        if (written.count === 0) {
          conflicts.push(change.key);
          continue;
        }
        await tx.stockAdjustment.create({
          data: {
            productId: change.productId,
            variantId: change.variantId,
            delta: change.plan.delta,
            stockBefore: change.expected,
            stockAfter: change.plan.stock,
            reason,
            note: note || null,
            userId: admin.id,
          },
        });
      }
      // One line moved: none of them are saved. The throw rolls the
      // transaction back; the conflicts ride out on the error.
      if (conflicts.length > 0) throw new StockTakeConflict(conflicts);
      return { applied: changes.length };
    })
    .catch((error: unknown) => {
      if (error instanceof StockTakeConflict) return { conflicts: error.keys };
      throw error;
    });

  if ("conflicts" in outcome) {
    return {
      conflicts: outcome.conflicts,
      message: `${outcome.conflicts.length} line${outcome.conflicts.length === 1 ? "" : "s"} changed while you were counting — a sale or another admin got there first. Nothing was saved. The lines are marked below; reload, recount those, and save again.`,
    };
  }

  // Revalidate once for the batch, then tell admins about any line the count
  // took into Low or Out — a recount that finds the shelf emptier than the
  // book is exactly the case the notice exists for.
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/stock-take");
  revalidatePath("/admin/inventory/history");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath("/products", "layout");
  for (const change of changes) {
    await alertOnStockLevel({
      productId: change.productId,
      variantId: change.variantId,
      before: change.expected,
      after: change.plan.stock,
    });
  }

  return {
    success: `${outcome.applied} line${outcome.applied === 1 ? "" : "s"} updated${
      unchanged > 0 ? `, ${unchanged} already matched` : ""
    }${skipped > 0 ? `, ${skipped} not counted` : ""}.`,
  };
}

class StockTakeConflict extends Error {
  constructor(readonly keys: string[]) {
    super("STOCK_TAKE_CONFLICT");
  }
}

/**
 * Set a line's own low-stock mark and reorder note.
 *
 * A setting, not a movement: the level is untouched, nothing is ledgered, and
 * there is no race worth guarding — two admins setting the same mark within a
 * second is not a conflict anyone needs told about. Blank clears the mark
 * back to the shop default; the note is free text, trimmed, and cleared when
 * emptied. Written to the row that owns the units, for the reason every other
 * inventory write is — see `adjustStock`.
 */
export async function setReorderPoint(
  _previous: StockActionState,
  formData: FormData,
): Promise<StockActionState> {
  await requireAdmin();

  const productId = String(formData.get("productId") ?? "").trim();
  const variantIdRaw = String(formData.get("variantId") ?? "").trim();
  const variantId = variantIdRaw || null;
  const key = variantId ? `${productId}:${variantId}` : productId;

  const lowRaw = String(formData.get("lowStockAt") ?? "").trim();
  const note = String(formData.get("reorderNote") ?? "").trim();

  let lowStockAt: number | null = null;
  if (lowRaw) {
    const parsed = Number(lowRaw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { key, message: "The low-stock mark has to be a whole number of units." };
    }
    if (parsed > MAX_STOCK) {
      return { key, message: `The low-stock mark cannot be above ${MAX_STOCK.toLocaleString()}.` };
    }
    lowStockAt = parsed;
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return { key, message: `The note must be ${MAX_NOTE_LENGTH} characters or fewer.` };
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, slug: true },
  });
  if (!product) return { key, message: "That product no longer exists." };

  const data = { lowStockAt, reorderNote: note || null };
  const written = variantId
    ? await prisma.productVariant.updateMany({ where: { id: variantId, productId }, data })
    : await prisma.product.updateMany({ where: { id: productId }, data });
  if (written.count === 0) {
    return { key, message: "That product or configuration no longer exists." };
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/dashboard");

  return {
    key,
    success: `${product.name}: low at ${lowStockAt ?? "the shop default"}${note ? ", note saved" : ""}.`,
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
 *
 * **The regular price travels with it.** A sale is the pair — a price below a
 * higher regular price — and this is the only place either is set once a
 * product exists, so the panel posts both: the price (blank meaning "leave
 * it") and the regular price (blank meaning "not on sale"). Both are guarded
 * by the conditional update and both sides of both are ledgered, so "sale
 * started" is as readable later as "price lowered".
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
  const compareAtField = formData.get("compareAt");
  const endsAtField = formData.get("saleEndsAt");
  const note = String(formData.get("note") ?? "").trim();

  // A blank price means "keep it" — the panel can be used to start or end a
  // sale without touching the figure customers pay. Resolved against the live
  // price inside the transaction below; only the typed case is parsed here.
  const parsed = priceRaw ? parsePriceInput(priceRaw) : null;
  if (parsed && !parsed.ok) return { key, message: parsed.error };

  // Absent entirely (a form that never offered the field) keeps the standing
  // regular price; present and blank clears it — the row is not on sale.
  const parsedCompareAt =
    compareAtField === null ? null : parseCompareAtInput(String(compareAtField));
  if (parsedCompareAt && !parsedCompareAt.ok) return { key, message: parsedCompareAt.error };

  if (!parsed && !parsedCompareAt) return { key, message: "Enter a price" };

  // The sale's end, when the form offered the field. Absent keeps what is
  // stored (a caller without the field, like the End-sale button, does not
  // touch it — and ending the sale clears it anyway, below).
  const parsedEnd = endsAtField === null ? null : parseSaleEndInput(String(endsAtField));
  if (parsedEnd && !parsedEnd.ok) return { key, message: parsedEnd.error };

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
            select: {
              priceCents: true,
              compareAtPriceCents: true,
              saleEndsAt: true,
              productId: true,
            },
          })
        : await tx.product.findUnique({
            where: { id: productId },
            select: { priceCents: true, compareAtPriceCents: true, saleEndsAt: true },
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
        parsed ? parsed.cents : current.priceCents,
        parsedCompareAt ? parsedCompareAt.cents : current.compareAtPriceCents,
      );
      if (!plan.ok) throw new Error(`REFUSED:${plan.error}`);

      // Conditional on neither figure having moved. Zero rows means someone
      // else — another admin, or a flash sale opening — got there first.
      const guard = {
        priceCents: current.priceCents,
        compareAtPriceCents: current.compareAtPriceCents,
      };
      // No sale, no end date: the date only means something while the
      // regular price is set, and a leftover date would end a future sale
      // nobody scheduled.
      const saleEndsAt =
        plan.data.toCompareAtCents === null
          ? null
          : parsedEnd
            ? parsedEnd.endsAt
            : current.saleEndsAt;
      const data = {
        priceCents: plan.data.toCents,
        compareAtPriceCents: plan.data.toCompareAtCents,
        saleEndsAt,
      };
      const written = variantId
        ? await tx.productVariant.updateMany({ where: { id: variantId, ...guard }, data })
        : await tx.product.updateMany({ where: { id: productId, ...guard }, data });

      if (written.count === 0) throw new Error("CONCURRENT_UPDATE");

      await tx.priceChange.create({
        data: {
          productId,
          variantId,
          fromCents: current.priceCents,
          toCents: plan.data.toCents,
          fromCompareAtCents: current.compareAtPriceCents,
          toCompareAtCents: plan.data.toCompareAtCents,
          note: note || null,
          userId: admin.id,
        },
      });

      // The product's own column follows its cheapest configuration — see
      // lib/products/price-sync. In the same transaction, so the catalogue
      // never reads a "from" price that no configuration sells at.
      if (variantId) await syncProductPriceFromVariants(productId, tx);

      return {
        ...plan.data,
        fromCents: current.priceCents,
        fromCompareAtCents: current.compareAtPriceCents,
        saleEndsAt,
      };
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

  const saleNote = describeSaleChange(
    outcome.fromCompareAtCents,
    outcome.toCompareAtCents,
    formatPrice,
  );
  const priceNote =
    outcome.fromCents === outcome.toCents
      ? `${formatPrice(outcome.toCents)} unchanged`
      : `${formatPrice(outcome.fromCents)} → ${formatPrice(outcome.toCents)}`;

  const endNote =
    outcome.toCompareAtCents !== null && outcome.saleEndsAt
      ? ` · ends ${outcome.saleEndsAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`
      : "";

  return {
    key,
    success: `${product.name}: ${priceNote}${saleNote ? ` · ${saleNote}` : ""}${endNote}.`,
  };
}
