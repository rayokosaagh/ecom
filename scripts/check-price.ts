import { MAX_PRICE_CENTS } from "../src/lib/products/sale";
import {
  describeSaleChange,
  parsePercentInput,
  parseSaleEndInput,
  percentOffLabel,
  priceFromPercentOff,
  parseCompareAtInput,
  parsePriceInput,
  planPriceChange,
  priceDeltaSign,
  type PriceContext,
} from "../src/lib/inventory/price";

/**
 * Checks for manual price changes.
 *
 * Same reasoning as `check:inventory`, one column over: this decides what the
 * shop charges, and the catalogue sorts, filters and snapshots onto orders from
 * that same column. Four things are being defended.
 *
 * A price change must never be accepted while a flash sale owns the column —
 * the sale puts prices back by checking they still hold what it wrote, so an
 * edit underneath it silently opts the product out of its own restore. It must
 * never leave a row on the sale shelf with nothing to show, which means never
 * at or above its own regular price. The ledger must never hold a row for a
 * change of nothing. And the panel and the server action must judge a change
 * identically, which they do by both calling `planPriceChange` — asserted here
 * rather than assumed.
 *
 *   npm run check:price
 */

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ok    ${label}`);
    return;
  }
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
}

/** An ordinary row: not on sale, no flash sale, priced at 100.00. */
const plain: PriceContext = {
  currentCents: 10_000,
  compareAtCents: null,
  inLiveFlashSale: false,
  flashSaleName: null,
};

console.log("\nA typed price becomes minor units");

const parsed = parsePriceInput("99.50");
check("it parses", parsed.ok);
check("major units become minor", parsed.ok && parsed.cents === 9950);
check(
  "a whole number works",
  (() => {
    const r = parsePriceInput("120");
    return r.ok && r.cents === 12_000;
  })(),
);
check(
  "half a minor unit rounds rather than truncating",
  (() => {
    const r = parsePriceInput("10.005");
    return r.ok && r.cents === 1001;
  })(),
);

// The table above the panel renders "10,700" — refusing the app's own output
// would be refusing the most likely thing to be pasted in.
check(
  "grouping separators are stripped",
  (() => {
    const r = parsePriceInput("10,700");
    return r.ok && r.cents === 1_070_000;
  })(),
);

check("blank is refused", !parsePriceInput("   ").ok);
check("so is text", !parsePriceInput("cheap").ok);
check("so is a lone dot", !parsePriceInput(".").ok);
check("so is a negative", !parsePriceInput("-5").ok);
check(
  "and so is something absurd",
  !parsePriceInput(String(MAX_PRICE_CENTS)).ok,
);

console.log("\nAn ordinary change is planned");

const cut = planPriceChange(plain, 8_000);
check("it plans", cut.ok);
check("to the price given", cut.ok && cut.data.toCents === 8_000);
check("with a signed delta", cut.ok && cut.data.deltaCents === -2_000);
check(
  "a rise is planned just as happily",
  (() => {
    const r = planPriceChange(plain, 12_000);
    return r.ok && r.data.deltaCents === 2_000;
  })(),
);

console.log("\nA change of nothing is refused");

// The ledger's whole value is that every row in it is an event. One saying the
// price changed when it did not is how a ledger stops being worth reading.
const noop = planPriceChange(plain, 10_000);
check("setting the current price is refused", !noop.ok);
check(
  "and it says so rather than reporting a generic failure",
  !noop.ok && noop.error.toLowerCase().includes("current price"),
);

console.log("\nA live flash sale owns the column");

const flashed: PriceContext = {
  ...plain,
  inLiveFlashSale: true,
  flashSaleName: "Midnight Hour",
};

const blocked = planPriceChange(flashed, 8_000);
check("the change is refused", !blocked.ok);
check(
  "and the sale is named, so the admin knows where to go",
  !blocked.ok && blocked.error.includes("Midnight Hour"),
);
check(
  "an unnamed sale still refuses",
  !planPriceChange(
    { ...plain, inLiveFlashSale: true, flashSaleName: null },
    8_000,
  ).ok,
);

// Checked before anything else: while a sale holds the column, *no* figure is
// acceptable, so complaining about the figure first would send the admin to fix
// the wrong thing.
check(
  "it outranks the no-op refusal",
  (() => {
    const r = planPriceChange(flashed, flashed.currentCents);
    return !r.ok && r.error.includes("Midnight Hour");
  })(),
);

console.log("\nA standing sale constrains the price");

/** On sale: was 100.00, now 80.00. */
const onSale: PriceContext = { ...plain, currentCents: 8_000, compareAtCents: 10_000 };

check("going deeper is fine", planPriceChange(onSale, 7_000).ok);

// Equal as well as above: a regular price equal to the price renders a discount of
// nothing, which is the rule `compareAtError` already enforces on the product
// form. The two screens must not disagree.
const atWas = planPriceChange(onSale, 10_000);
check("pricing at the regular price is refused", !atWas.ok);
check("pricing above it is refused", !planPriceChange(onSale, 12_000).ok);
check(
  "and the message explains the relationship rather than just saying no",
  !atWas.ok && atWas.error.toLowerCase().includes("regular price"),
);
check(
  "a row with no regular price has no such ceiling",
  planPriceChange(plain, 999_00).ok,
);

console.log("\nBounds hold");

check("a negative price is refused", !planPriceChange(plain, -1).ok);
check("a fractional minor unit is refused", !planPriceChange(plain, 10.5).ok);
check(
  "the ceiling is enforced",
  !planPriceChange(plain, MAX_PRICE_CENTS + 1).ok,
);
check("exactly at the ceiling is allowed", planPriceChange(plain, MAX_PRICE_CENTS).ok);
check(
  "free is allowed by the planner",
  // Zero is not this function's to refuse — `parsePriceInput` accepts it, the
  // product form accepts it, and a genuinely free item is the shop's call.
  planPriceChange(plain, 0).ok,
);

console.log("\nThe regular price travels with the price");

// Blank is an answer: not on sale.
const blankWas = parseCompareAtInput("   ");
check("an empty regular price means no sale", blankWas.ok && blankWas.cents === null);
const typedWas = parseCompareAtInput("10,700");
check("a typed regular price parses like a price", typedWas.ok && typedWas.cents === 1_070_000);
const badWas = parseCompareAtInput("abc");
check(
  "a malformed regular price is refused and says which field",
  !badWas.ok && /regular price/i.test(badWas.error),
);

// Starting a sale: lower the price, keep the old one as the regular price.
const started = planPriceChange(plain, 8_000, 10_000);
check(
  "lowering the price and keeping the old figure as the regular price starts a sale",
  started.ok && started.data.toCents === 8_000 && started.data.toCompareAtCents === 10_000,
);

// Ending one: clear the regular price, leave the price.
const ended = planPriceChange(onSale, onSale.currentCents, null);
check(
  "clearing the regular price with the price left alone is a change, not a no-op",
  ended.ok && ended.data.deltaCents === 0 && ended.data.toCompareAtCents === null,
);

// The third argument defaults to the standing value, so older callers are unchanged.
const implicit = planPriceChange(onSale, 7_000);
check(
  "a caller that passes no regular price keeps the standing one",
  implicit.ok && implicit.data.toCompareAtCents === onSale.compareAtCents,
);

// A regular price that is not above the price is not a sale.
const flatSale = planPriceChange(plain, 10_000, 10_000);
check("a regular price equal to the price is refused", !flatSale.ok);
check("and the refusal says to raise it", !flatSale.ok && /raise/i.test(flatSale.error));
const inverted = planPriceChange(plain, 10_000, 9_000);
check("a regular price below the price is refused", !inverted.ok);

// The existing message still fires for the existing case.
const raisedIntoWas = planPriceChange(onSale, 10_000);
check(
  "raising a sale price to its own regular price still says to lower it or end the sale",
  !raisedIntoWas.ok && /end the sale/i.test(raisedIntoWas.error),
);

// Nothing changed at all.
const bothSame = planPriceChange(onSale, onSale.currentCents, onSale.compareAtCents);
check(
  "the same price and regular price is refused as nothing to record",
  !bothSame.ok && /nothing to record/.test(bothSame.error),
);

// Bounds apply to the regular price too.
const hugeWas = planPriceChange(plain, 8_000, MAX_PRICE_CENTS + 1);
check("an unrealistic regular price is refused", !hugeWas.ok);
const negativeWas = planPriceChange(plain, 8_000, -1);
check("a negative regular price is refused", !negativeWas.ok);

// A flash sale holds the pair, not just the price.
const flashWas = planPriceChange(flashed, flashed.currentCents, null);
check("a live flash sale refuses a regular-price change too", !flashWas.ok);

const rs = (cents: number) => `Rs ${cents / 100}`;
check("no sale movement reads as nothing", describeSaleChange(null, null, rs) === null);
check("the same regular price reads as nothing", describeSaleChange(1000, 1000, rs) === null);
check(
  "gaining a regular price reads as a sale starting",
  describeSaleChange(null, 1000, rs) === "sale started, regular price Rs 10",
);
check("losing it reads as a sale ending", describeSaleChange(1000, null, rs) === "sale ended");
check(
  "moving it reads as before → after",
  describeSaleChange(1000, 1200, rs) === "regular price Rs 10 → Rs 12",
);

console.log("\nA sale can be set as a percentage");

const pct = parsePercentInput("20");
check("a whole percentage parses", pct.ok && pct.percent === 20);
const pctSign = parsePercentInput(" 12.5% ");
check("a percent sign and a fraction are accepted", pctSign.ok && pctSign.percent === 12.5);
check("zero is not a discount", !parsePercentInput("0").ok);
check("a hundred is free, not a sale", !parsePercentInput("100").ok);
check("a negative discount is refused", !parsePercentInput("-5").ok);
check("gibberish is refused", !parsePercentInput("twenty").ok);
check("blank is refused", !parsePercentInput("").ok);

// NPR has no fraction, so the figure is rounded to whole rupees — never paisa.
check(
  "20% off Rs 2,05,800 is Rs 1,64,640",
  priceFromPercentOff(2_05_800_00, 20) === 1_64_640_00,
);
check(
  "a fractional result is rounded to the currency's whole unit",
  priceFromPercentOff(1_000_01, 10) % 100 === 0,
);
check("the result never goes below zero", priceFromPercentOff(100, 99.9999) >= 0);
check(
  "and reads back as the same percentage",
  percentOffLabel(priceFromPercentOff(2_05_800_00, 20), 2_05_800_00) === "20% off",
);

check("a discount reads as a whole percent", percentOffLabel(9_300, 10_000) === "7% off");
check("the storefront's rounding is used", percentOffLabel(8_000, 10_000) === "20% off");
check("no regular price is no discount", percentOffLabel(8_000, null) === null);
check("a regular price at the price is no discount", percentOffLabel(10_000, 10_000) === null);
check("under half a percent is not rounded up to 1%", percentOffLabel(99_960, 100_000) === null);

console.log("\nA sale can be given an end");

const clock = new Date("2026-08-20T12:00:00Z");
const noEnd = parseSaleEndInput("", clock);
check("blank means no end", noEnd.ok && noEnd.endsAt === null);
const later = parseSaleEndInput("2026-08-25T18:00", clock);
check("a future date-time parses", later.ok && later.endsAt !== null);
check("a past date is refused", !parseSaleEndInput("2026-08-19T18:00", clock).ok);
check("the present moment is refused", !parseSaleEndInput(clock.toISOString(), clock).ok);
check("gibberish is refused", !parseSaleEndInput("next friday", clock).ok);

console.log("\nThe delta reads correctly");

check("a rise is +", priceDeltaSign(500) === "+");
check("a cut is −", priceDeltaSign(-500) === "−");
// A real minus sign, not a hyphen — it sits beside currency in the ledger.
check("and it is a real minus sign", priceDeltaSign(-1) === "−");

console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} check${failures === 1 ? "" : "s"} failed.\n`,
);

process.exit(failures === 0 ? 0 : 1);
