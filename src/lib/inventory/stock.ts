import { StockChangeReason } from "@/generated/prisma/enums";

/**
 * The arithmetic and vocabulary of stock, with no Prisma import.
 *
 * Pure so the admin form, the server action and `check:inventory` all judge an
 * adjustment by the same rules. The action is the boundary that matters — a
 * server action is a public POST endpoint, so the form refusing something is
 * not what makes it refused — but both calling the same function is what stops
 * the two from disagreeing about what "remove 3" means.
 */

/** At or below this, a stocked line is worth flagging. Zero is its own state. */
export const LOW_STOCK_THRESHOLD = 5;

/**
 * Upper bound on any stock level.
 *
 * Not a business rule so much as a typo catch: an extra keystroke turning 40
 * into 400000 is a mistake nobody notices until the shop oversells, and no
 * shop this schema describes holds ten million of anything.
 */
export const MAX_STOCK = 1_000_000;

/** Longest note that can be attached to an adjustment. */
export const MAX_NOTE_LENGTH = 200;

/**
 * How a line is doing, in the three states worth acting on differently.
 *
 * `OUT` is a listing losing sales right now; `LOW` is a reorder to schedule.
 * Keeping them apart rather than shading one number is the same decision the
 * overview's "needs attention" card makes.
 */
export type StockState = "OUT" | "LOW" | "IN";

export function stockState(stock: number, threshold = LOW_STOCK_THRESHOLD): StockState {
  if (stock <= 0) return "OUT";
  if (stock <= threshold) return "LOW";
  return "IN";
}

/**
 * Which state a fall crossed into, or null when there is nothing to tell
 * anyone.
 *
 * The rule behind the low-stock notices (lib/inventory/alerts): a notice is
 * for a *crossing* on the way down — into Low, or into Out — never for a
 * level, and never for a rise. A line that goes 7 → 2 crossed into Low; one
 * that goes 2 → 1 did not cross anything; one that goes 0 → 3 is a rise.
 * Pure, so the checks can walk the table of cases without a database.
 */
export function stockAlertFor(
  before: number,
  after: number,
  threshold: number = LOW_STOCK_THRESHOLD,
): Extract<StockState, "LOW" | "OUT"> | null {
  if (after >= before) return null;
  const from = stockState(before, threshold);
  const to = stockState(after, threshold);
  if (to === "IN" || to === from) return null;
  return to;
}

export const STOCK_STATE_LABELS: Record<StockState, string> = {
  OUT: "Out of stock",
  LOW: "Low stock",
  IN: "In stock",
};

/** What the admin said they were doing. Stored, and shown in the history. */
export const REASON_LABELS: Record<StockChangeReason, string> = {
  [StockChangeReason.RECEIVED]: "Delivery received",
  [StockChangeReason.RECOUNT]: "Recount",
  [StockChangeReason.DAMAGED]: "Damaged",
  [StockChangeReason.LOST]: "Lost",
  [StockChangeReason.RETURNED]: "Returned",
  [StockChangeReason.OTHER]: "Other",
};

/**
 * Reasons offered for each direction.
 *
 * A delivery cannot reduce stock and damage cannot increase it, so offering
 * every reason for every move invites a row that reads "removed 5 — delivery
 * received". `RECOUNT` and `OTHER` belong to both: a count can land either
 * side of what was recorded.
 */
export const REASONS_FOR_ADDING: StockChangeReason[] = [
  StockChangeReason.RECEIVED,
  StockChangeReason.RETURNED,
  StockChangeReason.RECOUNT,
  StockChangeReason.OTHER,
];

export const REASONS_FOR_REMOVING: StockChangeReason[] = [
  StockChangeReason.DAMAGED,
  StockChangeReason.LOST,
  StockChangeReason.RECOUNT,
  StockChangeReason.OTHER,
];

/**
 * How the number typed into the form is meant.
 *
 * `set` exists because a recount is not an arithmetic problem: the person
 * holding the shelf knows there are 12, and making them work out that 12 is
 * "remove 3" is how the wrong figure gets saved. `add`/`remove` exist because a
 * delivery is genuinely relative, and computing the new total by hand while
 * the shop is still selling is a race with itself.
 */
export type AdjustMode = "add" | "remove" | "set";

export function isAdjustMode(value: string): value is AdjustMode {
  return value === "add" || value === "remove" || value === "set";
}

export type Adjustment = {
  /** The level to write. */
  stock: number;
  /** Signed change, for the ledger. */
  delta: number;
};

/**
 * What an adjustment would do, or why it cannot be made.
 *
 * Removing more than is there is **refused, not clamped**. Clamping to zero
 * would record a delta that never happened and quietly agree with a figure the
 * admin has just shown to be wrong — if the shelf holds fewer than the database
 * says, the honest move is to recount and set the real number, which is exactly
 * what `set` is for. The error says so rather than only reporting the failure.
 *
 * A no-op is refused for a different reason: "set to 12" when it is already 12
 * would write a history row saying stock changed when nothing did, and a ledger
 * that logs non-events is one nobody reads.
 */
export function planAdjustment(
  current: number,
  mode: AdjustMode,
  amount: number,
): { ok: true; data: Adjustment } | { ok: false; error: string } {
  if (!Number.isInteger(amount)) {
    return { ok: false, error: "Enter a whole number of units" };
  }
  if (amount < 0) {
    return {
      ok: false,
      error: "Enter a positive number — the direction comes from the button, not the sign",
    };
  }

  const stock = mode === "set" ? amount : mode === "add" ? current + amount : current - amount;

  if (stock < 0) {
    return {
      ok: false,
      error: `Only ${current} in stock, so ${amount} cannot be removed. If the shelf really holds fewer, set the counted figure instead.`,
    };
  }
  if (stock > MAX_STOCK) {
    return { ok: false, error: `Stock cannot go above ${MAX_STOCK.toLocaleString()}` };
  }
  if (stock === current) {
    return { ok: false, error: `Stock is already ${current} — nothing to record` };
  }

  return { ok: true, data: { stock, delta: stock - current } };
}

/** "+12" / "−3", with a real minus sign. */
export function formatDelta(delta: number): string {
  return delta >= 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}
