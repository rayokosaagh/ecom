import type { Validated } from "@/lib/auth/validation";
import { OrderCancelReason } from "@/generated/prisma/enums";

/**
 * Why an order was cancelled.
 *
 * Deliberately free of `server-only` and of any database access, like every
 * other `parse*` in this codebase — the rules are worth exercising directly,
 * and `npm run check:cancellation` does exactly that.
 *
 * A reason is mandatory on both sides. That is the whole point of the feature:
 * a cancelled order that says nothing about why is a number nobody can act on,
 * and the shop only learns it was cancelling for want of stock if cancelling
 * made someone say so.
 */

/** Long enough to explain an unusual case, short enough to stay a note. */
export const MAX_CANCEL_NOTE_LENGTH = 300;

/** Which side of the shop is cancelling. They are offered different reasons. */
export type CancelAudience = "customer" | "admin";

export type CancellationInput = {
  reason: OrderCancelReason;
  /** Only ever set alongside `OTHER`; see the schema comment on `cancelNote`. */
  note: string | null;
};

/**
 * What each side may choose.
 *
 * Separate lists because the two are answering different questions. A customer
 * is saying why they no longer want the order; an admin is saying why the shop
 * could not fulfil it. Offering "Out of stock" to a shopper invites them to
 * report a fact they cannot know, and offering "Changed my mind" to an admin
 * records a decision that was not theirs — `CUSTOMER_REQUESTED` is how an admin
 * cancelling on someone's behalf says so.
 *
 * The order of each list is the order it renders in, commonest first.
 */
const REASONS: Record<CancelAudience, readonly OrderCancelReason[]> = {
  customer: [
    OrderCancelReason.ORDERED_BY_MISTAKE,
    OrderCancelReason.CHANGED_MIND,
    OrderCancelReason.FOUND_BETTER_PRICE,
    OrderCancelReason.DELIVERY_TOO_SLOW,
    OrderCancelReason.BOUGHT_ELSEWHERE,
    OrderCancelReason.OTHER,
  ],
  admin: [
    OrderCancelReason.CUSTOMER_REQUESTED,
    OrderCancelReason.OUT_OF_STOCK,
    OrderCancelReason.PAYMENT_FAILED,
    OrderCancelReason.UNDELIVERABLE_ADDRESS,
    OrderCancelReason.SUSPECTED_FRAUD,
    OrderCancelReason.OTHER,
  ],
};

export function cancellationReasons(
  audience: CancelAudience,
): readonly OrderCancelReason[] {
  return REASONS[audience];
}

/**
 * How each reason is written wherever it is shown.
 *
 * First person for the customer's own reasons, because they are read back on
 * the customer's receipt as something they said. The admin's are written as
 * statements about the order for the same reason.
 */
export const CANCEL_REASON_LABEL: Record<OrderCancelReason, string> = {
  [OrderCancelReason.ORDERED_BY_MISTAKE]: "Ordered by mistake",
  [OrderCancelReason.CHANGED_MIND]: "Changed my mind",
  [OrderCancelReason.FOUND_BETTER_PRICE]: "Found a better price elsewhere",
  [OrderCancelReason.DELIVERY_TOO_SLOW]: "Delivery is taking too long",
  [OrderCancelReason.BOUGHT_ELSEWHERE]: "Bought it somewhere else",

  [OrderCancelReason.CUSTOMER_REQUESTED]: "Customer asked us to cancel",
  [OrderCancelReason.OUT_OF_STOCK]: "Out of stock",
  [OrderCancelReason.PAYMENT_FAILED]: "Payment failed",
  [OrderCancelReason.UNDELIVERABLE_ADDRESS]: "Cannot deliver to that address",
  [OrderCancelReason.SUSPECTED_FRAUD]: "Suspected fraud",

  [OrderCancelReason.OTHER]: "Something else",
};

function isReason(value: string): value is OrderCancelReason {
  return Object.hasOwn(CANCEL_REASON_LABEL, value);
}

/**
 * Read a cancellation off the form, refusing one that names no reason.
 *
 * `audience` is supplied by the action from who the caller turned out to be,
 * never by the form — otherwise a customer could post `SUSPECTED_FRAUD` against
 * their own order and the shop's own records would be the thing telling it a
 * lie. Membership of the audience's list is checked rather than assumed for the
 * same reason: a server action is a public POST endpoint, and the radio group
 * that renders these options is not the only way to reach it.
 */
export function parseCancellation(
  formData: FormData,
  audience: CancelAudience,
): Validated<CancellationInput> {
  const errors: Record<string, string> = {};

  const raw = String(formData.get("reason") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  // One error for "nothing chosen" and for "chose something not on offer".
  // They are the same thing to anyone using the form, and distinguishing them
  // would only tell somebody probing the endpoint which guesses were close.
  const reason = isReason(raw) && REASONS[audience].includes(raw) ? raw : null;
  if (!reason) errors.reason = "Choose a reason for cancelling";

  // `OTHER` exists so that nobody is forced into a reason that is not theirs.
  // Letting it through empty would give back exactly the blank this feature is
  // meant to remove, so it is the one option that has to be written out.
  if (reason === OrderCancelReason.OTHER) {
    if (!note) errors.note = "Tell us briefly what happened";
    else if (note.length > MAX_CANCEL_NOTE_LENGTH) {
      errors.note = `Keep it to ${MAX_CANCEL_NOTE_LENGTH} characters or fewer`;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      reason: reason!,
      // Dropped unless the reason is `OTHER`: the note field stays mounted
      // while someone changes their mind about the radio, and text typed
      // against an abandoned "Something else" must not end up filed under the
      // reason they actually picked.
      note: reason === OrderCancelReason.OTHER ? note : null,
    },
  };
}

/** The reason as one line, for a notification or an admin list. */
export function describeCancellation(
  reason: OrderCancelReason | null,
  note: string | null,
): string | null {
  if (!reason) return null;
  const label = CANCEL_REASON_LABEL[reason];
  return reason === OrderCancelReason.OTHER && note ? `${label} — ${note}` : label;
}
