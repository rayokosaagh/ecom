import {
  CANCEL_REASON_LABEL,
  MAX_CANCEL_NOTE_LENGTH,
  cancellationReasons,
  describeCancellation,
  parseCancellation,
} from "../src/lib/orders/cancellation";
import { OrderCancelReason } from "../src/generated/prisma/enums";

/**
 * Checks for cancellation reasons.
 *
 * The feature is "a cancelled order always says why", and the only thing that
 * actually enforces it is `parseCancellation` — the radio group is a
 * convenience, and a server action is a public POST endpoint. So what is
 * defended here is that nothing gets through without a reason, that neither
 * side can choose a reason belonging to the other, and that `OTHER` cannot be
 * used as a way back to the blank this feature exists to remove.
 *
 *   npm run check:cancellation
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

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.set(key, value);
  return data;
}

console.log("\nA reason is mandatory");

const empty = parseCancellation(form([]), "customer");
check("an empty submission is refused", !empty.ok);
check(
  "and the error is keyed `reason`, which is what the fieldset reads",
  !empty.ok && Boolean(empty.errors.reason),
  !empty.ok ? JSON.stringify(empty.errors) : "",
);
check(
  "a blank reason is refused",
  !parseCancellation(form([["reason", ""]]), "customer").ok,
);
check(
  "so is whitespace dressed up as one",
  !parseCancellation(form([["reason", "   "]]), "customer").ok,
);
check(
  "so is a value that is not a reason at all",
  !parseCancellation(form([["reason", "BECAUSE"]]), "customer").ok,
);

console.log("\nA valid choice comes through");

const mistake = parseCancellation(
  form([["reason", OrderCancelReason.ORDERED_BY_MISTAKE]]),
  "customer",
);
check("it parses", mistake.ok);
check(
  "the reason is the one chosen",
  mistake.ok && mistake.data.reason === OrderCancelReason.ORDERED_BY_MISTAKE,
);
check("and carries no note", mistake.ok && mistake.data.note === null);

console.log("\nThe two sides cannot borrow each other's reasons");

// The point of separate lists. A customer posting `SUSPECTED_FRAUD` at their
// own order would otherwise put a word in the shop's records that the shop
// never said.
check(
  "a customer cannot claim the shop suspected fraud",
  !parseCancellation(form([["reason", OrderCancelReason.SUSPECTED_FRAUD]]), "customer")
    .ok,
);
check(
  "a customer cannot report the shop out of stock",
  !parseCancellation(form([["reason", OrderCancelReason.OUT_OF_STOCK]]), "customer").ok,
);
check(
  "an admin does not record a decision as the customer changing their mind",
  !parseCancellation(form([["reason", OrderCancelReason.CHANGED_MIND]]), "admin").ok,
);
check(
  "an admin says `customer requested` instead, and that is accepted",
  parseCancellation(form([["reason", OrderCancelReason.CUSTOMER_REQUESTED]]), "admin").ok,
);

// Every reason on offer has to be one the parser will take back, or the form
// shows an option that cannot be submitted.
for (const audience of ["customer", "admin"] as const) {
  const offered = cancellationReasons(audience);
  const allAccepted = offered.every((reason) =>
    parseCancellation(
      form([
        ["reason", reason],
        // `OTHER` needs its note; supplying one for all of them keeps this
        // about membership rather than about the note rule below.
        ["note", "Because."],
      ]),
      audience,
    ).ok,
  );
  check(`every reason offered to the ${audience} is accepted from them`, allAccepted);
}

check(
  "the two lists overlap only at `OTHER`",
  cancellationReasons("customer").filter((r) => cancellationReasons("admin").includes(r))
    .join() === OrderCancelReason.OTHER,
);

console.log("\n`OTHER` has to be written out");

const otherBlank = parseCancellation(
  form([["reason", OrderCancelReason.OTHER]]),
  "customer",
);
check("`OTHER` with no note is refused", !otherBlank.ok);
check(
  "and the error is keyed `note`",
  !otherBlank.ok && Boolean(otherBlank.errors.note),
  !otherBlank.ok ? JSON.stringify(otherBlank.errors) : "",
);
check(
  "a note of only spaces counts as missing",
  !parseCancellation(
    form([
      ["reason", OrderCancelReason.OTHER],
      ["note", "    "],
    ]),
    "customer",
  ).ok,
);

const otherWritten = parseCancellation(
  form([
    ["reason", OrderCancelReason.OTHER],
    ["note", "  Duplicate of my other order.  "],
  ]),
  "customer",
);
check("`OTHER` with a note is accepted", otherWritten.ok);
check(
  "and the note is trimmed",
  otherWritten.ok && otherWritten.data.note === "Duplicate of my other order.",
);

check(
  `a note of exactly ${MAX_CANCEL_NOTE_LENGTH} is fine`,
  parseCancellation(
    form([
      ["reason", OrderCancelReason.OTHER],
      ["note", "n".repeat(MAX_CANCEL_NOTE_LENGTH)],
    ]),
    "customer",
  ).ok,
);
check(
  "one character more is refused",
  !parseCancellation(
    form([
      ["reason", OrderCancelReason.OTHER],
      ["note", "n".repeat(MAX_CANCEL_NOTE_LENGTH + 1)],
    ]),
    "customer",
  ).ok,
);

// The textarea stays mounted while someone changes their mind about the radio.
// Text typed against an abandoned "Something else" must not be filed under the
// reason they actually went with.
const strayNote = parseCancellation(
  form([
    ["reason", OrderCancelReason.CHANGED_MIND],
    ["note", "I was going to say something else"],
  ]),
  "customer",
);
check("a note left over from `OTHER` is dropped", strayNote.ok && strayNote.data.note === null);

console.log("\nEvery reason can be shown");

check(
  "each one has a label",
  [...cancellationReasons("customer"), ...cancellationReasons("admin")].every(
    (reason) => Boolean(CANCEL_REASON_LABEL[reason]?.trim()),
  ),
);
check(
  "an uncancelled order describes as nothing",
  describeCancellation(null, null) === null,
);
check(
  "a plain reason describes as its label",
  describeCancellation(OrderCancelReason.OUT_OF_STOCK, null) ===
    CANCEL_REASON_LABEL[OrderCancelReason.OUT_OF_STOCK],
);
check(
  "`OTHER` describes as its note as well",
  describeCancellation(OrderCancelReason.OTHER, "Warehouse flooded") ===
    `${CANCEL_REASON_LABEL[OrderCancelReason.OTHER]} — Warehouse flooded`,
);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
