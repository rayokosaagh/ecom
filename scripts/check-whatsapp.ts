import {
  MAX_NUMBER_DIGITS,
  MIN_NUMBER_DIGITS,
  inquiryMessage,
  normalizeWhatsappNumber,
  whatsappHref,
} from "../src/lib/whatsapp/link";

/**
 * Checks for the WhatsApp click-to-chat link.
 *
 * This is the contract, not a transcript of one implementation — it asserts
 * what the output has to be true of, and stays out of how you get there. Where
 * a decision is genuinely yours (the wording of the message, what to do with a
 * single leading zero) there is deliberately no assertion, and a comment
 * saying so.
 *
 * Three things are being defended. A number that reaches `wa.me` in the wrong
 * shape fails silently in front of a customer. A message that is encoded twice
 * arrives full of `%2520`. And a message that is not encoded at all is
 * truncated at the first `&`.
 *
 *   npm run check:whatsapp
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

/**
 * Run something that is not written yet without killing the whole run.
 *
 * The stubs throw on purpose, so without this the first unimplemented function
 * would hide every check after it — and the point of a spec is to be able to
 * work down it one at a time.
 */
const NOT_IMPLEMENTED = Symbol("not implemented");
function attempt<T>(run: () => T): T | typeof NOT_IMPLEMENTED {
  try {
    return run();
  } catch {
    return NOT_IMPLEMENTED;
  }
}

function checkValue<T>(
  label: string,
  produce: () => T,
  predicate: (value: T) => boolean,
  describe: (value: T) => string = (value) => JSON.stringify(value),
) {
  const value = attempt(produce);
  if (value === NOT_IMPLEMENTED) {
    failures++;
    console.log(`  FAIL  ${label}\n        not implemented yet`);
    return;
  }
  check(label, predicate(value), describe(value));
}

const digits = (count: number) => "5".repeat(count);

console.log("\nnormalizeWhatsappNumber — digits only, or nothing");

checkValue(
  "plain digits pass through",
  () => normalizeWhatsappNumber("15551234567"),
  (v) => v === "15551234567",
);
checkValue(
  "a leading + comes off",
  () => normalizeWhatsappNumber("+15551234567"),
  (v) => v === "15551234567",
);
checkValue(
  "spaces, brackets and dashes come off",
  () => normalizeWhatsappNumber("+1 (555) 123-4567"),
  (v) => v === "15551234567",
);
checkValue(
  "a leading 00 international prefix comes off too",
  // 0044… and +44… are the same number; only one of them works at wa.me.
  () => normalizeWhatsappNumber("00447911123456"),
  (v) => v === "447911123456",
);
checkValue(
  "a non-breaking space does not survive",
  () => normalizeWhatsappNumber("+44 791 112 3456"),
  (v) => v === "447911123456",
);

// Deliberately untested: a *single* leading zero, as in "+44 07911 123456".
// That is a national trunk prefix in some countries and a real digit in
// others, and this function cannot tell which. Whatever you decide, say so in
// a comment rather than leaving the next reader to infer it.

console.log("\nnormalizeWhatsappNumber — bounds");

checkValue(
  `exactly ${MIN_NUMBER_DIGITS} digits is accepted`,
  () => normalizeWhatsappNumber(digits(MIN_NUMBER_DIGITS)),
  (v) => v === digits(MIN_NUMBER_DIGITS),
);
checkValue(
  "one digit fewer is refused",
  () => normalizeWhatsappNumber(digits(MIN_NUMBER_DIGITS - 1)),
  (v) => v === null,
);
checkValue(
  `exactly ${MAX_NUMBER_DIGITS} digits is accepted`,
  () => normalizeWhatsappNumber(digits(MAX_NUMBER_DIGITS)),
  (v) => v === digits(MAX_NUMBER_DIGITS),
);
checkValue(
  "one digit more is refused",
  () => normalizeWhatsappNumber(digits(MAX_NUMBER_DIGITS + 1)),
  (v) => v === null,
);
checkValue(
  "the length is judged after stripping, not before",
  // 15 digits wrapped in punctuation is still 15 digits.
  () => normalizeWhatsappNumber(`+${digits(3)} (${digits(6)}) ${digits(6)}`),
  (v) => v === digits(MAX_NUMBER_DIGITS),
);
checkValue("empty is refused", () => normalizeWhatsappNumber(""), (v) => v === null);
checkValue(
  "punctuation with no digits is refused",
  () => normalizeWhatsappNumber("+ () -"),
  (v) => v === null,
);
checkValue(
  "letters are refused rather than silently dropped into a short number",
  () => normalizeWhatsappNumber("call-me"),
  (v) => v === null,
);

