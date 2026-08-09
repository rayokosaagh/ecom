import type { Validated } from "@/lib/auth/validation";
import { MAX_PERCENT_OFF, MIN_PERCENT_OFF } from "@/lib/flash/pricing";

/**
 * Flash sale form rules, hand-rolled in the style of `parseDiscount`.
 *
 * The awkward cases are all about a sale that is saveable but cannot ever run:
 * a window that closes before it opens, one that has already ended, 0% off.
 * Each is refused at the point of writing rather than left to produce a sale
 * that quietly never appears.
 */

export const MAX_NAME_LENGTH = 60;

export type FlashSaleInput = {
  name: string;
  percentOff: number;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
};

const INVALID = Symbol("invalid-date");

/**
 * `datetime-local` submits "2026-08-07T18:30" with no zone, which `new Date`
 * reads in the *server's* zone. That is the right reading here: an admin
 * scheduling a sale is thinking in the shop's local time, not UTC.
 */
function toDate(raw: string): Date | null | typeof INVALID {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? INVALID : date;
}

/**
 * @param now Injected so the "already over" rule can be exercised without
 *   waiting, and so validation and the reconciler can agree on one instant.
 */
export function parseFlashSale(
  formData: FormData,
  now: Date = new Date(),
): Validated<FlashSaleInput> {
  const errors: Record<string, string> = {};

  const name = String(formData.get("name") ?? "").trim();
  if (!name) errors.name = "Give the sale a name";
  else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Names must be ${MAX_NAME_LENGTH} characters or fewer`;
  }

  const percentOff = Number(String(formData.get("percentOff") ?? "").trim());
  if (
    !Number.isInteger(percentOff) ||
    percentOff < MIN_PERCENT_OFF ||
    percentOff > MAX_PERCENT_OFF
  ) {
    errors.percentOff = `Enter a whole percentage between ${MIN_PERCENT_OFF} and ${MAX_PERCENT_OFF}`;
  }

  const startsAt = toDate(String(formData.get("startsAt") ?? ""));
  const endsAt = toDate(String(formData.get("endsAt") ?? ""));

  // Both required, unlike a discount code's optional window. A flash sale is an
  // event: an open-ended one is just the standing sale feature, which already
  // exists on the product form.
  if (startsAt === INVALID) errors.startsAt = "Enter a valid date and time";
  else if (startsAt === null) errors.startsAt = "Choose when the sale opens";

  if (endsAt === INVALID) errors.endsAt = "Enter a valid date and time";
  else if (endsAt === null) errors.endsAt = "Choose when the sale closes";

  if (startsAt instanceof Date && endsAt instanceof Date) {
    if (endsAt.getTime() <= startsAt.getTime()) {
      errors.endsAt = "The close must come after the open";
    } else if (endsAt.getTime() <= now.getTime()) {
      // Refused rather than saved-and-ignored. A sale whose window is already
      // behind us can never apply a price, so saving one silently produces a
      // row that looks scheduled and will never do anything.
      errors.endsAt = "That window has already passed";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      name,
      percentOff,
      startsAt: startsAt as Date,
      endsAt: endsAt as Date,
      // An unchecked checkbox submits nothing at all.
      active: formData.get("active") === "on",
    },
  };
}
