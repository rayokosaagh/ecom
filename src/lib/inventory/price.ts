import { MAX_PRICE_CENTS } from "@/lib/products/sale";
import { SHOP_CURRENCY } from "@/lib/money/currency";

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
  /**
   * The regular price to write — the higher figure shown crossed out while
   * the row is on sale. Null means the row is not on sale.
   */
  toCompareAtCents: number | null;
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

/**
 * Read a typed regular price into minor units, where empty means "not on
 * sale".
 *
 * The one way this differs from a price field: blank is an answer, not an
 * omission. A row with no regular price is simply not on sale.
 */
export function parseCompareAtInput(
  raw: string,
): { ok: true; cents: number | null } | { ok: false; error: string } {
  if (!raw.trim()) return { ok: true, cents: null };
  const parsed = parsePriceInput(raw);
  if (!parsed.ok) return { ok: false, error: `Regular price: ${parsed.error.toLowerCase()}` };
  return parsed;
}

export interface PriceContext {
  /** What the row costs now. */
  currentCents: number;
  /** The standing regular price, if this row is on sale. */
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
 * The change is to the price *and* its regular price together, because a
 * sale is nothing but the pair: a price below a higher regular price. Setting
 * a regular price starts one, clearing it ends one, and either on its own is
 * still a change worth recording. `nextCompareAtCents` defaults to the
 * standing value, so a caller that only has a new price behaves as it always
 * did.
 *
 * Four refusals, in the order they matter.
 *
 * **A live flash sale owns the column.** Editing through it does not fail
 * loudly — it fails quietly and much later. `lib/flash/pricing.restorePlan`
 * skips any row whose price no longer matches what the sale wrote, precisely so
 * an admin's edit is not reverted; the consequence is that this product never
 * returns to its pre-sale price when the sale closes, and keeps the "was" price
 * the sale invented, forever. That is a worse outcome than being told no.
 *
 * **A price at or above its own regular price is not a sale.** It is the rule
 * `compareAtError` already enforces on the product form, applied here so the
 * two screens cannot disagree — raising a price past the regular price would
 * leave a row sitting on the sale shelf rendering no discount.
 *
 * **A regular price that is not above the price is not a sale** — the same
 * rule from the other side, for a regular price being set or moved. The two
 * messages differ because the fix differs: one says lower the price, the other
 * says raise the regular price.
 *
 * **A no-op is refused**, for the reason the stock ledger refuses one: writing a
 * history row that says the price changed when it did not is how a ledger stops
 * being worth reading. A change to the regular price alone is not a no-op.
 */
export function planPriceChange(
  context: PriceContext,
  nextCents: number,
  nextCompareAtCents: number | null = context.compareAtCents,
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

  if (nextCompareAtCents !== null) {
    if (!Number.isInteger(nextCompareAtCents) || nextCompareAtCents < 0) {
      return { ok: false, error: "Enter a valid regular price" };
    }
    if (nextCompareAtCents > MAX_PRICE_CENTS) {
      return { ok: false, error: "That regular price is unrealistically high" };
    }
  }

  const priceMoved = nextCents !== context.currentCents;
  const compareAtMoved = nextCompareAtCents !== context.compareAtCents;

  if (!priceMoved && !compareAtMoved) {
    return {
      ok: false,
      error:
        context.compareAtCents === null
          ? "That is the current price — nothing to record"
          : "That is the current price and regular price — nothing to record",
    };
  }

  if (nextCompareAtCents !== null && nextCents >= nextCompareAtCents) {
    return {
      ok: false,
      error: compareAtMoved
        ? "The regular price has to be higher than the price — otherwise there is no discount to show. Raise it, or turn the sale off."
        : "This is on sale, and the new price is not below the regular price — which would show a discount of nothing. Lower it further, or end the sale first.",
    };
  }

  return {
    ok: true,
    data: {
      toCents: nextCents,
      deltaCents: nextCents - context.currentCents,
      toCompareAtCents: nextCompareAtCents,
    },
  };
}

/**
 * How the sale side of a change reads — or null when it did not move.
 *
 * "sale started" and "sale ended" rather than "regular price: — → Rs 10,700",
 * because that is what the change *is*; the figure is kept because a sale
 * anchored to one regular price and another anchored to a different one are
 * two different decisions. `format` is passed in so this stays free of the
 * currency module and the check script can read the shape without it.
 */
export function describeSaleChange(
  fromCents: number | null,
  toCents: number | null,
  format: (cents: number) => string,
): string | null {
  if (fromCents === toCents) return null;
  if (toCents === null) return "sale ended";
  if (fromCents === null) return `sale started, regular price ${format(toCents)}`;
  return `regular price ${format(fromCents)} → ${format(toCents)}`;
}

/**
 * Read a typed discount — "20", "20%", "12.5" — as a percentage.
 *
 * Whole or fractional, strictly between 0 and 100: 0% is not a sale and 100%
 * is free, and neither is something this panel should quietly accept.
 */
export function parsePercentInput(
  raw: string,
): { ok: true; percent: number } | { ok: false; error: string } {
  const trimmed = raw.trim().replace(/%$/, "").trim();
  if (!trimmed) return { ok: false, error: "Enter a percentage" };
  const percent = Number(trimmed);
  if (!Number.isFinite(percent)) return { ok: false, error: "Enter a valid percentage" };
  if (percent <= 0) return { ok: false, error: "The discount has to be more than 0%" };
  if (percent >= 100) return { ok: false, error: "The discount has to be less than 100%" };
  return { ok: true, percent };
}

/**
 * The price that is `percent` off a regular price.
 *
 * Rounded to the coarsest unit the currency is written in — whole rupees for
 * a currency with no fraction, cents for one that has them — so "20% off
 * Rs 2,05,800" offers Rs 1,64,640 and never Rs 1,64,640.40. The admin can
 * still tidy the figure by hand afterwards; this only stops the tool itself
 * producing a price nobody would print on a ticket.
 */
export function priceFromPercentOff(regularCents: number, percent: number): number {
  const unit = SHOP_CURRENCY.minFractionDigits === 0 ? SHOP_CURRENCY.minorUnits : 1;
  const exact = regularCents * (1 - percent / 100);
  return Math.max(0, Math.round(exact / unit) * unit);
}

/**
 * Read a typed sale end — a `datetime-local` value, or blank for "no end".
 *
 * Must be in the future: an end already passed is a sale that should not be
 * starting. Anything that does not parse is refused rather than quietly
 * dropped, because a dropped date is a sale that silently never ends.
 */
export function parseSaleEndInput(
  raw: string,
  now: Date = new Date(),
): { ok: true; endsAt: Date | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, endsAt: null };
  const endsAt = new Date(trimmed);
  if (Number.isNaN(endsAt.getTime())) return { ok: false, error: "Enter a valid end date and time" };
  if (endsAt.getTime() <= now.getTime()) {
    return { ok: false, error: "The sale's end has to be in the future" };
  }
  return { ok: true, endsAt };
}

/**
 * "7% off" for a price against its regular price, or null when there is no
 * whole percent to claim — see `saleOfRow` for why a sub-1% saving is not
 * rounded up to one. The same arithmetic as the storefront badge, so the
 * admin sees the figure customers will.
 */
export function percentOffLabel(priceCents: number, compareAtCents: number | null): string | null {
  if (compareAtCents === null || compareAtCents <= priceCents) return null;
  const percent = Math.round(((compareAtCents - priceCents) / compareAtCents) * 100);
  return percent >= 1 ? `${percent}% off` : null;
}

/** "+Rs 500" / "−Rs 500", with a real minus sign. Formatting is the caller's. */
export function priceDeltaSign(deltaCents: number): "+" | "−" {
  return deltaCents >= 0 ? "+" : "−";
}
