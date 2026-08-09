import { MAX_PRICE_CENTS } from "@/lib/products/sale";

export { MAX_NOTE_LENGTH } from "@/lib/inventory/stock";

/**
 * What a manual price change is allowed to do.
 *
 * The sibling of `lib/inventory/stock`, and pure for the same reason: the panel
 * on the inventory page previews with the identical function the action writes
 * with, so "Rs 10,700 → Rs 9,900" is the calculation that will happen rather
 * than a guess at it. `npm run check:price` exercises the rules directly.
 *
 * The interesting part is not the arithmetic — it is the two things a price is
 * entangled with that a stock level is not. A standing sale means the row also
 * carries a "was" price that has to stay above it, and a live flash sale means
 * something else already owns the column. Both are refusals rather than
 * silent corrections, because in each case the right answer depends on what the
 * admin actually meant and only they know that.
 */

export type PriceChangePlan = {
  /** The price to write, in minor units. */
  toCents: number;
  /** Signed change, for the ledger and the preview. */
  deltaCents: number;
};

/**
 * Read a typed price into minor units.
 *
 * Money is entered in major units and stored in minor ones, the same as
 * `parseProduct` — this is that rule, extracted so both the panel and the
 * action can apply it without going through the whole product form.
 *
 * Grouping separators are stripped first: a price copied out of the table above
 * arrives as "10,700", and rejecting it would be rejecting the app's own
 * output. A bare "." or a second one still fails, because `Number` says so.
 */
export function parsePriceInput(
  raw: string,
): { ok: true; cents: number } | { ok: false; error: string } {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!trimmed) return { ok: false, error: "Enter a price" };

  const major = Number(trimmed);
  if (!Number.isFinite(major)) return { ok: false, error: "Enter a valid price" };
  if (major < 0) return { ok: false, error: "A price cannot be negative" };

  const cents = Math.round(major * 100);
  if (cents > MAX_PRICE_CENTS) {
    return { ok: false, error: "That price is unrealistically high" };
  }

  return { ok: true, cents };
}

export interface PriceContext {
  /** What the row costs now. */
  currentCents: number;
  /** The standing "was" price, if this row is on sale. */
  compareAtCents: number | null;
  /**
   * Whether a flash sale is currently holding this product's prices.
   *
   * Not a property of the row itself, which is exactly the problem — the
   * column looks perfectly ordinary while something else owns it.
   */
  inLiveFlashSale: boolean;
  /** Named in the refusal, so the admin knows where to go instead. */
  flashSaleName?: string | null;
}

/**
 * What a price change would do, or why it cannot be made.
 *
 * Three refusals, in the order they matter.
 *
 * **A live flash sale owns the column.** Editing through it does not fail
 * loudly — it fails quietly and much later. `lib/flash/pricing.restorePlan`
 * skips any row whose price no longer matches what the sale wrote, precisely so
 * an admin's edit is not reverted; the consequence is that this product never
 * returns to its pre-sale price when the sale closes, and keeps the "was" price
 * the sale invented, forever. That is a worse outcome than being told no.
 *
 * **A price at or above its own "was" price is not a sale.** It is the rule
 * `compareAtError` already enforces on the product form, applied here so the
 * two screens cannot disagree — raising a price past the compare-at would leave
 * a row sitting on the sale shelf rendering no discount.
 *
 * **A no-op is refused**, for the reason the stock ledger refuses one: writing a
 * history row that says the price changed when it did not is how a ledger stops
 * being worth reading.
 */
export function planPriceChange(
  context: PriceContext,
  nextCents: number,
): { ok: true; data: PriceChangePlan } | { ok: false; error: string } {
  if (context.inLiveFlashSale) {
    const named = context.flashSaleName ? `“${context.flashSaleName}”` : "A flash sale";
    return {
      ok: false,
      error: `${named} is holding this product's price right now. Change it there, or wait until the sale ends — editing it here would stop the price going back when the sale closes.`,
    };
  }

  if (!Number.isInteger(nextCents) || nextCents < 0) {
    return { ok: false, error: "Enter a valid price" };
  }
  if (nextCents > MAX_PRICE_CENTS) {
    return { ok: false, error: "That price is unrealistically high" };
  }

  if (nextCents === context.currentCents) {
    return { ok: false, error: "That is the current price — nothing to record" };
  }

  if (context.compareAtCents !== null && nextCents >= context.compareAtCents) {
    return {
      ok: false,
      error:
        "This is on sale, and the new price is not below the “was” price — which would show a discount of nothing. Lower it further, or end the sale first.",
    };
  }

  return {
    ok: true,
    data: { toCents: nextCents, deltaCents: nextCents - context.currentCents },
  };
}

/** "+Rs 500" / "−Rs 500", with a real minus sign. Formatting is the caller's. */
export function priceDeltaSign(deltaCents: number): "+" | "−" {
  return deltaCents >= 0 ? "+" : "−";
}
