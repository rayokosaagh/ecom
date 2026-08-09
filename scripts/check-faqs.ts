import {
  MAX_ANSWER_LENGTH,
  MAX_QUESTION_LENGTH,
  parseFaq,
} from "../src/lib/faqs/validation";

/**
 * Checks for FAQ validation.
 *
 * This is the contract `parseFaq` has to meet — the admin form places its error
 * messages by key, and the storefront renders whatever gets stored, so both
 * ends depend on this function agreeing with them.
 *
 *   npm run check:faqs
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
// entries and means for them to replace it. Appending instead leaves two values
// under the key, and `formData.get` reads the first — so every override was
// silently ignored and the length checks below tested the base question.
function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.set(key, value);
  return data;
}

/** A submission with everything filled in properly. */
const valid = (overrides: [string, string][] = []) =>
  form([
    ["question", "Do you ship internationally?"],
    ["answer", "We ship to most of Europe and North America."],
    ["published", "on"],
    ...overrides,
  ]);

console.log("\nA complete submission is accepted");

const ok = parseFaq(valid());
check("it parses", ok.ok);
check(
  "the question comes through",
  ok.ok && ok.data.question === "Do you ship internationally?",
);
check(
  "so does the answer",
  ok.ok && ok.data.answer === "We ship to most of Europe and North America.",
);

console.log("\nWhitespace is trimmed, not trusted");

const padded = parseFaq(
  form([
    ["question", "   Do you ship?   "],
    ["answer", "\n  Yes, worldwide.  \n"],
  ]),
);
check("the question is trimmed", padded.ok && padded.data.question === "Do you ship?");
check("the answer is trimmed", padded.ok && padded.data.answer === "Yes, worldwide.");

// The trap: a field of nothing but spaces looks filled to a length check but is
// empty to a reader.
check(
  "a question of only spaces counts as missing",
  !parseFaq(form([["question", "     "], ["answer", "Yes."]])).ok,
);
check(
  "an answer of only newlines counts as missing",
  !parseFaq(form([["question", "Do you ship?"], ["answer", "\n\n  \n"]])).ok,
);

console.log("\nBoth fields are required");

const noQuestion = parseFaq(form([["answer", "Yes."]]));
check("a missing question is refused", !noQuestion.ok);
check(
  "and the error is keyed `question`, which is what the form reads",
  !noQuestion.ok && Boolean(noQuestion.errors.question),
  !noQuestion.ok ? JSON.stringify(noQuestion.errors) : "",
);

const noAnswer = parseFaq(form([["question", "Do you ship?"]]));
check("a missing answer is refused", !noAnswer.ok);
check(
  "and the error is keyed `answer`",
  !noAnswer.ok && Boolean(noAnswer.errors.answer),
  !noAnswer.ok ? JSON.stringify(noAnswer.errors) : "",
);

// A form that reports one problem at a time makes an admin submit repeatedly
// to discover them all.
const neither = parseFaq(form([]));
check(
  "both problems are reported at once, not one at a time",
  !neither.ok && Boolean(neither.errors.question) && Boolean(neither.errors.answer),
  !neither.ok ? JSON.stringify(neither.errors) : "",
);

console.log("\nLengths are bounded");

check(
  `a question of exactly ${MAX_QUESTION_LENGTH} is fine`,
  parseFaq(valid([["question", "q".repeat(MAX_QUESTION_LENGTH)]])).ok,
);
check(
  "one character more is refused",
  !parseFaq(valid([["question", "q".repeat(MAX_QUESTION_LENGTH + 1)]])).ok,
);
check(
  `an answer of exactly ${MAX_ANSWER_LENGTH} is fine`,
  parseFaq(valid([["answer", "a".repeat(MAX_ANSWER_LENGTH)]])).ok,
);
check(
  "one character more is refused",
  !parseFaq(valid([["answer", "a".repeat(MAX_ANSWER_LENGTH + 1)]])).ok,
);

// Measured after trimming, or padding counts against a limit it should not.
check(
  "length is judged after trimming, not before",
  parseFaq(
    valid([["question", `   ${"q".repeat(MAX_QUESTION_LENGTH)}   `]]),
  ).ok,
);

console.log("\nThe published checkbox");

check(
  "a checked box is published",
  parseFaq(valid([["published", "on"]])).ok &&
    (parseFaq(valid([["published", "on"]])) as { data: { published: boolean } }).data
      .published,
);

// An unchecked checkbox submits nothing at all — its absence is the signal.
const unchecked = parseFaq(
  form([
    ["question", "Do you ship?"],
    ["answer", "Yes."],
  ]),
);
check("an absent box means not published", unchecked.ok && !unchecked.data.published);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
