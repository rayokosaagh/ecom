import {
  MAX_PERCENT_OFF,
  MIN_PERCENT_OFF,
  applyPlan,
  flashPriceCents,
  planIsEmpty,
  readSnapshot,
  restorePlan,
  shouldBeLive,
  type PriceSnapshot,
  type PricedRow,
} from "../src/lib/flash/pricing";
import { parseFlashSale } from "../src/lib/flash/validation";

/**
 * Checks for flash sale pricing.
 *
 * This suite carries more weight than the others, because a flash sale is the
 * only feature in the app that *writes* prices to products it does not own. A
 * bug here does not render something wrong — it leaves a wrong price in the
 * column that the cart charges from, and it stays there after the sale ends.
 *
 * Four things are defended:
 *
 *   1. The discount is applied to every row a shopper can be charged from,
 *      product *and* variants, or the till keeps quoting the old figure.
 *   2. It never raises a price, and never lands on zero.
 *   3. A close restores exactly what was recorded, and refuses to touch a row
 *      an admin edited while the sale ran.
 *   4. A window that has already passed cannot be saved.
 *
 *   npm run check:flash
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

const row = (
  id: string,
  priceCents: number,
  compareAtPriceCents: number | null = null,
): PricedRow => ({ id, priceCents, compareAtPriceCents });

console.log("\nThe arithmetic");

check("20% off 1000 is 800", flashPriceCents(1000, 20) === 800);
check("50% off 999 rounds to 500", flashPriceCents(999, 50) === 500);
check("rounds rather than floors", flashPriceCents(1005, 10) === 905);
check(
  "never reaches zero",
  flashPriceCents(1, MAX_PERCENT_OFF) === 1,
  `got ${flashPriceCents(1, MAX_PERCENT_OFF)}`,
);
check(
  "never exceeds the original",
  [1, 7, 99, 100, 12345].every((price) =>
    [MIN_PERCENT_OFF, 20, 50, MAX_PERCENT_OFF].every(
      (percent) => flashPriceCents(price, percent) <= price,
    ),
  ),
);

console.log("\nEvery chargeable row is written");

const withVariants = applyPlan(
  row("p1", 2000),
  [row("v1", 1800), row("v2", 2400)],
  25,
);

check("the product row is written", withVariants.product?.priceCents === 1500);
check("every variant is written", withVariants.variants.length === 2);
check(
  "each variant is discounted from its own price",
  withVariants.variants[0].priceCents === 1350 &&
    withVariants.variants[1].priceCents === 1800,
);
check(
  "the “was” price becomes what it cost immediately before",
  withVariants.product?.compareAtPriceCents === 2000 &&
    withVariants.variants[0].compareAtPriceCents === 1800,
);
check(
  "the snapshot records both directions",
  withVariants.snapshot.product?.fromCents === 2000 &&
    withVariants.snapshot.product?.toCents === 1500,
);

console.log("\nA row that would not be reduced is left alone");

// 1% off 10 cents rounds back to 10 — writing it would be a no-op that still
// overwrote the compare-at, so it is skipped entirely.
const noEffect = applyPlan(row("p1", 10), [], 1);
check("a rounding no-op writes nothing", planIsEmpty(noEffect));
check("a zero price writes nothing", planIsEmpty(applyPlan(row("p1", 0), [], 50)));

const alreadyDiscounted = applyPlan(row("p1", 1000, 4000), [], 20);
check(
  "an existing “was” price is preserved in the snapshot",
  alreadyDiscounted.snapshot.product?.fromCompareAtCents === 4000,
);
check(
  "and replaced with the pre-flash price on the row",
  alreadyDiscounted.product?.compareAtPriceCents === 1000,
);

console.log("\nClosing restores exactly what was recorded");

const snapshot = withVariants.snapshot;
const untouched = restorePlan(snapshot, {
  product: row("p1", 1500, 2000),
  variants: [row("v1", 1350, 1800), row("v2", 1800, 2400)],
});

check("the product price goes back", untouched.product?.priceCents === 2000);
check(
  "the “was” price goes back to what it was, including null",
  untouched.product?.compareAtPriceCents === null,
);
check("every variant goes back", untouched.variants.length === 2);
check("nothing was skipped", untouched.skipped === 0);

const restoredCompareAt = restorePlan(alreadyDiscounted.snapshot, {
  product: row("p1", 800, 1000),
  variants: [],
});
check(
  "a pre-existing “was” price is put back",
  restoredCompareAt.product?.compareAtPriceCents === 4000,
);

console.log("\nAn admin edit during the sale is never clobbered");

const edited = restorePlan(snapshot, {
  // Someone repriced the product by hand while the sale ran.
  product: row("p1", 1200, 2000),
  variants: [row("v1", 1350, 1800), row("v2", 1800, 2400)],
});
check("the edited row is skipped", edited.product === null);
check("the skip is counted", edited.skipped === 1);
check("its siblings still restore", edited.variants.length === 2);

const deleted = restorePlan(snapshot, {
  product: row("p1", 1500, 2000),
  // A variant removed while the sale ran.
  variants: [row("v1", 1350, 1800)],
});
check("a vanished row is skipped, not invented", deleted.variants.length === 1);
check("and counted", deleted.skipped === 1);

console.log("\nSnapshots are read defensively");

check("null is unreadable", readSnapshot(null) === null);
check("a string is unreadable", readSnapshot("nope") === null);
check("an empty object is unreadable", readSnapshot({}) === null);
check(
  "a malformed row is dropped rather than trusted",
  readSnapshot({ product: { id: "p1", fromCents: "2000", toCents: 1500 } }) === null,
);
check(
  "a well-formed snapshot round-trips",
  readSnapshot(JSON.parse(JSON.stringify(snapshot)) as PriceSnapshot)?.variants
    .length === 2,
);

console.log("\nThe window decides whether it is live");

const window = {
  startsAt: new Date("2026-08-07T10:00:00Z"),
  endsAt: new Date("2026-08-07T12:00:00Z"),
  active: true,
};

check("before the start is not live", !shouldBeLive(window, new Date("2026-08-07T09:59:59Z")));
check("at the start is live", shouldBeLive(window, new Date("2026-08-07T10:00:00Z")));
check("inside is live", shouldBeLive(window, new Date("2026-08-07T11:00:00Z")));
check(
  "at the end is not live",
  !shouldBeLive(window, new Date("2026-08-07T12:00:00Z")),
  "the end is exclusive, so a sale is never live at the instant it closes",
);
check(
  "switched off is never live",
  !shouldBeLive({ ...window, active: false }, new Date("2026-08-07T11:00:00Z")),
);

console.log("\nThe form refuses what could never run");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
};

/**
 * `datetime-local` submits wall-clock time with no zone, and `parseFlashSale`
 * reads it in the server's zone — so a fixture written as a literal string
 * would mean a different instant on a machine in a different country, and this
 * suite would pass or fail by geography. Every window below is therefore built
 * as an offset from `now` and converted the same way the browser would.
 */
