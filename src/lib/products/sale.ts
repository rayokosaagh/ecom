/**
 * What it means for something to be on sale.
 *
 * The model in one line: **`priceCents` is always the price actually charged,
 * and `compareAtPriceCents` is what it used to be.** A sale is not a second
 * price that readers have to remember to prefer — it is the current price,
 * lowered, with the old figure kept alongside for the "was" line.
 *
 * That direction is the whole reason this feature does not touch the money
 * path. The cart prices a line from `priceCents`, checkout claims stock and
 * snapshots `priceCents` onto the order, and the catalogue sorts and filters on
 * `priceCents` inside Postgres. All of that keeps working untouched, because
 * the column they read is still the real one. Nothing here can make the shelf
 * disagree with the till.
 *
 * It also composes with `DiscountCode` without double-counting: a code comes
 * off the basket subtotal, which is already built from sale prices.
 *
 * Pure, with no Prisma import, so the admin form validates against exactly the
 * rules the storefront displays. `npm run check:sales` exercises them.
 */

/** Upper bound on a "was" price, matching the ceiling `parseProduct` puts on price. */
export const MAX_PRICE_CENTS = 1_000_000 * 100;

export interface SaleView {
  /** What it used to cost. Always greater than `priceCents`. */
  compareAtCents: number;
  /** What it costs now — the figure that is actually charged. */
  priceCents: number;
  /** Money off, in cents. */
  savingCents: number;
  /**
   * Whole percent off, rounded.
   *
   * Can legitimately be 0 for a saving under half a percent. Reported honestly
   * rather than floored to 1: a badge that rounds $0.40 off $1,000 up to "1%
   * off" is a claim about a discount that was not given. Callers rendering a
   * percentage badge should require `percentOff >= 1`; the "was / now" pair is
   * true at any size and is what carries the real information.
   */
  percentOff: number;
}

/** Only the fields the decision needs, so any caller can pass its own row. */
export type Priced = {
  priceCents: number;
  compareAtPriceCents?: number | null;
};

/**
 * The sale on one row, or null when there is not one.
 *
 * A `compareAtPriceCents` at or below the price is not a discount — it is an
 * admin mid-edit, or a sale that ended by the price rising back. Either way it
 * must not render as "was $10, now $10", so it is treated as absent.
 */
function saleOfRow(row: Priced): SaleView | null {
  const compareAtCents = row.compareAtPriceCents;
  if (compareAtCents == null) return null;
  if (compareAtCents <= row.priceCents) return null;

  const savingCents = compareAtCents - row.priceCents;

  return {
    compareAtCents,
    priceCents: row.priceCents,
    savingCents,
    percentOff: Math.round((savingCents / compareAtCents) * 100),
  };
}

/**
 * The sale a product advertises, across whatever it is sold as.
 *
 * For a configurable product this deliberately reads the *cheapest* variant —
 * the same row `priceRange` takes its `minCents` from. The two have to agree:
 * a card showing "from $500" beside a "was $900" taken from some other
 * configuration would be quoting a discount nobody can actually buy.
 *
 * Mirrors `priceRange`'s contract in the other direction too: a product with no
 * variants uses its own figures, so nothing changes for a product that was
 * never configurable.
 */
export function saleFor(product: Priced, variants: Priced[] = []): SaleView | null {
  if (variants.length === 0) return saleOfRow(product);

  const cheapest = variants.reduce((best, variant) =>
    variant.priceCents < best.priceCents ? variant : best,
  );

  return saleOfRow(cheapest);
}

/** Convenience for callers that only need the yes/no. */
export function isOnSale(product: Priced, variants: Priced[] = []): boolean {
  return saleFor(product, variants) !== null;
}

/**
 * Whether a submitted "was" price is usable, as a message or null.
 *
 * Shared by the product form and the variant rows so the rule is stated once —
 * `parseProduct` and `parseVariants` both reject on the same grounds, and
 * neither can drift into accepting something the storefront would then refuse
 * to render as a sale.
 *
 * @param compareAtCents Null when the field was left blank, which is how a sale
 *   is ended and is always allowed.
 */
export function compareAtError(
  priceCents: number,
  compareAtCents: number | null,
): string | null {
  if (compareAtCents === null) return null;

  if (!Number.isInteger(compareAtCents) || compareAtCents < 0) {
    return "Enter a valid “was” price";
  }
  if (compareAtCents > MAX_PRICE_CENTS) {
    return "That “was” price is unrealistically high";
  }
  // Equal is refused as well as lower: it is not a sale, and storing it would
  // put a row on the sale shelf that renders no discount.
  //
  // The message says which field is which, because the mistake this catches is
  // almost always the two being entered the other way round — Price is the new,
  // reduced figure, and this one is the old, higher one.
  if (compareAtCents <= priceCents) {
    return "“Was” must be higher than Price. Price is the new, reduced figure; “Was” is what it cost before";
  }

  return null;
}

/**
 * Why a "was" price that has been set is showing no discount.
 *
 * `null` when there is nothing wrong — either a sale is running, or no "was"
 * price is set anywhere and none was meant to be.
 *
 * This exists because "no discount is showing" has two quite different causes
 * and the admin screen was reporting only one of them. Telling someone their
 * "was" price is not above the price, when they can see perfectly well that it
 * is, sends them to check the wrong thing.
 */
export type SaleProblem =
  /** The figures are the wrong way round, or equal. */
  | "NOT_ABOVE_PRICE"
  /**
   * Set on the product, but the product is priced by its configurations — so
   * `saleFor` reads a variant, and the product's own "was" price is ignored.
   */
  | "SET_ON_PRODUCT_NOT_VARIANT";

export function saleProblem(product: Priced, variants: Priced[] = []): SaleProblem | null {
  // A running sale is not a problem, whatever else is set.
  if (saleFor(product, variants)) return null;

  const productHasCompareAt = product.compareAtPriceCents != null;
  const anyVariantHasCompareAt = variants.some(
    (variant) => variant.compareAtPriceCents != null,
  );

  // Nothing set anywhere: not on sale, and not meant to be.
  if (!productHasCompareAt && !anyVariantHasCompareAt) return null;

  if (variants.length > 0 && productHasCompareAt && !anyVariantHasCompareAt) {
    return "SET_ON_PRODUCT_NOT_VARIANT";
  }

  return "NOT_ABOVE_PRICE";
}
