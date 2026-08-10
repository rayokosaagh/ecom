import { FulfilmentMethod, PaymentMethod } from "@/generated/prisma/enums";
import { SHOP_CURRENCY } from "@/lib/money/currency";

/**
 * What each payment method is, and when it may be offered.
 *
 * Pure and free of `server-only`, like `lib/checkout/fulfilment` beside it: the
 * checkout form decides which buttons to draw and the checkout action decides
 * which submissions to accept, and both have to reach the same answer. One
 * table, so they cannot disagree. `npm run check:payments` exercises it.
 *
 * The rules here are not presentation. A wallet that only settles rupees must
 * not be offered on a shop priced in dollars, and Khalti refuses anything under
 * ten rupees — offering either and failing at the gateway spends the customer's
 * time to tell them something we already knew.
 */

export interface PaymentMethodInfo {
  /** On the checkout radio and the receipt. */
  label: string;
  /** One line under the label. */
  blurb: string;
  /** Material Symbol, used when there is no brand mark to draw. */
  icon: string;
  /**
   * The provider's own colour, for the mark beside its name.
   *
   * Null for COD, which is not a brand — it gets the neutral surface and a
   * Material Symbol like any other control.
   */
  brandColor: string | null;
  /**
   * Short wordmark drawn on the coloured chip.
   *
   * **Deliberately a wordmark rather than a logo.** None of these three is in
   * Simple Icons, which is the only icon source this project trusts, and
   * `scripts/import-brand-icons` states the rule that applies here too: an
   * invented mark beside a real company's name misrepresents them. It is worse
   * for a payment brand than for a manufacturer, because the mark is part of
   * what tells a customer their money is going somewhere real.
   *
   * So the name is set in the provider's own colour, which is accurate and
   * recognisable, and `svgPath` below is the slot for the genuine artwork once
   * the shop has it from the provider's brand kit.
   */
  wordmark: string;
  /**
   * The official mark as a 24×24 path, once someone supplies one.
   *
   * Left null on purpose. Fill it from the provider's own brand assets — the
   * chip switches from the wordmark to the artwork automatically, and nothing
   * else has to change.
   */
  svgPath: string | null;
  /**
   * Currencies this method can settle. Empty means "any" — which only COD is,
   * because the shop is the one taking the money.
   */
  currencies: readonly string[];
  /**
   * Smallest amount the gateway accepts, in minor units. Khalti documents a
   * floor of 1000 paisa; below it the initiate call is rejected outright.
   */
  minMinorUnits: number;
  /** Whether the customer leaves the site and comes back with a reference. */
  redirects: boolean;
}

export const PAYMENT_METHODS: Record<PaymentMethod, PaymentMethodInfo> = {
  [PaymentMethod.COD]: {
    label: "Cash on delivery",
    blurb: "Pay when your order arrives",
    icon: "payments",
    brandColor: null,
    wordmark: "",
    svgPath: null,
    // The shop takes the cash, so whatever it prices in is what it accepts.
    currencies: [],
    minMinorUnits: 0,
    redirects: false,
  },
  [PaymentMethod.KHALTI]: {
    label: "Khalti",
    blurb: "Pay now with your Khalti wallet",
    icon: "account_balance_wallet",
    // Khalti's purple. Approximate until someone checks it against the brand
    // kit — a colour that is slightly off is a much smaller misrepresentation
    // than a mark that is invented, which is why this is here and a path is not.
    brandColor: "#5c2d91",
    wordmark: "Khalti",
    svgPath: null,
    currencies: ["NPR"],
    // Khalti's documented floor: `amount` is in paisa and must be at least 1000.
    minMinorUnits: 1000,
    redirects: true,
  },
  [PaymentMethod.ESEWA]: {
    label: "eSewa",
    blurb: "Pay now with your eSewa account",
    icon: "account_balance_wallet",
    brandColor: "#60bb46",
    wordmark: "eSewa",
    svgPath: null,
    currencies: ["NPR"],
    minMinorUnits: 0,
    redirects: true,
  },
  [PaymentMethod.CONNECTIPS]: {
    label: "connectIPS",
    blurb: "Pay direct from your bank account",
    icon: "account_balance",
    brandColor: "#0c5aa6",
    wordmark: "connectIPS",
    svgPath: null,
    currencies: ["NPR"],
    minMinorUnits: 0,
    redirects: true,
  },
};

export const PAYMENT_METHOD_ORDER = Object.keys(
  PAYMENT_METHODS,
) as PaymentMethod[];

export function isPaymentMethod(value: string): value is PaymentMethod {
  return Object.hasOwn(PAYMENT_METHODS, value);
}

/**
 * Cash on delivery, on an order nobody is delivering.
 *
 * The label follows the fulfilment method for the same reason `SHIPPED` does:
 * "cash on delivery" on an order the customer is coming to collect describes an
 * event that will not happen, and the two words a shopper needs — *when* they
 * pay — are exactly the ones it gets wrong.
 */
export function paymentMethodLabel(
  method: PaymentMethod,
  fulfilment: FulfilmentMethod,
): string {
  if (method === PaymentMethod.COD && fulfilment === FulfilmentMethod.PICKUP) {
    return "Cash on collection";
  }
  return PAYMENT_METHODS[method].label;
}

/** Why a method cannot be offered right now, or null when it can. */
export type PaymentUnavailable =
  | { reason: "currency"; currency: string }
  | { reason: "too-small"; minMinorUnits: number }
  | { reason: "not-configured" };

/**
 * Whether one method may be offered for a given basket.
 *
 * `configured` is passed in rather than read here, because whether the shop has
 * merchant keys is an environment fact and this module has no environment. The
 * separation is what lets the check suite exercise every branch without keys.
 */
export function paymentUnavailable(
  method: PaymentMethod,
  totalMinorUnits: number,
  configured: boolean,
): PaymentUnavailable | null {
  const info = PAYMENT_METHODS[method];

  if (info.redirects && !configured) return { reason: "not-configured" };

  if (info.currencies.length > 0 && !info.currencies.includes(SHOP_CURRENCY.code)) {
    return { reason: "currency", currency: SHOP_CURRENCY.code };
  }

  if (totalMinorUnits < info.minMinorUnits) {
    return { reason: "too-small", minMinorUnits: info.minMinorUnits };
  }

  return null;
}
