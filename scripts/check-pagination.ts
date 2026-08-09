import { pageWindow } from "../src/components/products/Pagination";

/**
 * Checks for the page control.
 *
 * Pagination is where off-by-ones live, and every one of them is visible: a
 * missing last page strands a shopper, a duplicated number renders twice, and a
 * window that changes width reflows the control under the cursor.
 *
 * The clamping itself is asserted here too, as the pure arithmetic the pages
 * perform — a request for page 0, page -3 or page 900 has to land somewhere
 * real rather than on an empty grid.
 *
 *   npm run check:pagination
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

const show = (window: (number | null)[]) =>
  window.map((page) => page ?? "…").join(" ");

console.log("\nSmall runs are shown whole");

for (const total of [1, 2, 5, 7]) {
  const window = pageWindow(1, total);
  check(
    `${total} page(s): every number, no gaps`,
    window.length === total && window.every((page) => page !== null),
    show(window),
  );
}

console.log("\nEvery window is well formed");

let malformed = 0;
for (let total = 1; total <= 40; total++) {
  for (let current = 1; current <= total; current++) {
    const window = pageWindow(current, total);
    const numbers = window.filter((page): page is number => page !== null);

    const problems: string[] = [];
    if (!numbers.includes(current)) problems.push("current page missing");
    if (!numbers.includes(1)) problems.push("first page missing");
    if (!numbers.includes(total)) problems.push("last page missing");
    if (new Set(numbers).size !== numbers.length) problems.push("duplicate page");
    if (numbers.some((page) => page < 1 || page > total)) problems.push("out of range");
    // Sorted ascending, or the control reads as shuffled.
    if (numbers.some((page, i) => i > 0 && page <= numbers[i - 1])) {
      problems.push("not ascending");
    }
    // A gap must stand for something. Two adjacent numbers with an ellipsis
    // between them is punctuation for nothing.
    for (const [i, entry] of window.entries()) {
      if (entry !== null) continue;
      const before = window[i - 1];
      const after = window[i + 1];
      if (typeof before !== "number" || typeof after !== "number" || after - before <= 1) {
        problems.push("gap spans nothing");
      }
    }
    if (window[0] === null || window[window.length - 1] === null) {
      problems.push("gap at an edge");
    }

    if (problems.length > 0) {
      malformed++;
      if (malformed <= 3) {
        check(`total=${total} current=${current}`, false, `${problems.join(", ")} — ${show(window)}`);
      }
    }
  }
}
check("all 820 (total, current) combinations are well formed", malformed === 0, `${malformed} bad`);

console.log("\nThe control keeps its width");

// A row of numbers that resizes as it is used is how you click the wrong one.
const widths = new Set<number>();
for (let current = 1; current <= 20; current++) {
  widths.add(pageWindow(current, 20).length);
}
check(
  "width is constant across every page of a 20-page run",
  widths.size === 1,
  `widths seen: ${[...widths].join(", ")}`,
);

console.log("\nClamping a requested page");

/** The arithmetic both listings perform on `?page=`. */
function clamp(requested: unknown, totalPages: number): number {
  const parsed = Number(requested);
  const page = Math.max(Number.isFinite(parsed) ? Math.trunc(parsed) : 1, 1);
  return Math.min(page, totalPages);
}

check("page 1 of 5 stays", clamp("1", 5) === 1);
check("page 3 of 5 stays", clamp("3", 5) === 3);
check("page 0 becomes 1", clamp("0", 5) === 1);
check("a negative page becomes 1", clamp("-4", 5) === 1);
check("past the end lands on the last page", clamp("900", 5) === 5);
check("garbage becomes 1", clamp("banana", 5) === 1);
check("empty becomes 1", clamp("", 5) === 1);
check("missing becomes 1", clamp(undefined, 5) === 1);
check("a fraction truncates", clamp("2.9", 5) === 2);
check("an empty result set still has page 1", clamp("3", 1) === 1);

console.log("\nSlicing a page");

const slice = (page: number, size: number, total: number) => {
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = clamp(page, totalPages);
  return { from: (current - 1) * size, to: current * size, totalPages };
};

check("24 items over 24 per page is one page", slice(1, 24, 24).totalPages === 1);
check("25 items is two", slice(1, 24, 25).totalPages === 2);
check("0 items is still one page, not zero", slice(1, 24, 0).totalPages === 1);
check("page 2 starts where page 1 ended", slice(2, 24, 50).from === 24);
check(
  "the last page is short rather than padded",
  (() => {
    const { from, to } = slice(3, 24, 50);
    return from === 48 && Math.min(to, 50) - from === 2;
  })(),
);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
