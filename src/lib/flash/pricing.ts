/**
 * What a flash sale does to a price, and how it is undone.
 *
 * The whole feature rests on one decision: a flash sale **writes real prices**
 * rather than computing a discount at render time. `lib/products/sale` explains
 * why at length, and it applies here word for word — the cart prices a line
 * from `priceCents`, checkout snapshots `priceCents` onto the order, and the
 * catalogue sorts and range-filters on `priceCents` inside Postgres. A price
 * that existed only in a render would leave all three quoting the old figure
 * while the shelf advertised the new one.
 *
 * So the flash sale lowers the column, and puts it back afterwards. This module
 * is the arithmetic and the bookkeeping for that; `lib/flash/service` performs
 * the writes.
 *
 * Two things make the undo trustworthy:
 *
 *  1. **Every priced row is captured, not just the product's.** A product with
 *     variants is charged at `variant.priceCents` whenever a variant is chosen
 *     (`lib/cart/service`), so writing only the product row would leave the till
 *     on the old price for exactly the products most likely to be in a sale.
 *  2. **What was written is recorded alongside what was there before.** On the
 *     way out, a row whose price no longer matches what this sale wrote was
 *     changed by an admin while the sale was live, and restoring the old figure
 *     would silently revert their edit. Those rows are left alone.
 *
 * Pure, with no Prisma import, so the admin screen can show exactly the prices
 * the server will write. `npm run check:flash` exercises the rules directly.
 */

/** Below 100 because a free product is a bug, not a promotion. */
export const MIN_PERCENT_OFF = 1;
export const MAX_PERCENT_OFF = 90;

/** A row that carries a price: a product, or one of its variants. */
export interface PricedRow {
  id: string;
  priceCents: number;
  compareAtPriceCents: number | null;
}

/** One row's before-and-after, as stored in `FlashSaleItem.priceSnapshot`. */
export interface SnapshotRow {
  id: string;
  /** What the row cost before the sale opened. */
  fromCents: number;
  /** What the sale wrote. Restoring checks the row still holds this. */
  toCents: number;
  /** The "was" price the row carried before, so it can be put back exactly. */
  fromCompareAtCents: number | null;
}

/**
 * Everything one flash sale item overwrote.
 *
 * `product` and `variants` are kept apart rather than flattened into one list
 * because they are written back to different tables, and a flattened list would
 * have to carry a discriminator that says which — the same information, less
 * obviously.
 */
export interface PriceSnapshot {
  product: SnapshotRow | null;
  variants: SnapshotRow[];
}

/** A single price write, ready to hand to Prisma. */
export interface PriceWrite {
  id: string;
  priceCents: number;
  compareAtPriceCents: number | null;
}

export interface ApplyPlan {
  product: PriceWrite | null;
  variants: PriceWrite[];
  snapshot: PriceSnapshot;
}

export interface RestorePlan {
  product: PriceWrite | null;
  variants: PriceWrite[];
  /** Rows left untouched because an admin changed them while the sale ran. */
  skipped: number;
}

/**
 * The reduced price, in cents.
 *
 * Rounded rather than floored, so the discount a shopper is shown is the one
 * they get to the nearest cent in both directions. Never below 1: a product
 * priced at a cent and discounted 90% would otherwise land on zero, and a free
 * line item breaks assumptions well outside this feature.
 */
export function flashPriceCents(priceCents: number, percentOff: number): number {
  const reduced = Math.round((priceCents * (100 - percentOff)) / 100);
  return Math.max(1, reduced);
}

/**
 * Whether a row is worth writing at all.
 *
 * A row already at or below what the discount would produce gets left alone.
 * Writing it would either be a no-op or — for a product already discounted
 * further by hand — an increase, and a "sale" that raises a price is the single
 * worst outcome this module could produce.
 */
function worthWriting(row: PricedRow, percentOff: number): boolean {
  if (row.priceCents <= 0) return false;
  return flashPriceCents(row.priceCents, percentOff) < row.priceCents;
}

function writeFor(row: PricedRow, percentOff: number): { write: PriceWrite; snap: SnapshotRow } {
  const toCents = flashPriceCents(row.priceCents, percentOff);

  return {
    write: {
      id: row.id,
      priceCents: toCents,
      // The "was" becomes what it cost immediately before the sale, replacing
      // any standing compare-at.
      //
      // That is deliberate and it is the honest reading. Keeping an older, higher
      // list price would make the card advertise a bigger percentage than the
      // flash sale is actually giving — the badge would say 20% and the card 36%,
      // for the same product, on the same screen. "Was $80, now $64" is true: it
      // was $80 an hour ago. The original compare-at is preserved in the
      // snapshot and restored on the way out, so nothing is lost.
      compareAtPriceCents: row.priceCents,
    },
    snap: {
      id: row.id,
      fromCents: row.priceCents,
      toCents,
      fromCompareAtCents: row.compareAtPriceCents,
    },
  };
}

