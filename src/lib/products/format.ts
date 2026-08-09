import { SHOP_CURRENCY, formatMoney } from "@/lib/money/currency";

/**
 * Prices are stored in minor units; render them the way the shop's currency is
 * written. See `lib/money/currency` for what "the shop's currency" means and
 * how it is changed.
 *
 * The signature has not changed and neither has the name: every call site in
 * the app passes an integer count of minor units and gets back a string, which
 * is exactly what it did when that integer was always cents.
 */
export function formatPrice(priceCents: number): string {
  return formatMoney(priceCents);
}

/**
 * Minor units → the decimal string a number input expects.
 *
 * Trailing zeros are dropped for a currency that does not insist on its
 * fraction — an admin editing a rupee price sees `10700`, not `10700.00`, and
 * types the number they would say out loud. Dollars keep their cents, because
 * `79` in a price field that means dollars looks unfinished.
 */
export function centsToInput(priceCents: number): string {
  const major = priceCents / SHOP_CURRENCY.minorUnits;
  return SHOP_CURRENCY.minFractionDigits === 0
    ? String(Number(major.toFixed(SHOP_CURRENCY.maxFractionDigits)))
    : major.toFixed(SHOP_CURRENCY.minFractionDigits);
}
