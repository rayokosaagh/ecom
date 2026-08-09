/**
 * Delivery pricing.
 *
 * A flat rate with a free threshold, deliberately — not a carrier integration.
 * The cart summary has always promised "Calculated at checkout", and this is
 * what makes that line honest without pretending to know real rates.
 *
 * Kept as plain numbers rather than a database table because a rate nobody can
 * edit is better than a rate table nobody maintains: when these need to vary by
 * weight or destination, that is a different feature, and it should replace
 * this file rather than grow inside it.
 */

/**
 * Both rates come from the active currency rather than being written here.
 *
 * A delivery charge is a price, and prices are in the shop's currency — leaving
 * `499` hard-coded would have quietly charged Rs 4.99 for delivery the moment
 * the catalogue moved to rupees. Each currency states its own figures, so a
 * switch carries them across with everything else. See `lib/money/currency`.
 */
import { SHOP_CURRENCY } from "@/lib/money/currency";

/** Charged on any order below the threshold. */
export const FLAT_SHIPPING_CENTS = SHOP_CURRENCY.flatShippingMinor;

/** Order goods total at or above which delivery is free. */
export const FREE_SHIPPING_OVER_CENTS = SHOP_CURRENCY.freeShippingOverMinor;

export function shippingFor(subtotalCents: number): number {
  if (subtotalCents <= 0) return 0;
  return subtotalCents >= FREE_SHIPPING_OVER_CENTS ? 0 : FLAT_SHIPPING_CENTS;
}

/** How much more is needed to reach free delivery, or 0 once it is reached. */
export function remainingForFreeShipping(subtotalCents: number): number {
  return Math.max(0, FREE_SHIPPING_OVER_CENTS - subtotalCents);
}
