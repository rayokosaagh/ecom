import {
  addDays,
  bucketByDay,
  currentPeriod,
  dayKey,
  delta,
  eachDay,
  formatCompact,
  formatCompactMoney,
  formatDelta,
  parseRange,
  previousPeriod,
  startOfDay,
} from "../src/lib/dashboard/range";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  areaPath,
  linePath,
  nearestIndex,
  niceTicks,
  scaleMax,
  shares,
  toPoints,
} from "../src/components/charts/geometry";
import { StackedBar } from "../src/components/charts/StackedBar";
import { TrendChart } from "../src/components/charts/TrendChart";
import {
  CURRENCIES,
  convertMinor,
  currencySymbol,
  formatMoney,
} from "../src/lib/money/currency";

/**
 * `Intl` separates a currency symbol from its digits with a non-breaking space
 * (U+00A0) — deliberately, so "Rs" can never wrap onto a line without its
 * number. It is invisible in a failure message, which makes a mismatch here
 * look like two identical strings that refuse to be equal, so comparisons
 * normalise it rather than fighting it.
 */
const sameText = (a: string, b: string) =>
  a.replace(/ /g, " ") === b.replace(/ /g, " ");

/**
 * Checks for the overview's arithmetic.
 *
 * A dashboard is the one screen nobody double-checks — a chart that is subtly
 * wrong is believed, and believed for a long time. So the parts that can be
 * wrong without looking wrong are asserted here: which day a row lands on,
 * what a percentage change is when there is nothing to compare against, and
 * whether an axis tick can quietly understate the series it is scaling.
 *
 * Everything under test is pure and takes its clock as an argument, so these
 * run against fixed dates rather than against today.
 *
 *   npm run check:dashboard
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

function equal(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  check(label, a === b, a === b ? "" : `expected ${b}\n        got      ${a}`);
}

// A Friday, mid-afternoon — far enough from midnight that a timezone slip
// would show up as an off-by-one day rather than hiding.
const NOW = new Date(2026, 7, 7, 15, 30);

console.log("\nThe range comes from a URL, so it can be anything");

equal("a known range is kept", parseRange("7"), 7);
equal("an unknown number falls back", parseRange("13"), 30);
equal("nonsense falls back", parseRange("../etc/passwd"), 30);
equal("missing falls back", parseRange(undefined), 30);
equal("a repeated param takes the first", parseRange(["90", "7"]), 90);

console.log("\nA window counts days, not 24-hour blocks");

const week = currentPeriod(7, NOW);
equal("7 days ends tomorrow midnight", dayKey(week.end), "2026-08-08");
equal("7 days starts six days back", dayKey(week.start), "2026-08-01");
equal("7 days holds seven days", eachDay(week).length, 7);
check("today is the last day", dayKey(eachDay(week)[6]) === dayKey(NOW));
check(
  "the window starts at midnight",
  week.start.getHours() === 0 && week.start.getMinutes() === 0,
);

const before = previousPeriod(week);
equal("the previous window is the same length", eachDay(before).length, 7);
equal("it ends where the current one starts", before.end.getTime(), week.start.getTime());
equal("it starts seven days earlier", dayKey(before.start), "2026-07-25");
check(
  "the two windows do not overlap",
  before.end <= week.start && eachDay(before).every((day) => day < week.start),
);

console.log("\nA window that spans a month or a leap day still counts right");

for (const [label, now] of [
  ["month end", new Date(2026, 2, 1, 9, 0)],
  ["year end", new Date(2026, 0, 2, 9, 0)],
  ["leap day", new Date(2028, 1, 29, 9, 0)],
] as const) {
  for (const days of [7, 30, 90]) {
    const period = currentPeriod(days, now);
    const listed = eachDay(period);
    check(
      `${label}, ${days} days: exactly ${days} distinct days`,
      listed.length === days && new Set(listed.map(dayKey)).size === days,
    );
    check(
      `${label}, ${days} days: every day is midnight`,
      listed.every((day) => day.getHours() === 0),
    );
  }
}

console.log("\nRows land in the day they happened, and nowhere else");

const rows = [
  { at: new Date(2026, 7, 7, 23, 59), cents: 100 }, // today, last minute
  { at: new Date(2026, 7, 7, 0, 0), cents: 200 }, // today, first minute
  { at: new Date(2026, 7, 1, 12, 0), cents: 400 }, // first day of the window
  { at: new Date(2026, 6, 31, 23, 59), cents: 800 }, // one minute before it
  { at: new Date(2026, 7, 8, 0, 1), cents: 1600 }, // after the window
];

const counted = bucketByDay(rows, week, (row) => row.at, (row) => row.cents);
equal("same-day rows are summed", counted[6], 300);
equal("the first day is its own bucket", counted[0], 400);
equal("a row before the window is dropped", counted.reduce((a, b) => a + b, 0), 700);
equal("the series is one value per day", counted.length, 7);
equal(
  "counting rows is the default",
  bucketByDay(rows, week, (row) => row.at).reduce((a, b) => a + b, 0),
  3,
);
equal("no rows is a series of zeroes", bucketByDay([], week, (row: never) => row), [
  0, 0, 0, 0, 0, 0, 0,
]);

console.log("\nA day boundary is local, and midnight belongs to the day it opens");

const midnight = new Date(2026, 7, 7, 0, 0, 0);
equal("midnight is its own day", dayKey(midnight), "2026-08-07");
equal("startOfDay strips the time", startOfDay(NOW).getTime(), midnight.getTime());
equal("addDays crosses a month", dayKey(addDays(new Date(2026, 7, 31), 1)), "2026-09-01");
equal("addDays goes backwards", dayKey(addDays(new Date(2026, 7, 1), -1)), "2026-07-31");

console.log("\nChange against nothing is not a percentage");

equal("growth from zero has no ratio", delta(500, 0), null);
equal("zero from zero has no ratio", delta(0, 0), null);
equal("a fall to zero is -100%", delta(0, 400)?.ratio, -1);
equal("doubling is +100%", delta(800, 400)?.ratio, 1);
equal("halving reads as down", delta(200, 400)?.direction, "down");
equal("an unchanged figure is flat", delta(400, 400)?.direction, "flat");
equal("a rounding-level wobble is flat", delta(400.01, 400)?.direction, "flat");
equal("+42% renders with a sign", formatDelta({ ratio: 0.42, direction: "up" }), "+42%");
check(
  "a fall renders with a minus, not a hyphen",
  formatDelta({ ratio: -0.42, direction: "down" }) === "−" + "42%",
);
equal("a small change keeps a decimal", formatDelta({ ratio: 0.034, direction: "up" }), "+3.4%");

console.log("\nBig numbers are shortened, and never lie about their sign");

equal("under ten thousand is exact", formatCompact(1284), "1,284");
equal("thousands are compacted", formatCompact(12_900), "12.9K");
equal("millions are compacted", formatCompact(3_400_000), "3.4M");
// Asserted against the active currency rather than against "$", so these keep
// meaning something after a currency switch instead of having to be rewritten.
// `money()` is the same shape the function itself builds, minus the amount.
const money = (text: string) => {
  const symbol = currencySymbol();
  return `${symbol}${/[A-Za-z]$/.test(symbol) ? " " : ""}${text}`;
};

equal("money is major units", formatCompactMoney(423_100), money("4,231"));
equal("compact money keeps the symbol first", formatCompactMoney(1_290_000), money("12.9K"));
equal("a negative sign leads the symbol", formatCompactMoney(-423_100), `-${money("4,231")}`);
equal("zero is zero", formatCompactMoney(0), money("0"));

console.log("\nAn axis never understates the series it scales");

for (const max of [1, 3, 7, 42, 99, 100, 101, 1234, 98_765, 1_000_001, 0.5]) {
  const ticks = niceTicks(max);
  check(
    `max ${max}: the top tick covers it`,
    scaleMax(ticks) >= max,
    `top tick ${scaleMax(ticks)}`,
  );
  check(
    `max ${max}: ticks ascend from zero`,
    ticks[0] === 0 && ticks.every((tick, i) => i === 0 || tick > ticks[i - 1]),
    ticks.join(", "),
  );
  check(
    `max ${max}: no floating point dust`,
    ticks.every((tick) => String(tick).replace("-", "").replace(".", "").length <= 12),
    ticks.join(", "),
  );
}

equal("an empty series still gets an axis", niceTicks(0), [0, 1]);
equal("a negative maximum still gets an axis", niceTicks(-5), [0, 1]);
check("NaN cannot reach the scale", scaleMax(niceTicks(Number.NaN)) === 1);

console.log("\nGeometry holds at the edges");

equal("a lone point sits centred", toPoints([5], 10, 100, 50)[0].x, 50);
equal("a lone point is not clipped", linePath(toPoints([5], 10, 100, 50)).startsWith("M 50"), true);
equal("no points draw nothing", linePath([]), "");
equal("no points have no area", areaPath([], 50), "");
check(
  "the area closes on its own plot's baseline",
  areaPath(toPoints([1, 2], 2, 100, 50), 50).endsWith("L 100 50 L 0 50 Z"),
  areaPath(toPoints([1, 2], 2, 100, 50), 50),
);
equal("zero maps to the baseline", toPoints([0], 10, 100, 50)[0].y, 50);
equal("the maximum maps to the top", toPoints([10], 10, 100, 50)[0].y, 0);
check(
  "a value above the maximum is clamped, not drawn off-plot",
  toPoints([20], 10, 100, 50)[0].y === 0,
);

console.log("\nSegments of a bar add up to exactly one bar");

for (const values of [
  [1, 1, 1],
  [1, 0, 0],
  [7, 3],
  [1, 2, 3, 4],
  [999_999, 1],
  [0, 0, 0, 1],
]) {
  const percentages = shares(values);
  const total = percentages.reduce((a, b) => a + b, 0);
  check(
    `[${values.join(", ")}] totals 100%`,
    Math.abs(total - 100) < 0.0001,
    `got ${total}`,
  );
  check(
    `[${values.join(", ")}] gives nothing to empty states`,
    values.every((value, i) => value > 0 || percentages[i] === 0),
    percentages.join(", "),
  );
}

equal("an empty bar has no segments", shares([0, 0]), [0, 0]);

console.log("\nThe crosshair snaps inside the plot");

equal("the left edge is the first point", nearestIndex(0, 30), 0);
equal("the right edge is the last", nearestIndex(1, 30), 29);
equal("the middle is the middle", nearestIndex(0.5, 31), 15);
equal("a pointer dragged past the edge clamps", nearestIndex(1.4, 30), 29);
equal("a negative ratio clamps", nearestIndex(-0.4, 30), 0);
equal("an empty series has no nearest point", nearestIndex(0.5, 0), -1);

console.log("\nMoney converts without losing or inventing any");

for (const [label, code] of [["rupees", "NPR"], ["dollars", "USD"]] as const) {
  const currency = CURRENCIES[code];
  check(
    `${label}: zero stays zero`,
    convertMinor(0, 142, currency.priceStepMinor) === 0,
    "free is not a price to be rounded up to the nearest 100",
  );
  check(
    `${label}: a tiny amount never rounds away to nothing`,
    convertMinor(1, 0.001, currency.priceStepMinor) > 0,
    "a Rs 0 line claims something was free when it was merely cheap",
  );
}

const npr = CURRENCIES.NPR;
equal("$79 at 142 rounds to Rs 11,200", convertMinor(7_900, 142, npr.priceStepMinor), 1_120_000);
equal("$2,299 at 142 rounds to Rs 3,26,500", convertMinor(229_900, 142, npr.priceStepMinor), 32_650_000);
check(
  "every converted price lands on a whole step",
  [7_900, 11_900, 229_900, 5_900, 2_900, 129_900].every(
    (usd) => convertMinor(usd, 142, npr.priceStepMinor) % npr.priceStepMinor === 0,
  ),
);
check(
  "converting is monotonic — a dearer product never becomes the cheaper one",
  [2_900, 5_900, 7_900, 11_900, 129_900, 229_900].every((usd, i, all) => {
    if (i === 0) return true;
    return (
      convertMinor(usd, 142, npr.priceStepMinor) >=
      convertMinor(all[i - 1], 142, npr.priceStepMinor)
    );
  }),
);

console.log("\nPrices read the way each currency is written");

check(
  "rupees group the South Asian way",
  sameText(formatMoney(17_540_000, CURRENCIES.NPR), "Rs 1,75,400"),
  formatMoney(17_540_000, CURRENCIES.NPR),
);
check(
  "a whole rupee shows no paisa",
  sameText(formatMoney(1_070_000, CURRENCIES.NPR), "Rs 10,700"),
  formatMoney(1_070_000, CURRENCIES.NPR),
);
check(
  "a fraction of a rupee is still shown, not rounded into a lie",
  sameText(formatMoney(1_070_050, CURRENCIES.NPR), "Rs 10,700.5"),
  formatMoney(1_070_050, CURRENCIES.NPR),
);
check(
  "dollars keep their cents",
  sameText(formatMoney(7_900, CURRENCIES.USD), "$79.00"),
  formatMoney(7_900, CURRENCIES.USD),
);
check(
  "dollars group the western way",
  sameText(formatMoney(22_990_000, CURRENCIES.USD), "$229,900.00"),
  formatMoney(22_990_000, CURRENCIES.USD),
);

console.log("\nThe marks actually render");

/**
 * Rendered rather than reasoned about.
 *
 * The arithmetic above can all be right while the component still emits
 * `width: NaN%` or an empty `d=""`, because a component divides by things the
 * pure functions never see. Static markup is the cheapest place to catch that:
 * a browser shows it as a blank card, and a blank card looks like "no data".
 */