const toLocalInput = (date: Date): string => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const HOUR = 3_600_000;
const now = new Date("2026-08-07T10:00:00Z");
const at = (hoursFromNow: number) => toLocalInput(new Date(now.getTime() + hoursFromNow * HOUR));

const valid = {
  name: "Weekend flash",
  percentOff: "20",
  startsAt: at(1),
  endsAt: at(5),
  active: "on",
};

check("a well-formed sale is accepted", parseFlashSale(form(valid), now).ok);

const noName = parseFlashSale(form({ ...valid, name: "  " }), now);
check("a blank name is refused", !noName.ok && "name" in noName.errors);

const tooDeep = parseFlashSale(
  form({ ...valid, percentOff: String(MAX_PERCENT_OFF + 1) }),
  now,
);
check("more than the cap is refused", !tooDeep.ok && "percentOff" in tooDeep.errors);

const zero = parseFlashSale(form({ ...valid, percentOff: "0" }), now);
check("zero percent is refused", !zero.ok && "percentOff" in zero.errors);

const fractional = parseFlashSale(form({ ...valid, percentOff: "12.5" }), now);
check("a fractional percentage is refused", !fractional.ok);

const backwards = parseFlashSale(
  form({ ...valid, startsAt: at(5), endsAt: at(1) }),
  now,
);
check("a window that closes first is refused", !backwards.ok && "endsAt" in backwards.errors);

const past = parseFlashSale(form({ ...valid, startsAt: at(-48), endsAt: at(-24) }), now);
check(
  "a window already behind us is refused",
  !past.ok && "endsAt" in past.errors,
  "saving one produces a row that looks scheduled and can never apply a price",
);

const noWindow = parseFlashSale(form({ ...valid, startsAt: "", endsAt: "" }), now);
check(
  "an open-ended sale is refused",
  !noWindow.ok && "startsAt" in noWindow.errors && "endsAt" in noWindow.errors,
);

const inactive = parseFlashSale(
  form({ name: valid.name, percentOff: valid.percentOff, startsAt: valid.startsAt, endsAt: valid.endsAt }),
  now,
);
check(
  "an absent checkbox means inactive",
  inactive.ok && inactive.data.active === false,
);

console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} check${failures === 1 ? "" : "s"} failed.\n`,
);

process.exit(failures === 0 ? 0 : 1);
