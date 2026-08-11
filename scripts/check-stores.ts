import { parseHours } from "../src/lib/stores/hours";
import {
  MAX_HOURS_LINES,
  MAX_NAME_LENGTH,
  parseStoreLocation,
  telHref,
} from "../src/lib/stores/validation";

/**
 * Checks for store-location validation and the opening-hours renderer.
 *
 * This is the contract both ends depend on: the admin form places its error
 * messages by key, the Stores page draws whatever `parseHours` returns, and the
 * map falls back to the address whenever the coordinates come back null — so a
 * half-saved pin here is a pin in the wrong ocean there.
 *
 *   npm run check:stores
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

// `set`, not `append`: `valid(overrides)` spreads its overrides after the base
// entries and means for them to replace it.
function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.set(key, value);
  return data;
}

/** A submission with everything filled in properly. */
const valid = (overrides: [string, string][] = []) =>
  form([
    ["name", "Kathmandu · New Road"],
    ["address", "12 New Road\nKathmandu 44600"],
    ["published", "on"],
    ...overrides,
  ]);

console.log("\nRequired fields");

check("a complete submission is accepted", parseStoreLocation(valid()).ok);

const noName = parseStoreLocation(valid([["name", "   "]]));
check(
  "a blank name is rejected under the name key",
  !noName.ok && Boolean(noName.errors.name),
);

const noAddress = parseStoreLocation(valid([["address", "\n  \n"]]));
check(
  "a blank address is rejected under the address key",
  !noAddress.ok && Boolean(noAddress.errors.address),
);

check(
  `a name of exactly ${MAX_NAME_LENGTH} characters is accepted`,
  parseStoreLocation(valid([["name", "n".repeat(MAX_NAME_LENGTH)]])).ok,
);

check(
  "a name one over the limit is rejected",
  !parseStoreLocation(valid([["name", "n".repeat(MAX_NAME_LENGTH + 1)]])).ok,
);

console.log("\nOptional fields become null, never empty strings");

const bare = parseStoreLocation(valid());
check(
  "an omitted description, phone and hours are all null",
  bare.ok &&
    bare.data.description === null &&
    bare.data.phone === null &&
    bare.data.hours === null,
);

const whitespaceOnly = parseStoreLocation(
  valid([
    ["description", "   "],
    ["phone", "  "],
    ["hours", "\n \n"],
  ]),
);
check(
  "whitespace-only optional fields are null too",
  whitespaceOnly.ok &&
    whitespaceOnly.data.description === null &&
    whitespaceOnly.data.phone === null &&
    whitespaceOnly.data.hours === null,
);

console.log("\nPhone numbers");

check(
  "an international number with punctuation is accepted",
  parseStoreLocation(valid([["phone", "+977 (1) 234-5678"]])).ok,
);

check(
  "a name typed into the phone field is rejected",
  !parseStoreLocation(valid([["phone", "call the shop"]])).ok,
);

check(
  "too few digits is rejected",
  !parseStoreLocation(valid([["phone", "12345"]])).ok,
);

check(
  "the tel: href keeps a leading + and drops everything else",
  telHref("+977 (1) 234-5678") === "tel:+97712345678",
);

check(
  "a local number gets no + it never had",
  telHref("01-234 5678") === "tel:012345678",
);

console.log("\nCoordinates are a pair or nothing");

const pinned = parseStoreLocation(
  valid([
    ["latitude", "27.7172"],
    ["longitude", "85.324"],
  ]),
);
check(
  "a complete pair is stored as numbers",
  pinned.ok && pinned.data.latitude === 27.7172 && pinned.data.longitude === 85.324,
);

const halfPin = parseStoreLocation(valid([["latitude", "27.7172"]]));
check(
  "a latitude with no longitude is rejected, not defaulted",
  !halfPin.ok && Boolean(halfPin.errors.longitude),
);

const outOfRange = parseStoreLocation(
  valid([
    ["latitude", "95"],
    ["longitude", "85.324"],
  ]),
);
check(
  "a latitude past the pole is rejected",
  !outOfRange.ok && Boolean(outOfRange.errors.latitude),
);

const notANumber = parseStoreLocation(
  valid([
    ["latitude", "27.7172N"],
    ["longitude", "85.324E"],
  ]),
);
check(
  "coordinates pasted with hemisphere letters are rejected",
  !notANumber.ok && Boolean(notANumber.errors.latitude),
);

// Null Island is a real coordinate and 0 is falsy — the parser must not treat
// it as "not given" and quietly drop half the pair.
const equator = parseStoreLocation(
  valid([
    ["latitude", "0"],
    ["longitude", "0"],
  ]),
);
check(
  "zero is a coordinate, not a missing value",
  equator.ok && equator.data.latitude === 0 && equator.data.longitude === 0,
);

const noPin = parseStoreLocation(valid());
check(
  "no coordinates at all is fine — the map searches the address",
  noPin.ok && noPin.data.latitude === null && noPin.data.longitude === null,
);

console.log("\nOpening hours");

check(
  `${MAX_HOURS_LINES} lines is accepted`,
  parseStoreLocation(
    valid([["hours", Array.from({ length: MAX_HOURS_LINES }, (_, i) => `D${i}: 9-5`).join("\n")]]),
  ).ok,
);

check(
  "one line too many is rejected",
  !parseStoreLocation(
    valid([
      ["hours", Array.from({ length: MAX_HOURS_LINES + 1 }, (_, i) => `D${i}: 9-5`).join("\n")],
    ]),
  ).ok,
);

// The whole reason the split is on the *first* colon: a time contains one too.
const split = parseHours("Sun–Fri: 10:00 – 19:00");
check(
  "a line splits at the first colon only, so the time survives",
  split.length === 1 && split[0].days === "Sun–Fri" && split[0].time === "10:00 – 19:00",
);

const closed = parseHours("Sat: Closed");
check("a closed day is flagged", closed.length === 1 && closed[0].closed);

const note = parseHours("Public holidays vary");
check(
  "a line with no colon keeps its whole text and has no time",
  note.length === 1 && note[0].days === "Public holidays vary" && note[0].time === null,
);

const unfinished = parseHours("Sat:");
check(
  "a day with nothing after the colon reads as no time, not an empty one",
  unfinished.length === 1 && unfinished[0].days === "Sat" && unfinished[0].time === null,
);

const blanks = parseHours("Mon: 9-5\n\n   \nTue: 9-5");
check("blank lines are dropped", blanks.length === 2);

check("no hours at all is an empty table, not a crash", parseHours(null).length === 0);

console.log("\nThe published checkbox");

check(
  "a checked box is published",
  bare.ok && bare.data.published,
);

// An unchecked checkbox submits nothing at all — its absence is the signal.
const unchecked = parseStoreLocation(
  form([
    ["name", "Pop-up"],
    ["address", "Somewhere"],
  ]),
);
check("an absent box means not published", unchecked.ok && !unchecked.data.published);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
