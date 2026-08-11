import {
  MAX_MESSAGE_LENGTH,
  isSafeHref,
  parseAnnouncement,
} from "../src/lib/announcements/validation";
import { ANNOUNCEMENT_LEVELS, highestLevel } from "../src/lib/announcements/levels";
import {
  estimateItemWidth,
  railDurationSeconds,
  railRepeats,
} from "../src/lib/announcements/rail";
import { AnnouncementLevel } from "../src/generated/prisma/enums";

/**
 * Checks for announcement validation, link safety and level ranking.
 *
 * The `href` rules are the reason this file exists. That string is written into
 * an anchor on a strip that renders inside the navigation bar — which is to say
 * on every page of the shop — so a scheme that slips through here is script
 * execution everywhere, authored from the admin form. Each case below is a real
 * bypass for a naive check, not a hypothetical.
 *
 *   npm run check:announcements
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

const valid = (overrides: [string, string][] = []) =>
  form([
    ["message", "Free delivery all week"],
    ["level", AnnouncementLevel.INFO],
    ["published", "on"],
    ...overrides,
  ]);

console.log("\nRequired fields");

check("a complete submission is accepted", parseAnnouncement(valid()).ok);

const blank = parseAnnouncement(valid([["message", "   "]]));
check(
  "a blank message is rejected under the message key",
  !blank.ok && Boolean(blank.errors.message),
);

check(
  `a message of exactly ${MAX_MESSAGE_LENGTH} characters is accepted`,
  parseAnnouncement(valid([["message", "m".repeat(MAX_MESSAGE_LENGTH)]])).ok,
);

check(
  "one character over the limit is rejected",
  !parseAnnouncement(valid([["message", "m".repeat(MAX_MESSAGE_LENGTH + 1)]])).ok,
);

console.log("\nLevel");

for (const level of Object.keys(ANNOUNCEMENT_LEVELS) as AnnouncementLevel[]) {
  check(`${level} is accepted`, parseAnnouncement(valid([["level", level]])).ok);
}

const bogus = parseAnnouncement(valid([["level", "URGENT"]]));
check(
  "a level the enum does not have is rejected, not cast",
  !bogus.ok && Boolean(bogus.errors.level),
);

check(
  "a missing level is rejected",
  !parseAnnouncement(form([["message", "Hi"]])).ok,
);

console.log("\nLink safety — these are the ones that matter");

check("a same-site path is allowed", isSafeHref("/sale"));
check("a path with a query is allowed", isSafeHref("/products?category=audio"));
check("an https URL is allowed", isSafeHref("https://example.com/news"));
check("an http URL is allowed", isSafeHref("http://example.com"));

check("javascript: is refused", !isSafeHref("javascript:alert(1)"));
check("uppercase JavaScript: is refused", !isSafeHref("JavaScript:alert(1)"));
check("data: is refused", !isSafeHref("data:text/html,<script>alert(1)</script>"));
check("vbscript: is refused", !isSafeHref("vbscript:msgbox(1)"));
check("file: is refused", !isSafeHref("file:///etc/passwd"));

// The URL parser strips tabs and newlines *before* reading the scheme, so a
// check that only looked at the parsed result would see "javascript:" here
// only after it was too late — and one that compared the raw string against
// "javascript:" would not see it at all.
check(
  "javascript: split by a tab is refused",
  !isSafeHref("java\tscript:alert(1)"),
);
check(
  "javascript: split by a newline is refused",
  !isSafeHref("java\nscript:alert(1)"),
);
check(
  "a leading NUL is refused",
  !isSafeHref("\u0000javascript:alert(1)"),
);

// Not a path. An absolute URL borrowing the current scheme, which passes any
// test that only asks whether the string starts with a slash.
check("a protocol-relative URL is refused", !isSafeHref("//evil.example"));
check("a backslash authority is refused", !isSafeHref("/\\evil.example"));
check("a bare backslash is refused", !isSafeHref("\\\\evil.example"));

check("a bare word is refused", !isSafeHref("sale"));
check("a relative path is refused", !isSafeHref("../admin"));

const hostile = parseAnnouncement(valid([["href", "javascript:alert(1)"]]));
check(
  "the parser reports a bad link under the href key",
  !hostile.ok && Boolean(hostile.errors.href),
);

const noLink = parseAnnouncement(valid());
check("an omitted link is null, not an empty string", noLink.ok && noLink.data.href === null);

const spaces = parseAnnouncement(valid([["href", "   "]]));
check(
  "a whitespace-only link is null rather than rejected",
  spaces.ok && spaces.data.href === null,
);

console.log("\nWhich level the strip wears");

check(
  "the loudest level wins",
  highestLevel([
    AnnouncementLevel.INFO,
    AnnouncementLevel.CRITICAL,
    AnnouncementLevel.SUCCESS,
  ]) === AnnouncementLevel.CRITICAL,
);

check(
  "order of arrival does not matter",
  highestLevel([AnnouncementLevel.CRITICAL, AnnouncementLevel.INFO]) ===
    highestLevel([AnnouncementLevel.INFO, AnnouncementLevel.CRITICAL]),
);

check(
  "warning out-ranks good news",
  highestLevel([AnnouncementLevel.SUCCESS, AnnouncementLevel.WARNING]) ===
    AnnouncementLevel.WARNING,
);

check(
  "an empty list falls back to INFO",
  highestLevel([]) === AnnouncementLevel.INFO,
);

console.log("\nThe rail — this is what stopped a quarter of the way across");

// The bug: one short notice made a track narrower than the screen, so
// translating it by half its own width slid it in a little way and parked it.
// The sequence has to repeat until one copy clears the viewport.
const oneShort = [{ message: "Free delivery" }];
const shortRepeats = railRepeats(oneShort);
check(
  "a single short notice repeats many times",
  shortRepeats > 8,
  `got ${shortRepeats}`,
);
check(
  "one copy of it clears a wide screen",
  estimateItemWidth(oneShort[0]) * shortRepeats >= 2560,
  `got ${Math.round(estimateItemWidth(oneShort[0]) * shortRepeats)}px`,
);

// A long enough sequence already covers the screen and must not be padded out
// with copies nobody asked for.
const many = Array.from({ length: 8 }, (_, i) => ({
  message: `A reasonably wordy announcement number ${i}`,
}));
check("a long sequence is not repeated", railRepeats(many) === 1);

check("an empty list does not divide by zero", railRepeats([]) === 1);

// The point of computing a duration from the width: the strip reads at one
// speed whatever it is carrying. A short notice repeated twenty times has a
// long track, and a fixed duration would have made it sprint.
const shortDuration = railDurationSeconds(oneShort, shortRepeats);
const manyDuration = railDurationSeconds(many, railRepeats(many));
const speedOf = (items: { message: string }[], repeats: number, seconds: number) =>
  (items.reduce((total, item) => total + estimateItemWidth(item), 0) * repeats) / seconds;

check(
  "both strips travel at about the same speed",
  Math.abs(speedOf(oneShort, shortRepeats, shortDuration) -
    speedOf(many, railRepeats(many), manyDuration)) < 12,
  `${speedOf(oneShort, shortRepeats, shortDuration).toFixed(1)} vs ${speedOf(many, railRepeats(many), manyDuration).toFixed(1)} px/s`,
);

check(
  "no strip is given a duration short enough to flicker",
  railDurationSeconds([{ message: "Hi" }], 1) >= 8,
);

check(
  "a linked notice is estimated wider than the same text unlinked",
  estimateItemWidth({ message: "Sale", href: "/sale" }) >
    estimateItemWidth({ message: "Sale" }),
);

console.log("\nThe published checkbox");

check("a checked box is published", noLink.ok && noLink.data.published);

// An unchecked checkbox submits nothing at all — its absence is the signal.
const unchecked = parseAnnouncement(
  form([
    ["message", "Draft notice"],
    ["level", AnnouncementLevel.INFO],
  ]),
);
check("an absent box means not published", unchecked.ok && !unchecked.data.published);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
