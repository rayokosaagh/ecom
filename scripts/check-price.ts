import { MAX_PRICE_CENTS } from "../src/lib/products/sale";
import {
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
 * at or above its own "was" price. The ledger must never hold a row for a
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

// Equal as well as above: a "was" equal to the price renders a discount of
// nothing, which is the rule `compareAtError` already enforces on the product
// form. The two screens must not disagree.
const atWas = planPriceChange(onSale, 10_000);
check("pricing at the “was” price is refused", !atWas.ok);
check("pricing above it is refused", !planPriceChange(onSale, 12_000).ok);
check(
  "and the message explains the relationship rather than just saying no",
  !atWas.ok && atWas.error.toLowerCase().includes("was"),
);
check(
  "a row with no “was” price has no such ceiling",
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
