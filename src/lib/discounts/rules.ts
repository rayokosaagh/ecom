import { formatPrice } from "@/lib/products/format";
import { DiscountKind } from "@/generated/prisma/enums";

/**
 * The rules a discount code is judged by.
 *
 * Deliberately free of `server-only` and of any database access: this is the
 * arithmetic that decides how much money comes off an order, and it is worth
 * being able to exercise it directly. `npm run check:discounts` does exactly
 * that.
 */

export type DiscountVerdict =
  | { ok: true; code: string; label: string; discountCents: number }
  | { ok: false; code: string; reason: string };

/** Only the fields the arithmetic needs, so a transaction can pass its own row. */
type EvaluableCode = {
  code: string;
  kind: DiscountKind;
  value: number;
  minSubtotalCents: number;
  maxDiscountCents: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  redemptions: number;
  oncePerCustomer: boolean;
  active: boolean;
};

/**
 * What this code takes off a given subtotal.
 *
 * Discounts apply to goods only, never to delivery — otherwise a large enough
 * code would have the shop paying the courier on the customer's behalf. For
 * the same reason the result is capped at the subtotal: an order total must
 * not be able to go negative.
 */
function amountFor(code: EvaluableCode, subtotalCents: number): number {
  const raw =
    code.kind === DiscountKind.PERCENT
      ? Math.round((subtotalCents * code.value) / 100)
      : code.value;

  const capped =
    code.maxDiscountCents !== null ? Math.min(raw, code.maxDiscountCents) : raw;

  return Math.max(0, Math.min(capped, subtotalCents));
}

/**
 * Check every rule against a code that has already been read.
 *
 * `usedByCustomer` is passed in rather than queried here so the checkout
 * transaction can supply its own count from inside the transaction.
 */
export function judge(
  code: EvaluableCode,
  subtotalCents: number,
  usedByCustomer: number,
  now: Date,
): DiscountVerdict {
  const fail = (reason: string): DiscountVerdict => ({
    ok: false,
    code: code.code,
    reason,
  });

  // "Not active" and "expired" are told apart deliberately: a shopper who
  // mistyped a live code needs different advice from one holding a dead one.
  if (!code.active) return fail("That code is no longer available.");
  if (code.startsAt && now < code.startsAt) return fail("That code is not active yet.");
  if (code.endsAt && now > code.endsAt) return fail("That code has expired.");

  if (code.maxRedemptions !== null && code.redemptions >= code.maxRedemptions) {
    return fail("That code has been fully claimed.");
  }

  if (code.oncePerCustomer && usedByCustomer > 0) {
    return fail("You have already used that code.");
  }

  if (subtotalCents < code.minSubtotalCents) {
    return fail(
      `Spend ${formatPrice(code.minSubtotalCents)} to use that code — you are ${formatPrice(
        code.minSubtotalCents - subtotalCents,
      )} short.`,
    );
  }

  const discountCents = amountFor(code, subtotalCents);
  // A code that is valid but worth nothing here is reported rather than shown
  // as an applied "£0.00 off", which reads as broken.
  if (discountCents <= 0) return fail("That code takes nothing off this basket.");

  return {
    ok: true,
    code: code.code,
    label:
      code.kind === DiscountKind.PERCENT
        ? `${code.code} · ${code.value}% off`
        : `${code.code} · ${formatPrice(code.value)} off`,
    discountCents,
  };
}

