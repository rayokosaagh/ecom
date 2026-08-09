import type { Validated } from "@/lib/auth/validation";
import { normalizeCode } from "@/lib/discounts/keys";
import { DiscountKind } from "@/generated/prisma/enums";

/**
 * Discount code rules, hand-rolled in the style of the other validators here.
 *
 * The awkward cases are all about a code that is technically saveable but
 * cannot ever pay out: 0% off, a fixed amount of nothing, a window that closes
 * before it opens. Each is rejected at the point of writing rather than left
 * to confuse a shopper who types it in.
 */

export const CODE_MAX = 24;
/** Anything a person could read off a poster and retype without ambiguity. */
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]*$/;

export type DiscountInput = {
  code: string;
  kind: DiscountKind;
  value: number;
  minSubtotalCents: number;
  maxDiscountCents: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  oncePerCustomer: boolean;
  active: boolean;
};

/** Money arrives as a decimal string; store minor units. */
function toCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return NaN;
  return Math.round(amount * 100);
}

function toDate(raw: string): Date | null | typeof INVALID {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? INVALID : date;
}

const INVALID = Symbol("invalid-date");

export function parseDiscount(formData: FormData): Validated<DiscountInput> {
  const errors: Record<string, string> = {};

  const code = normalizeCode(String(formData.get("code") ?? ""));
  const kind =
    String(formData.get("kind") ?? "") === DiscountKind.FIXED
      ? DiscountKind.FIXED
      : DiscountKind.PERCENT;

  if (!code) errors.code = "Give the code something to type";
  else if (code.length > CODE_MAX) {
    errors.code = `Codes must be ${CODE_MAX} characters or fewer`;
  } else if (!CODE_PATTERN.test(code)) {
    errors.code = "Letters, numbers and hyphens only";
  }

  // Percent is a whole number of percent; fixed is money.
  let value = 0;
  if (kind === DiscountKind.PERCENT) {
    value = Number(String(formData.get("percent") ?? "").trim());
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      errors.value = "Enter a whole percentage between 1 and 100";
    }
  } else {
    const cents = toCents(String(formData.get("amount") ?? ""));
    if (cents === null || Number.isNaN(cents) || cents < 1) {
      errors.value = "Enter an amount greater than zero";
    } else {
      value = cents;
    }
  }

  const minCents = toCents(String(formData.get("minSubtotal") ?? ""));
  if (minCents !== null && Number.isNaN(minCents)) {
    errors.minSubtotal = "Enter a valid amount";
  }

  const maxCents = toCents(String(formData.get("maxDiscount") ?? ""));
  if (maxCents !== null && (Number.isNaN(maxCents) || maxCents < 1)) {
    errors.maxDiscount = "Enter a valid amount";
  }

  const startsAt = toDate(String(formData.get("startsAt") ?? ""));
  const endsAt = toDate(String(formData.get("endsAt") ?? ""));
  if (startsAt === INVALID) errors.startsAt = "Enter a valid date";
  if (endsAt === INVALID) errors.endsAt = "Enter a valid date";

  if (
    startsAt instanceof Date &&
    endsAt instanceof Date &&
    endsAt.getTime() <= startsAt.getTime()
  ) {
    errors.endsAt = "The end must come after the start";
  }

  const rawMax = String(formData.get("maxRedemptions") ?? "").trim();
  let maxRedemptions: number | null = null;
  if (rawMax) {
    const parsed = Number(rawMax);
    if (!Number.isInteger(parsed) || parsed < 1) {
      errors.maxRedemptions = "Enter a whole number of uses, or leave blank";
    } else {
      maxRedemptions = parsed;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      code,
      kind,
      value,
      minSubtotalCents: minCents ?? 0,
      // Meaningless on a fixed amount, which is already its own ceiling.
      maxDiscountCents: kind === DiscountKind.PERCENT ? (maxCents ?? null) : null,
      startsAt: startsAt instanceof Date ? startsAt : null,
      endsAt: endsAt instanceof Date ? endsAt : null,
      maxRedemptions,
      oncePerCustomer: formData.get("oncePerCustomer") === "on",
      active: formData.get("active") === "on",
    },
  };
}
