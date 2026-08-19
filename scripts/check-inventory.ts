import { StockChangeReason } from "../src/generated/prisma/enums";
import {
  LOW_STOCK_THRESHOLD,
  MAX_STOCK,
  REASONS_FOR_ADDING,
  REASONS_FOR_REMOVING,
  REASON_LABELS,
  formatDelta,
  isAdjustMode,
  planAdjustment,
  stockAlertFor,
  stockState,
} from "../src/lib/inventory/stock";

/**
 * Checks for inventory adjustments.
 *
 * Same reasoning as the other suites: this decides how many of something the
 * shop believes it has, and that number is what stops it selling what it cannot
 * ship. Three things are being defended.
 *
 * An adjustment must never invent or destroy units silently — removing more
 * than exists is refused rather than clamped, because a clamp records a change
 * that did not happen and agrees with a count already shown to be wrong. The
 * ledger must never hold a row for a change of nothing. And the form and the
 * server action must judge an adjustment identically, which they do by both
 * calling `planAdjustment` — asserted here rather than assumed.
 *
 *   npm run check:inventory
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

console.log("\nWhat counts as out, low and stocked");

check("zero is out, not low", stockState(0) === "OUT");
check("one is low, not out", stockState(1) === "LOW");
check("the threshold itself is low", stockState(LOW_STOCK_THRESHOLD) === "LOW");
check("one above the threshold is stocked", stockState(LOW_STOCK_THRESHOLD + 1) === "IN");
// Nothing should ever store a negative level, but a page that rendered one as
// "in stock" would be the worst possible reading of it.
check("a negative level reads as out", stockState(-3) === "OUT");
check("the threshold is a parameter, not a constant", stockState(9, 10) === "LOW");

console.log("\nAdding, removing and setting");

const added = planAdjustment(12, "add", 40);
check("adding lands on the sum", added.ok && added.data.stock === 52);
check("and the delta is positive", added.ok && added.data.delta === 40);

const removed = planAdjustment(12, "remove", 5);
check("removing lands on the difference", removed.ok && removed.data.stock === 7);
check("and the delta is negative", removed.ok && removed.data.delta === -5);

const setDown = planAdjustment(12, "set", 3);
check("setting lands on the figure typed", setDown.ok && setDown.data.stock === 3);
check(
  "and its delta is derived, not typed",
  setDown.ok && setDown.data.delta === -9,
  String(setDown.ok && setDown.data.delta),
);

const setUp = planAdjustment(3, "set", 12);
check("setting upwards gives a positive delta", setUp.ok && setUp.data.delta === 9);

check("removing everything is allowed", planAdjustment(4, "remove", 4).ok);
check("setting to zero is allowed", planAdjustment(4, "set", 0).ok);

console.log("\nWhat is refused, and why it is refused rather than clamped");

// The case this whole function exists for. Clamping to zero would write a
// delta of −12 for a removal of 40 and leave a ledger row that is simply false.
const overdrawn = planAdjustment(12, "remove", 40);
check("removing more than there is fails", !overdrawn.ok);
check(
  "and the message says what to do instead",
  !overdrawn.ok && overdrawn.error.includes("set"),
  !overdrawn.ok ? overdrawn.error : "",
);

check("a fractional amount is refused", !planAdjustment(12, "add", 1.5).ok);
check("a negative amount is refused", !planAdjustment(12, "add", -5).ok);
check(
  "negatives are refused for their direction, not their arithmetic",
  // "add −5" would otherwise quietly mean "remove 5" — a form where the sign
  // and the button disagree is one that removes stock from an Add press.
  !planAdjustment(12, "remove", -5).ok,
);

check("going above the ceiling is refused", !planAdjustment(0, "set", MAX_STOCK + 1).ok);
check("the ceiling itself is allowed", planAdjustment(0, "set", MAX_STOCK).ok);

check("adding nothing is refused", !planAdjustment(12, "add", 0).ok);
check("removing nothing is refused", !planAdjustment(12, "remove", 0).ok);
check("setting the figure it already is, is refused", !planAdjustment(12, "set", 12).ok);

console.log("\nAnything accepted is safe to write");

for (const current of [0, 1, 5, 12, 999]) {
  for (const mode of ["add", "remove", "set"] as const) {
    for (const amount of [0, 1, 3, 12, 1000, MAX_STOCK, MAX_STOCK + 1, -1, 2.5]) {
      const plan = planAdjustment(current, mode, amount);
      if (!plan.ok) continue;

      if (plan.data.stock < 0 || plan.data.stock > MAX_STOCK) {
        check(`${mode} ${amount} of ${current} stays in range`, false, `${plan.data.stock}`);
      }
      if (plan.data.delta === 0) {
        check(`${mode} ${amount} of ${current} actually changes something`, false);
      }
      if (plan.data.stock !== current + plan.data.delta) {
        check(`${mode} ${amount} of ${current} has a delta that adds up`, false);
      }
    }
  }
}
check("every accepted plan is in range, non-empty and self-consistent", true);

console.log("\nModes");

check("the three modes are recognised", ["add", "remove", "set"].every(isAdjustMode));
// The mode arrives as a string on a POST body, so anything at all can be sent.
check("anything else is not", !isAdjustMode("increment") && !isAdjustMode(""));

console.log("\nReasons");

const everyReason = Object.values(StockChangeReason);

check(
  "every reason in the schema can be chosen somewhere",
  everyReason.every(
    (reason) => REASONS_FOR_ADDING.includes(reason) || REASONS_FOR_REMOVING.includes(reason),
  ),
  everyReason
    .filter(
      (reason) =>
        !REASONS_FOR_ADDING.includes(reason) && !REASONS_FOR_REMOVING.includes(reason),
    )
    .join(", "),
);

check(
  "every reason has a label to show",
  everyReason.every((reason) => Boolean(REASON_LABELS[reason])),
);

// A delivery cannot reduce stock and damage cannot increase it. The lists being
// direction-specific is what keeps "removed 5 — delivery received" out of the
// history.
check(
  "a delivery is not offered as a way to remove stock",
  !REASONS_FOR_REMOVING.includes(StockChangeReason.RECEIVED),
);
check(
  "damage is not offered as a way to add stock",
  !REASONS_FOR_ADDING.includes(StockChangeReason.DAMAGED),
);
check(
  "a recount can go either way",
  REASONS_FOR_ADDING.includes(StockChangeReason.RECOUNT) &&
    REASONS_FOR_REMOVING.includes(StockChangeReason.RECOUNT),
);
check(
  "and so can “other”",
  REASONS_FOR_ADDING.includes(StockChangeReason.OTHER) &&
    REASONS_FOR_REMOVING.includes(StockChangeReason.OTHER),
);

console.log("\nWhen a fall is worth telling someone about");

check("falling into Low is news", stockAlertFor(7, 2) === "LOW");
check("falling straight to Out is news, and says Out", stockAlertFor(7, 0) === "OUT");
check("falling from Low to Out is news", stockAlertFor(2, 0) === "OUT");
check("falling within Low is not", stockAlertFor(3, 1) === null);
check("falling within In is not", stockAlertFor(40, 20) === null);
check("landing exactly on the mark is Low", stockAlertFor(9, LOW_STOCK_THRESHOLD) === "LOW");
check("a rise is never news", stockAlertFor(0, 3) === null);
check("no change is never news", stockAlertFor(2, 2) === null);
check("a restock back above the mark is not news", stockAlertFor(2, 40) === null);
check("a line's own mark is honoured", stockAlertFor(20, 10, 12) === "LOW");
check("and a tighter mark stays quiet", stockAlertFor(20, 10, 5) === null);

console.log("\nHow a change reads");

check("an increase carries its sign", formatDelta(40) === "+40");
check("a decrease carries a real minus sign", formatDelta(-3) === "−3");
check("zero is shown as an increase of none, not a bare 0", formatDelta(0) === "+0");

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
