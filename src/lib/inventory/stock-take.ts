import { MAX_STOCK, planAdjustment, type Adjustment } from "@/lib/inventory/stock";

/**
 * The arithmetic of a stock take, with no Prisma import.
 *
 * A stock take is many "set" adjustments decided at once: for every line on
 * the page the admin either types what the shelf holds or leaves the box
 * blank. This module turns what the form posted into the list of changes to
 * make, judged line by line by the same `planAdjustment` a single adjustment
 * goes through — so a count of 40 on a line at 40 is a no-op here exactly as
 * it is there, and a negative figure is refused for the same reason.
 *
 * The server action applies the list in one transaction; this decides what
 * is on the list.
 */

/** Most lines one stock take may carry — a page of counting, not a catalogue. */
export const MAX_STOCK_TAKE_LINES = 200;

export interface StockTakeLine {
  key: string;
  productId: string;
  variantId: string | null;
  /** The level the page showed when the count was typed. */
  expected: number;
  /** What the shelf holds. */
  counted: number;
  /** The resulting write, as `planAdjustment` sees it. */
  plan: Adjustment;
}

export interface StockTakePlan {
  /** Lines whose count differs from the level shown — the writes to make. */
  changes: StockTakeLine[];
  /** Lines counted equal to what was shown — nothing to record. */
  unchanged: number;
  /** Lines left blank — not counted this time. */
  skipped: number;
}

/**
 * Turn the posted grid into a plan, or say what is wrong with it.
 *
 * The three arrays are index-aligned and always the same length — the form
 * posts every row, blank counts included, so a row-major mismatch cannot
 * silently shift a count onto the wrong line; if the lengths disagree, the
 * whole batch is refused rather than guessed at.
 */
export function planStockTake(input: {
  keys: string[];
  expected: string[];
  counted: string[];
}): { ok: true; data: StockTakePlan } | { ok: false; error: string } {
  const { keys, expected, counted } = input;

  if (keys.length !== expected.length || keys.length !== counted.length) {
    return { ok: false, error: "The stock take did not post cleanly — reload and count again." };
  }
  if (keys.length === 0) return { ok: false, error: "Nothing to count on this page." };
  if (keys.length > MAX_STOCK_TAKE_LINES) {
    return {
      ok: false,
      error: `At most ${MAX_STOCK_TAKE_LINES} lines in one stock take — narrow the filter.`,
    };
  }

  const changes: StockTakeLine[] = [];
  let unchanged = 0;
  let skipped = 0;
  const seen = new Set<string>();

  for (let index = 0; index < keys.length; index++) {
    const key = keys[index].trim();
    const [productId, variantId = null] = key.split(":");
    if (!productId) return { ok: false, error: "A line on the page had no identity — reload." };
    if (seen.has(key)) return { ok: false, error: "A line appears twice on the page — reload." };
    seen.add(key);

    const typed = counted[index].trim();
    if (typed === "") {
      skipped++;
      continue;
    }

    const before = Number(expected[index]);
    if (!Number.isInteger(before) || before < 0 || before > MAX_STOCK) {
      return { ok: false, error: "A line's shown level was not a valid number — reload." };
    }

    const count = Number(typed);
    if (!Number.isFinite(count)) {
      return { ok: false, error: `“${typed}” is not a number of units.` };
    }

    const plan = planAdjustment(before, "set", count);
    if (!plan.ok) {
      // "Already N — nothing to record" is not an error on a stock take: it is
      // a shelf that agrees with the book, which is the good outcome.
      if (count === before) {
        unchanged++;
        continue;
      }
      return { ok: false, error: plan.error };
    }

    changes.push({ key, productId, variantId, expected: before, counted: count, plan: plan.data });
  }

  return { ok: true, data: { changes, unchanged, skipped } };
}
