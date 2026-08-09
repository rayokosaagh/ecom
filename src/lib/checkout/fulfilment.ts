import { FulfilmentMethod } from "@/generated/prisma/enums";
import { shippingFor } from "@/lib/checkout/shipping";

/**
 * Delivery or collection, and what each one changes.
 *
 * Pure and free of `server-only`, like `lib/checkout/shipping` beside it and
 * for the sharper version of the same reason: the checkout summary has to
 * re-total *as the radio is clicked*, before anything is submitted, and the
 * server has to reach the identical figure when it is. Both call
 * `deliveryChargeFor`. `npm run check:fulfilment` exercises it directly.
 */

export function isFulfilmentMethod(value: string): value is FulfilmentMethod {
  return Object.hasOwn(FulfilmentMethod, value);
}

/**
 * What delivery costs under one method.
 *
 * Collection is free, and free unconditionally — not "free because the basket
 * cleared the threshold". Nothing is being carried anywhere, so there is no
 * charge to waive, and routing it through `shippingFor` would make a small
 * pickup order quote a delivery fee for a van that is never sent.
 */
export function deliveryChargeFor(
  method: FulfilmentMethod,
  payableCents: number,
): number {
  if (method === FulfilmentMethod.PICKUP) return 0;
  return shippingFor(payableCents);
}

/**
 * What to call things, given how the order travels.
 *
 * The reason `FulfilmentMethod` has no `COLLECTED` order status: "Shipped" is
 * the shop's obligation discharged, which is one idea either way, and the
 * difference is a matter of wording rather than of state. Splitting the status
 * would have forked revenue reporting, the dashboard pipeline, review
 * eligibility and every transition table to say something this function can say
 * on its own.
 *
 * Written out per method rather than assembled from fragments, because these
 * are sentences a customer reads on a receipt and they should be composed by
 * someone rather than by string concatenation.
 */
export interface FulfilmentLabels {
  /** The choice itself, on the checkout radio and the admin ticket. */
  method: string;
  /** The line in the totals — "Delivery" or "Collection". */
  charge: string;
  /** What `SHIPPED` means for this order. */
  shipped: string;
  /** The admin's button for moving it there. */
  markShipped: string;
  /** The icon that goes with it. */
  icon: string;
  /** Heads the address block on the receipt. */
  destination: string;
}

const LABELS: Record<FulfilmentMethod, FulfilmentLabels> = {
  [FulfilmentMethod.DELIVERY]: {
    method: "Home delivery",
    charge: "Delivery",
    shipped: "Shipped",
    markShipped: "Mark shipped",
    icon: "local_shipping",
    destination: "Delivering to",
  },
  [FulfilmentMethod.PICKUP]: {
    method: "Store pickup",
    charge: "Collection",
    // Not "Shipped". The parcel never moved, and a customer told their
    // collection order has shipped will reasonably go looking for a tracking
    // number that does not exist.
    shipped: "Collected",
    markShipped: "Mark collected",
    icon: "storefront",
    destination: "Collect from",
  },
};

export function fulfilmentLabels(method: FulfilmentMethod): FulfilmentLabels {
  return LABELS[method];
}

/**
 * Whether the shop can actually offer collection.
 *
 * Both halves matter, which is why this is a function rather than a read of
 * `pickupEnabled`. The switch is the shop's intent; the address is what makes
 * the intent actionable. Offering "collect in store" and then naming no store
 * is an option a customer cannot act on, and they only discover that after
 * committing to it.
 */
export function pickupAvailable(settings: {
  pickupEnabled: boolean;
  pickupAddress: string;
}): boolean {
  return settings.pickupEnabled && settings.pickupAddress.trim().length > 0;
}