/**
 * What to write when a flash sale opens over one product.
 *
 * @param product The product's own row.
 * @param variants Its variants, if it has any. Both are written: a cart line
 *   with no variant is charged the product's price, one with a variant is
 *   charged the variant's, so leaving either alone leaves a live wrong price.
 */
export function applyPlan(
  product: PricedRow,
  variants: PricedRow[],
  percentOff: number,
): ApplyPlan {
  const plan: ApplyPlan = {
    product: null,
    variants: [],
    snapshot: { product: null, variants: [] },
  };

  if (worthWriting(product, percentOff)) {
    const { write, snap } = writeFor(product, percentOff);
    plan.product = write;
    plan.snapshot.product = snap;
  }

  for (const variant of variants) {
    if (!worthWriting(variant, percentOff)) continue;
    const { write, snap } = writeFor(variant, percentOff);
    plan.variants.push(write);
    plan.snapshot.variants.push(snap);
  }

  return plan;
}

/**
 * Whether an apply plan would change anything.
 *
 * An item that writes nothing is not an error — it is a product already cheaper
 * than the sale would make it — but the admin screen needs to be able to say so
 * rather than implying a discount that will not appear.
 */
export function planIsEmpty(plan: ApplyPlan): boolean {
  return plan.product === null && plan.variants.length === 0;
}

/**
 * The current price of a row, as far as the snapshot is concerned.
 *
 * Split out so `restorePlan` reads the same way for products and variants.
 */
function restoreRow(snap: SnapshotRow, current: PricedRow | undefined): PriceWrite | null {
  // The row is gone — a variant deleted while the sale ran. Nothing to put back.
  if (!current) return null;

  // Someone edited this price after the sale wrote it. Their figure is the
  // newer intent, and restoring ours would quietly undo it.
  if (current.priceCents !== snap.toCents) return null;

  return {
    id: snap.id,
    priceCents: snap.fromCents,
    compareAtPriceCents: snap.fromCompareAtCents,
  };
}

/**
 * What to write when a flash sale closes.
 *
 * Driven by the snapshot rather than by recomputing the discount: the percentage
 * may have been edited since, and the only figure that can be trusted to restore
 * is the one actually recorded on the way in.
 *
 * @param current The rows as they stand now, keyed by id, so each can be checked
 *   against what the sale wrote before being overwritten.
 */
export function restorePlan(
  snapshot: PriceSnapshot,
  current: { product: PricedRow | null; variants: PricedRow[] },
): RestorePlan {
  const plan: RestorePlan = { product: null, variants: [], skipped: 0 };

  if (snapshot.product) {
    const write = restoreRow(snapshot.product, current.product ?? undefined);
    if (write) plan.product = write;
    else plan.skipped++;
  }

  const byId = new Map(current.variants.map((variant) => [variant.id, variant]));
  for (const snap of snapshot.variants) {
    const write = restoreRow(snap, byId.get(snap.id));
    if (write) plan.variants.push(write);
    else plan.skipped++;
  }

  return plan;
}

/**
 * Read a snapshot back off the JSON column.
 *
 * Defensive because the column is `Json`: Prisma types it as `JsonValue`, which
 * says nothing about the shape, and a row written by an older version of this
 * module must not throw its way into a request. An unreadable snapshot returns
 * null, which `service` treats as "nothing to restore" — the prices stay as they
 * are rather than being guessed at.
 */
export function readSnapshot(value: unknown): PriceSnapshot | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as { product?: unknown; variants?: unknown };
  const variants = Array.isArray(raw.variants)
    ? raw.variants.filter(isSnapshotRow)
    : [];
  const product = isSnapshotRow(raw.product) ? raw.product : null;

  if (!product && variants.length === 0) return null;

  return { product, variants };
}

function isSnapshotRow(value: unknown): value is SnapshotRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    Number.isInteger(row.fromCents) &&
    Number.isInteger(row.toCents) &&
    (row.fromCompareAtCents === null || Number.isInteger(row.fromCompareAtCents))
  );
}

/**
 * Whether a sale's window and switch say it should be live at a given moment.
 *
 * Takes `now` rather than reading the clock, so the reconciler, the admin screen
 * and the check script all decide with the same instant — and so the rule can be
 * exercised at any point in a window without waiting for one.
 */
export function shouldBeLive(
  sale: { startsAt: Date; endsAt: Date; active: boolean },
  now: Date,
): boolean {
  if (!sale.active) return false;
  const at = now.getTime();
  return at >= sale.startsAt.getTime() && at < sale.endsAt.getTime();
}
