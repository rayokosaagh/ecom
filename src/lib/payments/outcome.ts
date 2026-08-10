/**
 * Turning a callback's `?payment=` into something a customer can read.
 *
 * The callback routes redirect with a short code rather than a sentence,
 * because a query string is a URL a customer may bookmark, screenshot or send
 * to support — and a code stays true when the copy is reworded.
 *
 * Pure, so `npm run check:payments` can assert that no code falls through to a
 * blank banner. An unrecognised one is treated as "we do not know", which is
 * the honest reading: some codes are gateway statuses passed through verbatim,
 * and the list of those is the gateway's to change.
 */

export type PaymentTone = "good" | "bad" | "neutral";

export interface PaymentOutcome {
  tone: PaymentTone;
  icon: string;
  title: string;
  detail: string;
}

const OUTCOMES: Record<string, PaymentOutcome> = {
  paid: {
    tone: "good",
    icon: "check_circle",
    title: "Payment received",
    detail: "Your order is confirmed. We will email you when it ships.",
  },
  cancelled: {
    tone: "neutral",
    icon: "info",
    title: "Payment cancelled",
    detail:
      "Nothing has been charged and your order is saved. You can pay for it from here whenever you are ready.",
  },
  "User canceled": {
    tone: "neutral",
    icon: "info",
    title: "Payment cancelled",
    detail:
      "Nothing has been charged and your order is saved. You can pay for it from here whenever you are ready.",
  },
  Pending: {
    tone: "neutral",
    icon: "schedule",
    title: "Payment still processing",
    detail:
      "Your wallet has not confirmed this yet. It usually settles within a few minutes — refresh this page to check.",
  },
  PENDING: {
    tone: "neutral",
    icon: "schedule",
    title: "Payment still processing",
    detail:
      "Your wallet has not confirmed this yet. It usually settles within a few minutes — refresh this page to check.",
  },
  Expired: {
    tone: "bad",
    icon: "timer_off",
    title: "Payment expired",
    detail: "The payment window closed before it completed. You can try again.",
  },
  unverified: {
    tone: "bad",
    icon: "error",
    title: "Could not confirm the payment",
    detail:
      "We could not reach the payment provider to check. If money has left your account, contact us with your order number and we will sort it out — do not pay twice.",
  },
  // Deliberately alarming, and deliberately not "payment failed": the money may
  // well have moved. What has not happened is us agreeing on the figure.
  mismatch: {
    tone: "bad",
    icon: "error",
    title: "Payment amount did not match",
    detail:
      "The provider reported a different amount from this order, so it has not been marked paid. Contact us with your order number before trying again.",
  },
  unconfigured: {
    tone: "bad",
    icon: "error",
    title: "Payment is unavailable",
    detail: "This store cannot take that payment method right now.",
  },
  invalid: {
    tone: "bad",
    icon: "error",
    title: "Could not read the payment result",
    detail:
      "The response from the payment provider could not be verified. Nothing has been marked paid.",
  },
  unknown: {
    tone: "bad",
    icon: "error",
    title: "Payment could not be matched",
    detail:
      "We could not match that payment to an order. Contact us with your order number if money has left your account.",
  },
  // The gateway completed a payment for an order that had already been
  // cancelled — most likely swept for going unpaid, then paid anyway. Told
  // plainly rather than dressed up: the order is not coming back on its own,
  // and the money needs a human.
  "settled-late": {
    tone: "bad",
    icon: "error",
    title: "Paid, but this order had already been cancelled",
    detail:
      "The payment went through after the order was cancelled, so it has not been confirmed. Contact us with your order number and we will either reinstate it or refund you — please do not pay again.",
  },
};

/**
 * The codes that mean **nothing was charged, and nothing will be**.
 *
 * Small, and deliberately so. A code in here unwinds the order: it is
 * cancelled, its stock goes back on the shelf and its lines go back in the
 * basket, all without anybody clicking. That is the right answer for a shopper
 * who pressed Cancel at the wallet, and the wrong one for every status that
 * merely *has not settled yet* — `Pending`, `Initiated`, `unverified` — where
 * the money may still be moving and cancelling would sell units out from under
 * a payment that is about to complete.
 *
 * So the rule is: a status earns a place here by being final, not by being
 * unsuccessful. Everything else keeps the order and waits, and the unpaid sweep
 * clears it later if it never settles.
 *
 * - `cancelled` — ours, from eSewa's failure_url, which carries no status.
 * - `CANCELED` — eSewa's own, from its status API.
 * - `User canceled`, `Expired` — Khalti's two final failures. `check:payments`
 *   asserts this agrees with `isFinalFailure` rather than trusting two lists.
 */
const ABANDONED_CODES = new Set(["cancelled", "CANCELED", "User canceled", "Expired"]);

export function paymentWasAbandoned(code: string | undefined): boolean {
  return code !== undefined && ABANDONED_CODES.has(code);
}

/**
 * The banner for a customer who lands back on the **cart** rather than the
 * order, which is where an abandoned payment now sends them.
 *
 * Separate copy rather than reusing the order-page text, because the two say
 * opposite things about where the shopper's things are: on the receipt the
 * order is saved and payable; here it has been unwound and the basket is the
 * thing that survived. One sentence describing both would be true of neither.
 */
export function cartPaymentOutcome(code: string | undefined): PaymentOutcome | null {
  if (!paymentWasAbandoned(code)) return null;

  return {
    tone: "neutral",
    icon: "info",
    title: code === "Expired" ? "Payment expired" : "Payment cancelled",
    detail:
      "Nothing was charged and your items are back in your basket. You can check out again whenever you are ready.",
  };
}

export function paymentOutcome(code: string | undefined): PaymentOutcome | null {
  if (!code) return null;

  const known = OUTCOMES[code];
  if (known) return known;

  /**
   * A gateway status we do not have copy for.
   *
   * Shown rather than swallowed, and shown *neutrally*: it is not a success,
   * but calling it a failure would be a guess. The raw status is included
   * because it is what support will ask for.
   */
  return {
    tone: "neutral",
    icon: "info",
    title: "Payment not completed",
    detail: `The payment provider reported: ${code}. Your order is saved and unpaid.`,
  };
}
