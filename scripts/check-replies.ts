import {
  REPLY_MAX,
  REPLY_MIN,
  parseReply,
} from "../src/lib/reviews/validation";

/**
 * Checks for reply validation.
 *
 * A reply is public writing by a stranger under someone else's words, and the
 * only thing standing between the form and the database is this function — a
 * server action is a public POST endpoint, and the textarea's `maxlength` is a
 * courtesy to the person typing, not a rule.
 *
 *   npm run check:replies
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

function form(body?: string): FormData {
  const data = new FormData();
  if (body !== undefined) data.set("body", body);
  return data;
}

console.log("\nA reply has to say something");

const empty = parseReply(form());
check("a missing body is refused", !empty.ok);
check(
  "and the error is keyed `body`, which is what the composer reads",
  !empty.ok && Boolean(empty.errors.body),
  !empty.ok ? JSON.stringify(empty.errors) : "",
);
check("an empty string is refused", !parseReply(form("")).ok);
check(
  "whitespace alone counts as missing, not as content",
  !parseReply(form("   \n  ")).ok,
);

console.log("\nIt is judged on the trimmed text");

const padded = parseReply(form("   Yes, it fits.   "));
check("it parses", padded.ok);
check("and the body is trimmed", padded.ok && padded.data.body === "Yes, it fits.");

// The trap: padding a one-character reply up past the floor.
check(
  "a single character padded with spaces is still too short",
  !parseReply(form(`   ${"y"} `)).ok,
);

console.log("\nLength is bounded at both ends");

check(
  `exactly ${REPLY_MIN} characters is fine`,
  parseReply(form("y".repeat(REPLY_MIN))).ok,
);
check(
  "one character fewer is refused",
  !parseReply(form("y".repeat(REPLY_MIN - 1))).ok,
);
check(
  `exactly ${REPLY_MAX} characters is fine`,
  parseReply(form("y".repeat(REPLY_MAX))).ok,
);
check(
  "one character more is refused",
  !parseReply(form("y".repeat(REPLY_MAX + 1))).ok,
);
check(
  "length is measured after trimming, not before",
  parseReply(form(`   ${"y".repeat(REPLY_MAX)}   `)).ok,
);

console.log("\nA reply is looser than a review");

// Deliberate: a review moves the average so it has a floor to keep "good" out
// of the arithmetic. A reply moves nothing, and "Yes" answers a real question.
check(
  "a two-word answer is accepted, which `parseReview` would refuse",
  parseReply(form("It does.")).ok,
);
check(
  "newlines survive into the stored body",
  (() => {
    const r = parseReply(form("Line one.\nLine two."));
    return r.ok && r.data.body === "Line one.\nLine two.";
  })(),
);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
