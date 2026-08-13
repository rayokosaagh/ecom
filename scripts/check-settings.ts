import {
  MAX_NOTE_LENGTH,
  parseStoreSettings,
} from "../src/lib/settings/validation";
import { normalizeWhatsappNumber } from "../src/lib/whatsapp/link";

/**
 * Checks for the store settings form.
 *
 * The thing worth defending: the form and the link builder must agree on what
 * "a usable number" means. If the form accepts something `normalizeWhatsappNumber`
 * later rejects, the buttons silently vanish and the admin has no idea why —
 * the save said it worked.
 *
 *   npm run check:settings
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
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

console.log("\nA usable number is accepted, as typed");

const typed = parseStoreSettings(
  form([
    ["whatsappNumber", "+44 7911 123456"],
    ["whatsappEnabled", "on"],
  ]),
);
check("it parses", typed.ok);
check(
  "the number is stored exactly as the admin typed it, not stripped to digits",
  // Storing "447911123456" would make the field look like it mangled the
  // input. Normalizing is the link builder's job, at the point of use.
  typed.ok && typed.data.whatsappNumber === "+44 7911 123456",
  typed.ok ? String(typed.data.whatsappNumber) : "",
);

console.log("\nThe form and the link builder agree on what is usable");

// The failure this prevents: a number the form accepts but the link builder
// cannot use, which turns into buttons that quietly render nothing.
for (const candidate of [
  "+44 7911 123456",
  "447911123456",
  "00447911123456",
  "+1 (555) 123-4567",
  "123",
  "call us",
  "+",
  "1234567890123456",
]) {
  const parsed = parseStoreSettings(form([["whatsappNumber", candidate]]));
  const usable = normalizeWhatsappNumber(candidate) !== null;
  check(
    `"${candidate}" — form ${parsed.ok ? "accepts" : "rejects"}, link builder ${usable ? "can" : "cannot"} use it`,
    parsed.ok === usable,
  );
}

console.log("\nAn empty number is allowed — it is how the buttons are removed");

const cleared = parseStoreSettings(form([["whatsappNumber", "   "]]));
check("blank parses", cleared.ok);
check(
  "and is stored as null rather than an empty string",
  cleared.ok && cleared.data.whatsappNumber === null,
  cleared.ok ? JSON.stringify(cleared.data.whatsappNumber) : "",
);

console.log("\nThe availability note");

check(
  `exactly ${MAX_NOTE_LENGTH} characters is fine`,
  parseStoreSettings(form([["whatsappNote", "n".repeat(MAX_NOTE_LENGTH)]])).ok,
);
check(
  "one more is refused",
  !parseStoreSettings(form([["whatsappNote", "n".repeat(MAX_NOTE_LENGTH + 1)]])).ok,
);
const trimmedNote = parseStoreSettings(form([["whatsappNote", "  Replies in an hour  "]]));
check(
  "it is trimmed",
  trimmedNote.ok && trimmedNote.data.whatsappNote === "Replies in an hour",
);
const blankNote = parseStoreSettings(form([["whatsappNote", "   "]]));
check(
  "whitespace-only becomes null, not a blank line under the button",
  blankNote.ok && blankNote.data.whatsappNote === null,
);

console.log("\nThe enabled switch");

check(
  "a checked box is on",
  (() => {
    const r = parseStoreSettings(form([["whatsappEnabled", "on"]]));
    return r.ok && r.data.whatsappEnabled;
  })(),
);
// An unchecked checkbox submits nothing at all — its absence is the signal.
check(
  "an absent box is off",
  (() => {
    const r = parseStoreSettings(form([]));
    return r.ok && !r.data.whatsappEnabled;
  })(),
);
check(
  "the switch is independent of the number — off with a number set is valid",
  (() => {
    const r = parseStoreSettings(form([["whatsappNumber", "+44 7911 123456"]]));
    return r.ok && r.data.whatsappNumber === "+44 7911 123456" && !r.data.whatsappEnabled;
  })(),
);

console.log("\nThe home page arrangement");

/*
 * The failure this guards: `homeHeroCombined` is a checkbox whose *default* is
 * on, and an unchecked checkbox submits nothing. If the parser ever defaulted
 * an absent value to `true` to match the column default, the switch would
 * become impossible to turn off — saving the form would silently put the
 * combined hero back every time.
 */
check(
  "a checked box publishes the combined hero",
  (() => {
    const r = parseStoreSettings(form([["homeHeroCombined", "on"]]));
    return r.ok && r.data.homeHeroCombined;
  })(),
);
check(
  "an absent box publishes the stacked arrangement — the switch can be turned off",
  (() => {
    const r = parseStoreSettings(form([["whatsappNumber", "+44 7911 123456"]]));
    return r.ok && !r.data.homeHeroCombined;
  })(),
);

console.log("\nErrors are keyed to the fields the form renders");

const bad = parseStoreSettings(
  form([
    ["whatsappNumber", "nope"],
    ["whatsappNote", "n".repeat(MAX_NOTE_LENGTH + 1)],
  ]),
);
check(
  "both problems are reported at once",
  !bad.ok && Boolean(bad.errors.whatsappNumber) && Boolean(bad.errors.whatsappNote),
  !bad.ok ? JSON.stringify(bad.errors) : "",
);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
