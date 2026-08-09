import { judge } from "../src/lib/discounts/rules";
import { parseDiscount } from "../src/lib/discounts/validation";
import { DiscountKind } from "../src/generated/prisma/enums";

/**
 * Checks for the discount rules.
 *
 * Same reasoning as `check:svg` and `check:retry`: this is the arithmetic that
 * decides how much money comes off an order, and rules with no executable
 * statement of what they enforce are one edit away from not enforcing it.
 *
 * The cases that matter most are the ones where being wrong costs real money:
 * a discount larger than the basket, a percentage that ignores its cap, or a
 * one-per-customer code that can be used twice.
 *
 *   npm run check:discounts
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

const NOW = new Date("2026-06-15T12:00:00Z");

function code(overrides: Partial<Parameters<typeof judge>[0]> = {}) {
  return {
    code: "SAVE",
    kind: DiscountKind.PERCENT,
    value: 10,
    minSubtotalCents: 0,
    maxDiscountCents: null,
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    redemptions: 0,
    oncePerCustomer: true,
    active: true,
    ...overrides,
  };
}

/** The amount a verdict takes off, or -1 when it was refused. */
function amount(verdict: ReturnType<typeof judge>): number {
  return verdict.ok ? verdict.discountCents : -1;
}

console.log("\nWhat a code is worth");

check("10% of 10000 is 1000", amount(judge(code(), 10_000, 0, NOW)) === 1000);
check(
  "fixed takes its face value",
  amount(judge(code({ kind: DiscountKind.FIXED, value: 750 }), 10_000, 0, NOW)) === 750,
);
check(
  "percentage rounds to the nearest cent",
  // 33% of 1001 = 330.33 -> 330
  amount(judge(code({ value: 33 }), 1001, 0, NOW)) === 330,
);
check(
  "a cap limits a percentage",
  amount(judge(code({ value: 50, maxDiscountCents: 2000 }), 100_000, 0, NOW)) === 2000,
);
check(
  "a cap above the discount changes nothing",
  amount(judge(code({ value: 10, maxDiscountCents: 99_999 }), 10_000, 0, NOW)) === 1000,
);

console.log("\nThe total can never go negative");

check(
  "fixed larger than the basket is clamped to the basket",
  amount(judge(code({ kind: DiscountKind.FIXED, value: 50_000 }), 3_000, 0, NOW)) === 3000,
);
check(
  "100% takes the basket to zero, not below",
  amount(judge(code({ value: 100 }), 4_200, 0, NOW)) === 4200,
);

console.log("\nRules that refuse");

const refusals: [string, ReturnType<typeof judge>][] = [
  ["switched off", judge(code({ active: false }), 10_000, 0, NOW)],
  [
    "not started yet",
    judge(code({ startsAt: new Date("2026-07-01T00:00:00Z") }), 10_000, 0, NOW),
  ],
  [
    "already ended",
    judge(code({ endsAt: new Date("2026-06-01T00:00:00Z") }), 10_000, 0, NOW),
  ],
  [
    "fully claimed",
    judge(code({ maxRedemptions: 5, redemptions: 5 }), 10_000, 0, NOW),
  ],
  [
    "past the cap by more than one",
    judge(code({ maxRedemptions: 5, redemptions: 9 }), 10_000, 0, NOW),
  ],
  ["already used by this customer", judge(code(), 10_000, 1, NOW)],
  ["under the minimum spend", judge(code({ minSubtotalCents: 20_000 }), 10_000, 0, NOW)],
  ["worth nothing on an empty basket", judge(code(), 0, 0, NOW)],
  [
    "a percentage too small to move a cent",
    // 1% of 40 = 0.4 -> rounds to 0
    judge(code({ value: 1 }), 40, 0, NOW),
  ],
];

for (const [label, verdict] of refusals) {
  check(label, !verdict.ok, verdict.ok ? `took off ${verdict.discountCents}` : "");
}

console.log("\nRules that permit");

check(
  "reusable code ignores prior use",
  judge(code({ oncePerCustomer: false }), 10_000, 3, NOW).ok,
);
check(
  "exactly at the minimum spend is allowed",
  judge(code({ minSubtotalCents: 10_000 }), 10_000, 0, NOW).ok,
);
check(
  "one redemption left is still a redemption",
  judge(code({ maxRedemptions: 5, redemptions: 4 }), 10_000, 0, NOW).ok,
);
check(
  "the window is inclusive at both ends",
  judge(
    code({
      startsAt: new Date("2026-06-15T12:00:00Z"),
      endsAt: new Date("2026-06-15T12:00:00Z"),
    }),
    10_000,
    0,
    NOW,
  ).ok,
);

