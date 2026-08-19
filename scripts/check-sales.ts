import {
  MAX_PRICE_CENTS,
  compareAtError,
  isOnSale,
  saleFor,
  saleProblem,
} from "../src/lib/products/sale";
import { priceRange } from "../src/lib/products/variants";
import {
  GRID_TINT_INDICES,
  LEAD_TINT_INDEX,
  SALE_TINTS,
  saleTintPair,
} from "../src/components/products/sale-tints";

/**
 * Checks for sale pricing.
 *
 * Same reasoning as the other suites: this decides what a shopper is told a
 * product used to cost, and a claim about a discount is one people act on.
 * Three things are being defended.
 *
 * A "was" price that is not above the price is not a sale, and must never
 * render as one. A configurable product must quote the *same* configuration
 * the card prices it at, or the discount advertised is one nobody can buy. And
 * the percentage must be the real one — a badge that rounds a rounding error up
 * to "1% off" is a claim that was not earned.
 *
 *   npm run check:sales
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

const plain = (priceCents: number, compareAtPriceCents: number | null = null) => ({
  priceCents,
  compareAtPriceCents,
});

console.log("\nA sale needs a “was” price above the price");

check("no “was” price is no sale", saleFor(plain(1000)) === null);
check("an explicit null is no sale", saleFor(plain(1000, null)) === null);
check("a lower “was” price is no sale", saleFor(plain(1000, 900)) === null);
check("an equal “was” price is no sale", saleFor(plain(1000, 1000)) === null);
check("a higher “was” price is a sale", saleFor(plain(750, 1000)) !== null);
check("isOnSale agrees", isOnSale(plain(750, 1000)) && !isOnSale(plain(1000, 1000)));

console.log("\nThe arithmetic");

const quarter = saleFor(plain(750, 1000));
check("saving is the difference", quarter?.savingCents === 250);
check("percent is rounded from the saving", quarter?.percentOff === 25);
check("the price reported is the price charged", quarter?.priceCents === 750);
check("the “was” reported is the “was” stored", quarter?.compareAtCents === 1000);

check("a third off rounds to 33%", saleFor(plain(6667, 10000))?.percentOff === 33);
check("free is 100% off", saleFor(plain(0, 5000))?.percentOff === 100);

// Honest reporting rather than a flattering floor: $0.40 off $1,000 really is
// 0% to the nearest point, and the card suppresses the badge on that basis
// while still showing the "was" line.
const tiny = saleFor(plain(99_960, 100_000));
check("a sub-half-percent saving is still a sale", tiny !== null);
check("and it reports 0%, not 1%", tiny?.percentOff === 0, String(tiny?.percentOff));

console.log("\nA configurable product quotes the configuration it prices");

const product = plain(9999);
const variants = [
  { priceCents: 90_000, compareAtPriceCents: 120_000 }, // dearest, 25% off
  { priceCents: 50_000, compareAtPriceCents: 65_000 }, // cheapest, ~23% off
  { priceCents: 70_000, compareAtPriceCents: null },
];

const configured = saleFor(product, variants);
const range = priceRange(product, variants);

check(
  "the sale is read from the cheapest variant, which is the one shown",
  configured?.priceCents === range.minCents,
  `sale ${configured?.priceCents} vs range ${range.minCents}`,
);
check(
  "so the “was” is that variant's, not the deepest discount elsewhere",
  configured?.compareAtCents === 65_000,
  String(configured?.compareAtCents),
);
check(
  "the product's own price is ignored once variants exist",
  saleFor(plain(10, 1_000_000), variants)?.compareAtCents === 65_000,
);
check(
  "a cheapest variant with no “was” price means no sale",
  saleFor(product, [
    { priceCents: 50_000, compareAtPriceCents: null },
    { priceCents: 90_000, compareAtPriceCents: 120_000 },
  ]) === null,
);
check(
  "an empty variant list falls back to the product",
  saleFor(plain(750, 1000), [])?.percentOff === 25,
);

console.log("\nEvery card on the shelf is a different colour");

// The bug this pins down: the lead was pinned to one tint while the row cycled
// the whole palette from 0, so the lead's colour came back around on the second
// card and the shelf showed two mint cards.
check(
  "the row never draws the lead's colour",
  !GRID_TINT_INDICES.includes(LEAD_TINT_INDEX),
  `lead ${LEAD_TINT_INDEX} vs row [${GRID_TINT_INDICES.join(", ")}]`,
);
check(
  "the row's own colours are distinct",
  new Set(GRID_TINT_INDICES).size === GRID_TINT_INDICES.length,
);
check(
  "the palette has a colour for every card a full shelf shows",
  // One lead plus the three beneath it.
  SALE_TINTS.length >= 4,
  `${SALE_TINTS.length} tints`,
);

// The assignment the section actually makes, asserted end to end.
const shelfIndices = [
  LEAD_TINT_INDEX,
  ...[0, 1, 2].map((i) => GRID_TINT_INDICES[i % GRID_TINT_INDICES.length]),
];
check(
  "a full four-card shelf uses four different tints",
  new Set(shelfIndices).size === shelfIndices.length,
  `[${shelfIndices.join(", ")}]`,
);
check(
  "and every one of them resolves to a distinct fill",
  new Set(shelfIndices.map((i) => SALE_TINTS[i].fill)).size === shelfIndices.length,
);

console.log("\nHover always moves a card to a different colour");

for (const slug of ["a", "dell-precision-5690", "asus-rog-strix-g16", "zzz-long-slug"]) {
  for (const tintIndex of shelfIndices) {
    const pair = saleTintPair(tintIndex, slug);
    if (pair.base.fill === pair.hover.fill) {
      check(`${slug} @ tint ${tintIndex} changes on hover`, false);
    }
  }
}
check("checked every shelf tint against several slugs", true);

check(
  "the resting colour is the one asked for, not one derived from the slug",
  saleTintPair(2, "anything").base.fill === SALE_TINTS[2].fill,
);

console.log("\nWhy no discount is showing");

check(
  "nothing set anywhere is not a problem",
  saleProblem(plain(1000)) === null,
);
check(
  "a running sale is not a problem",
  saleProblem(plain(750, 1000)) === null,
);
check(
  "the figures the wrong way round",
  saleProblem(plain(1000, 900)) === "NOT_ABOVE_PRICE",
);
check("equal figures", saleProblem(plain(1000, 1000)) === "NOT_ABOVE_PRICE");

// The case that made this function necessary: the "was" price really is above
// the product's price, so "not above the price" would be a false statement —
// it is ignored because the product is priced by its configurations.
check(
  "set on the product when the product is priced by variants",
  saleProblem(plain(1000, 5000), [
    { priceCents: 50_000, compareAtPriceCents: null },
    { priceCents: 90_000, compareAtPriceCents: null },
  ]) === "SET_ON_PRODUCT_NOT_VARIANT",
);
check(
  "but not once a variant carries one that works",
  saleProblem(plain(1000, 5000), [
    { priceCents: 50_000, compareAtPriceCents: 65_000 },
    { priceCents: 90_000, compareAtPriceCents: null },
  ]) === null,
);
check(
  "a variant “was” below its price is still reported the ordinary way",
  saleProblem(plain(1000), [{ priceCents: 50_000, compareAtPriceCents: 40_000 }]) ===
    "NOT_ABOVE_PRICE",
);

console.log("\nWhat the admin form will accept");

check("blank is always fine — it is how a sale ends", compareAtError(1000, null) === null);
check("above the price is accepted", compareAtError(1000, 1500) === null);
check("equal to the price is refused", compareAtError(1000, 1000) !== null);
check("below the price is refused", compareAtError(1000, 999) !== null);
check("negative is refused", compareAtError(1000, -1) !== null);
check("a fractional cent is refused", compareAtError(1000, 1500.5) !== null);
check("beyond the ceiling is refused", compareAtError(1000, MAX_PRICE_CENTS + 1) !== null);
check("at the ceiling is accepted", compareAtError(1000, MAX_PRICE_CENTS) === null);

// The form and the storefront have to agree, or an admin can save something
// that renders as no sale at all — which is the bug this pairing prevents.
console.log("\nThe form and the storefront agree");

for (const [priceCents, compareAtCents] of [
  [1000, 1500],
  [1000, 1000],
  [1000, 900],
  [0, 100],
] as const) {
  const accepted = compareAtError(priceCents, compareAtCents) === null;
  const renders = saleFor(plain(priceCents, compareAtCents)) !== null;
  check(
    `was ${compareAtCents} on price ${priceCents}: accepted=${accepted}, renders=${renders}`,
    accepted === renders,
  );
}

console.log("\nA sale with an end date");

const clock = new Date("2026-08-20T12:00:00Z");
const dated = saleFor({ priceCents: 8_000, compareAtPriceCents: 10_000, saleEndsAt: new Date("2026-08-25T12:00:00Z") }, [], clock);
check("a sale ending later is a sale", dated !== null);
check("and carries its end", dated?.endsAt?.toISOString() === "2026-08-25T12:00:00.000Z");
check("and how long is left, as of the read", dated?.endsInMs === 5 * 24 * 60 * 60 * 1000);
check(
  "a sale whose end has passed is not a sale, whatever the columns say",
  saleFor({ priceCents: 8_000, compareAtPriceCents: 10_000, saleEndsAt: new Date("2026-08-19T12:00:00Z") }, [], clock) === null,
);
check(
  "ending exactly now is over",
  saleFor({ priceCents: 8_000, compareAtPriceCents: 10_000, saleEndsAt: clock }, [], clock) === null,
);
check(
  "an end date arriving as a string is read",
  saleFor({ priceCents: 8_000, compareAtPriceCents: 10_000, saleEndsAt: "2026-08-25T12:00:00Z" }, [], clock)?.endsAt instanceof Date,
);
const undated = saleFor({ priceCents: 8_000, compareAtPriceCents: 10_000 }, [], clock);
check("a sale with no end has no end", undated !== null && undated.endsAt === null && undated.endsInMs === null);
check(
  "a configurable product reports its cheapest configuration's end",
  saleFor(
    { priceCents: 0 },
    [
      { priceCents: 9_000, compareAtPriceCents: 12_000, saleEndsAt: new Date("2026-09-01T00:00:00Z") },
      { priceCents: 8_000, compareAtPriceCents: 10_000, saleEndsAt: new Date("2026-08-25T12:00:00Z") },
    ],
    clock,
  )?.endsAt?.toISOString() === "2026-08-25T12:00:00.000Z",
);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