const pipeline = renderToStaticMarkup(
  createElement(StackedBar, {
    segments: [
      { label: "Pending", value: 3, color: "var(--color-chart-step-1)", icon: "schedule" },
      { label: "Paid", value: 12, color: "var(--color-chart-step-2)", icon: "payments" },
      { label: "Shipped", value: 0, color: "var(--color-chart-step-3)", icon: "local_shipping" },
      { label: "Cancelled", value: 1, color: "var(--color-chart-critical)", icon: "cancel" },
    ],
    emptyMessage: "none",
  }),
);

const widths = [...pipeline.matchAll(/width:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
equal("a bar draws one segment per non-empty state", widths.length, 3);
check(
  "its segments fill the bar exactly",
  Math.abs(widths.reduce((a, b) => a + b, 0) - 100) < 0.0001,
  `got ${widths.reduce((a, b) => a + b, 0)}%`,
);
check("an empty state is still named in the legend", pipeline.includes("Shipped"));
check("every count is readable as text", pipeline.includes(">12<") && pipeline.includes(">3<"));

const trend = renderToStaticMarkup(
  createElement(TrendChart, {
    points: [
      { label: "1 Aug", full: "Aug 1, 2026", value: 0 },
      { label: "2 Aug", full: "Aug 2, 2026", value: 4200 },
      { label: "3 Aug", full: "Aug 3, 2026", value: 1900 },
    ],
    comparison: [1000, 0, 3000],
    format: "money",
    seriesLabel: "Revenue",
  }),
);

check("the trend draws a line", /<path[^>]+d="M [\d.]+ [\d.]+ L/.test(trend));
check(
  "it labels its endpoint without hover",
  // React writes the non-breaking space through as the literal character
  // rather than as an `&nbsp;` entity, so the markup holds exactly what
  // `formatMoney` returned.
  trend.includes(formatMoney(1_900)),
  formatMoney(1_900),
);
check("its axis is labelled", trend.includes(currencySymbol()));

const flat = renderToStaticMarkup(
  createElement(TrendChart, {
    points: [{ label: "1 Aug", full: "Aug 1, 2026", value: 0 }],
    format: "count",
    seriesLabel: "Orders",
  }),
);

// A brand new shop is the first thing anyone sees, and it is all zeroes and a
// single day — the case most likely to divide by nothing.
check("a single all-zero day still renders", flat.includes("<svg") && flat.includes("<path"));

for (const [label, markup] of [
  ["pipeline", pipeline],
  ["trend", trend],
  ["one flat day", flat],
] as const) {
  check(
    `${label}: no NaN, Infinity or undefined reaches the DOM`,
    !/NaN|Infinity|undefined/.test(markup),
    markup.match(/.{0,40}(NaN|Infinity|undefined).{0,40}/)?.[0],
  );
  check(`${label}: no empty path is drawn`, !markup.includes('d=""'));
}

console.log(
  failures === 0
    ? "\nAll dashboard checks passed.\n"
    : `\n${failures} check(s) failed.\n`,
);
process.exitCode = failures === 0 ? 0 : 1;