console.log("\nHow it describes itself");

const percent = judge(code({ code: "SPRING", value: 15 }), 10_000, 0, NOW);
check(
  "percentage label names the code and the rate",
  percent.ok && percent.label.includes("SPRING") && percent.label.includes("15%"),
  percent.ok ? percent.label : "",
);
const fixed = judge(
  code({ code: "TENOFF", kind: DiscountKind.FIXED, value: 1000 }),
  10_000,
  0,
  NOW,
);
check(
  "fixed label names the code and the amount",
  fixed.ok && fixed.label.includes("TENOFF") && /10/.test(fixed.label),
  fixed.ok ? fixed.label : "",
);
const short = judge(code({ minSubtotalCents: 5_000 }), 3_000, 0, NOW);
check(
  "the minimum-spend refusal says how much short",
  !short.ok && /20/.test(short.reason),
  short.ok ? "" : short.reason,
);

console.log("\nWhat the admin form accepts");

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

const validPercent = parseDiscount(
  form([
    ["code", "spring-20"],
    ["kind", "PERCENT"],
    ["percent", "20"],
    ["minSubtotal", "50.00"],
    ["active", "on"],
  ]),
);
check("a sound percentage code parses", validPercent.ok);
check(
  "the code is uppercased on the way in",
  validPercent.ok && validPercent.data.code === "SPRING-20",
  validPercent.ok ? validPercent.data.code : "",
);
check(
  "money becomes minor units",
  validPercent.ok && validPercent.data.minSubtotalCents === 5000,
);

const validFixed = parseDiscount(
  form([
    ["code", "TENOFF"],
    ["kind", "FIXED"],
    ["amount", "10.99"],
  ]),
);
check("a fixed amount parses to cents", validFixed.ok && validFixed.data.value === 1099);
check(
  "a ceiling is dropped for a fixed amount",
  validFixed.ok && validFixed.data.maxDiscountCents === null,
);
check(
  "an unchecked box means off, not missing",
  validFixed.ok &&
    validFixed.data.active === false &&
    validFixed.data.oncePerCustomer === false,
);

// Each of these must be caught here, because the browser's own constraints on
// the form are a convenience and a hand-made request has none of them.
const rejected: [string, FormData][] = [
  ["no code", form([["kind", "PERCENT"], ["percent", "10"]])],
  [
    "spaces and punctuation in the code",
    form([["code", "BAD CODE!"], ["kind", "PERCENT"], ["percent", "10"]]),
  ],
  ["0%", form([["code", "ZERO"], ["kind", "PERCENT"], ["percent", "0"]])],
  ["over 100%", form([["code", "TOOMUCH"], ["kind", "PERCENT"], ["percent", "250"]])],
  [
    "a fractional percentage",
    form([["code", "FRAC"], ["kind", "PERCENT"], ["percent", "12.5"]]),
  ],
  [
    "a negative percentage",
    form([["code", "NEG"], ["kind", "PERCENT"], ["percent", "-5"]]),
  ],
  ["a fixed amount of nothing", form([["code", "NIL"], ["kind", "FIXED"], ["amount", "0"]])],
  ["a negative amount", form([["code", "NEGAMT"], ["kind", "FIXED"], ["amount", "-10"]])],
  [
    "a window that closes before it opens",
    form([
      ["code", "BACKWARDS"],
      ["kind", "PERCENT"],
      ["percent", "10"],
      ["startsAt", "2026-08-01T00:00"],
      ["endsAt", "2026-07-01T00:00"],
    ]),
  ],
  [
    "a fractional use count",
    form([
      ["code", "HALFUSE"],
      ["kind", "PERCENT"],
      ["percent", "10"],
      ["maxRedemptions", "2.5"],
    ]),
  ],
  [
    "zero total uses",
    form([
      ["code", "NOUSES"],
      ["kind", "PERCENT"],
      ["percent", "10"],
      ["maxRedemptions", "0"],
    ]),
  ],
];

for (const [label, data] of rejected) {
  const result = parseDiscount(data);
  check(label, !result.ok, result.ok ? JSON.stringify(result.data) : "");
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
