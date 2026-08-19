import { MAX_STOCK_TAKE_LINES, planStockTake } from "../src/lib/inventory/stock-take";

/**
 * Checks for the stock take.
 *
 * A stock take is many "set" adjustments decided at once, so what is defended
 * is that the batch is judged line by line by the same rules as a single
 * adjustment, that blank and matching counts are told apart from changes, and
 * that a grid that did not post cleanly is refused rather than guessed at —
 * a count landing on the wrong line is the one outcome worse than no count.
 *
 *   npm run check:stock-take
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

console.log("\nCounts are sorted into changes, matches and blanks");

const mixed = planStockTake({
  keys: ["p1", "p2:v1", "p3", "p4"],
  expected: ["10", "3", "0", "7"],
  counted: ["12", "3", "", "5"],
});
check("the batch is accepted", mixed.ok);
if (mixed.ok) {
  check("two lines differ", mixed.data.changes.length === 2);
  check("one line matches", mixed.data.unchanged === 1);
  check("one line was not counted", mixed.data.skipped === 1);
  const up = mixed.data.changes.find((c) => c.key === "p1");
  const down = mixed.data.changes.find((c) => c.key === "p4");
  check("a rise plans +2 to 12", up?.plan.delta === 2 && up?.plan.stock === 12);
  check("a fall plans −2 to 5", down?.plan.delta === -2 && down?.plan.stock === 5);
  const variantLine = planStockTake({ keys: ["p2:v1"], expected: ["3"], counted: ["9"] });
  check(
    "a variant key carries both ids",
    variantLine.ok &&
      variantLine.data.changes[0].productId === "p2" &&
      variantLine.data.changes[0].variantId === "v1",
  );
  const productLine = planStockTake({ keys: ["p9"], expected: ["3"], counted: ["9"] });
  check("a product key has no variant", productLine.ok && productLine.data.changes[0].variantId === null);
}

console.log("\nThe same rules as a single adjustment");

check("a negative count is refused", !planStockTake({ keys: ["p1"], expected: ["3"], counted: ["-1"] }).ok);
check("a fraction is refused", !planStockTake({ keys: ["p1"], expected: ["3"], counted: ["2.5"] }).ok);
check("a word is refused", !planStockTake({ keys: ["p1"], expected: ["3"], counted: ["lots"] }).ok);
check(
  "a count to zero is allowed — that is what an empty shelf looks like",
  (() => {
    const r = planStockTake({ keys: ["p1"], expected: ["3"], counted: ["0"] });
    return r.ok && r.data.changes[0].plan.stock === 0 && r.data.changes[0].plan.delta === -3;
  })(),
);
check(
  "surrounding spaces are fine",
  (() => {
    const r = planStockTake({ keys: [" p1 "], expected: ["3"], counted: [" 4 "] });
    return r.ok && r.data.changes[0].key === "p1";
  })(),
);

console.log("\nA grid that did not post cleanly is refused, not guessed at");

check("ragged arrays are refused", !planStockTake({ keys: ["p1", "p2"], expected: ["3"], counted: ["4", "5"] }).ok);
check("an empty grid is refused", !planStockTake({ keys: [], expected: [], counted: [] }).ok);
check("a duplicate line is refused", !planStockTake({ keys: ["p1", "p1"], expected: ["3", "3"], counted: ["4", "5"] }).ok);
check("a blank key is refused", !planStockTake({ keys: [""], expected: ["3"], counted: ["4"] }).ok);
check("a tampered expected level is refused", !planStockTake({ keys: ["p1"], expected: ["-3"], counted: ["4"] }).ok);
check(
  "the batch has a ceiling",
  !planStockTake({
    keys: Array.from({ length: MAX_STOCK_TAKE_LINES + 1 }, (_, i) => `p${i}`),
    expected: Array.from({ length: MAX_STOCK_TAKE_LINES + 1 }, () => "1"),
    counted: Array.from({ length: MAX_STOCK_TAKE_LINES + 1 }, () => ""),
  }).ok,
);
check(
  "and a batch at the ceiling is fine",
  planStockTake({
    keys: Array.from({ length: MAX_STOCK_TAKE_LINES }, (_, i) => `p${i}`),
    expected: Array.from({ length: MAX_STOCK_TAKE_LINES }, () => "1"),
    counted: Array.from({ length: MAX_STOCK_TAKE_LINES }, () => ""),
  }).ok,
);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