console.log("\ninquiryMessage — says what it should, and nothing else");

const FULL = {
  productName: "ASUS ProArt Studiobook 16",
  url: "https://shop.example.com/products/asus-proart-studiobook-16",
  orderReference: "91K90LXZ",
};

checkValue(
  "the product name is in there",
  () => inquiryMessage({ productName: FULL.productName }),
  (v) => v.includes(FULL.productName),
);
checkValue(
  "the url is in there",
  () => inquiryMessage({ url: FULL.url }),
  (v) => v.includes(FULL.url),
);
checkValue(
  "the order reference is in there",
  () => inquiryMessage({ orderReference: FULL.orderReference }),
  (v) => v.includes(FULL.orderReference),
);
checkValue(
  "all three together, none dropped",
  () => inquiryMessage(FULL),
  (v) =>
    v.includes(FULL.productName) &&
    v.includes(FULL.url) &&
    v.includes(FULL.orderReference),
);

// The wording is yours — only that it says *something* is asserted. A button on
// a general page still has to send an opening line.
checkValue(
  "empty context still produces a greeting",
  () => inquiryMessage({}),
  (v) => typeof v === "string" && v.trim().length > 0,
);

checkValue(
  "it returns plain text, not something already encoded",
  // Encoding belongs to whatsappHref alone; doing it here too is what puts
  // %2520 in the customer's message.
  () => inquiryMessage(FULL),
  (v) => !/%[0-9A-Fa-f]{2}/.test(v),
);
checkValue(
  "it stays short enough to survive a query string",
  () => inquiryMessage(FULL),
  (v) => v.length <= 300,
  (v) => `${v.length} characters`,
);

console.log("\nwhatsappHref — a real link, encoded exactly once");

const PLAIN = "Hi! A question about the Studiobook.";

checkValue(
  "an unusable number yields null rather than a broken link",
  () => whatsappHref("123", PLAIN),
  (v) => v === null,
);
checkValue(
  "a usable number yields a wa.me link",
  () => whatsappHref("+1 (555) 123-4567", PLAIN),
  (v) => typeof v === "string" && v.startsWith("https://wa.me/"),
);
checkValue(
  "the path is the normalized number",
  () => whatsappHref("+1 (555) 123-4567", PLAIN),
  (v) => v !== null && new URL(v).pathname === "/15551234567",
  (v) => (v === null ? "null" : new URL(v).pathname),
);

/**
 * The round trip, which is the assertion that matters most.
 *
 * Parsing the href back out has to give the exact message that went in. That
 * one comparison catches under-encoding (a `&` starts a second parameter and
 * truncates the text), over-encoding (`%2520` reaches the customer) and
 * newlines being mangled — without saying anything about how you encode.
 */
for (const [label, message] of [
  ["a plain sentence", PLAIN],
  ["an ampersand", "Is the ASUS & the Dell in stock?"],
  ["a hash", "Order #91K90LXZ — where is it?"],
  ["a question mark and equals", "Which is faster? i9=better?"],
  ["a newline", "Hi!\nQuestion about my order."],
  ["a plus sign", "Battery life 10+ hours?"],
  ["an emoji", "Is it in stock? 👀"],
  ["a percent sign", "Is the 30% off still on?"],
] as const) {
  checkValue(
    `${label} survives the round trip`,
    () => whatsappHref("15551234567", message),
    (v) => v !== null && new URL(v).searchParams.get("text") === message,
    (v) => (v === null ? "null" : String(new URL(v).searchParams.get("text"))),
  );
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
