/**
 * The shop's currency.
 *
 * ## What is stored
 *
 * Every money column in this schema is an integer count of **minor units** —
 * paisa under NPR, cents under USD — and every one of them is in *the shop's
 * current currency*. There is no base currency quietly underneath: a price of
 * `1070000` means Rs 10,700 today, and would mean $10,700 if the shop were
 * switched to dollars without converting.
 *
 * That is a deliberate choice over storing one canonical currency and
 * converting at render. Converting at render cannot produce a price anybody
 * chose — Rs 11,218.00 is what arithmetic gives you, and a shop wants Rs 11,200
 * on the shelf. Storing what the shop actually charges also keeps sorting and
 * range-filtering correct inside Postgres, which is where the catalogue does
 * both.
 *
 * The cost is that switching currency is a data migration rather than a toggle.
 * That is what `scripts/convert-currency.ts` is, and why `StoreSettings.currency`
 * records which currency the stored numbers are in — so the migration can
 * refuse to run twice and turn Rs 10,700 into Rs 1,519,400.
 *
 * ## Which currency is active
 *
 * `NEXT_PUBLIC_SHOP_CURRENCY`, read at build time. An environment variable
 * rather than a database read, because `formatPrice` is called from client
 * components — the cart line, the sale card, the dashboard tooltip — and those
 * cannot await a query. A `NEXT_PUBLIC_` value is inlined into both bundles, so
 * the same synchronous function works everywhere and no call site had to change
 * when this was introduced.
 */

export type CurrencyCode = "NPR" | "USD";

export interface Currency {
  code: CurrencyCode;
  /** Shown to shoppers. */
  name: string;
  /**
   * The locale whose *number* conventions this currency is written with — not
   * the language of the site.
   *
   * NPR uses `en-IN` rather than `en-NP` on purpose: Nepal groups digits the
   * South Asian way, so Rs 1,75,400 is the form a shopper reads fluently and
   * `en-NP` would render it 175,400. Latin digits either way; `ne-NP` would
   * give Devanagari, which is a language decision this file does not make.
   */
  locale: string;
  /** Minor units in one major unit. 100 for both paisa and cents. */
  minorUnits: number;
  minFractionDigits: number;
  maxFractionDigits: number;
  /**
   * What "a round price" means here, in minor units.
   *
   * Rs 100 for rupees and $1 for dollars — the granularity a converted
   * catalogue is snapped to, so prices read as chosen rather than computed.
   */
  priceStepMinor: number;
  /** Flat delivery charge, in minor units. */
  flatShippingMinor: number;
  /** Goods total at or above which delivery is free, in minor units. */
  freeShippingOverMinor: number;
}

export const CURRENCIES: Record<CurrencyCode, Currency> = {
  NPR: {
    code: "NPR",
    name: "Nepali rupee",
    locale: "en-IN",
    minorUnits: 100,
    // Paisa exist but nothing is priced in them, so a whole rupee shows as
    // "Rs 10,700" rather than "Rs 10,700.00". The two decimals are still
    // available for anything that genuinely lands between rupees — a
    // percentage discount, say — so the figure is never rounded into a lie.
    minFractionDigits: 0,
    maxFractionDigits: 2,
    priceStepMinor: 10_000,
    // Rs 700 delivery, free over Rs 7,100 — the old $4.99 / $50 thresholds
    // carried across at the same rate the catalogue was converted at.
    flatShippingMinor: 70_000,
    freeShippingOverMinor: 710_000,
  },
  USD: {
    code: "USD",
    name: "US dollar",
    locale: "en-US",
    minorUnits: 100,
    // Dollars always show their cents; "$79" for a price of exactly $79.00
    // reads as an approximation in a way "Rs 10,700" does not.
    minFractionDigits: 2,
    maxFractionDigits: 2,
    priceStepMinor: 100,
    flatShippingMinor: 499,
    freeShippingOverMinor: 5_000,
  },
};

export const DEFAULT_CURRENCY: CurrencyCode = "NPR";

export function isCurrencyCode(value: string | undefined): value is CurrencyCode {
  return value === "NPR" || value === "USD";
}

/**
 * The active currency.
 *
 * An unrecognised value falls back rather than throwing: this is read at module
 * load on every request path, and a typo in an environment variable should not
 * take the whole shop down — it should serve the default and be obvious in the
 * prices.
 */
export const SHOP_CURRENCY: Currency =
  CURRENCIES[
    isCurrencyCode(process.env.NEXT_PUBLIC_SHOP_CURRENCY)
      ? process.env.NEXT_PUBLIC_SHOP_CURRENCY
      : DEFAULT_CURRENCY
  ];

/**
 * Formatters are built once per currency.
 *
 * `Intl.NumberFormat` is expensive to construct and a product grid formats a
 * hundred prices per render, so this is not a micro-optimisation — it is the
 * difference between one construction and a hundred.
 */
const formatters = new Map<CurrencyCode, Intl.NumberFormat>();

function formatterFor(currency: Currency): Intl.NumberFormat {
  const existing = formatters.get(currency.code);
  if (existing) return existing;

  const built = new Intl.NumberFormat(currency.locale, {
    style: "currency",
    currency: currency.code,
    // "Rs" and "$" rather than "NPR" and "US$" — the short form is what a
    // price tag wears.
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: currency.minFractionDigits,
    maximumFractionDigits: currency.maxFractionDigits,
  });
  formatters.set(currency.code, built);
  return built;
}

/** An amount in minor units, as a shopper reads it. */
export function formatMoney(minor: number, currency: Currency = SHOP_CURRENCY): string {
  return formatterFor(currency).format(minor / currency.minorUnits);
}

/**
 * Just the symbol, for places that put it beside a number of their own —
 * a compacted "Rs 12.9K", where `Intl` would insist on grouping the digits.
 */
export function currencySymbol(currency: Currency = SHOP_CURRENCY): string {
  const symbol = formatterFor(currency)
    .formatToParts(0)
    .find((part) => part.type === "currency")?.value;
  return symbol ?? currency.code;
}

/** Round to the nearest multiple of `stepMinor`, staying on whole minor units. */
export function roundToStep(minor: number, stepMinor: number): number {
  if (stepMinor <= 1) return Math.round(minor);
  return Math.round(minor / stepMinor) * stepMinor;
}

/**
 * Convert an amount between currencies and snap it to a sensible price.
 *
 * `rate` is how many units of the target currency one unit of the source buys.
 * Rounding happens once, here, on the converted figure — never in stages, which
 * is how a catalogue ends up with a price that is a rupee off its own variants.
 *
 * A zero stays zero at any rate or step: "free" is not a price to be rounded,
 * and a nudge to Rs 100 would put a charge on something given away.
 */
export function convertMinor(minor: number, rate: number, stepMinor: number): number {
  if (minor === 0) return 0;
  const converted = minor * rate;
  const rounded = roundToStep(converted, stepMinor);
  // A very small non-zero amount must not round away to nothing — a Rs 0 line
  // on a receipt claims something was free when it was merely cheap.
  return rounded === 0 ? Math.max(1, Math.round(converted)) : rounded;
}
