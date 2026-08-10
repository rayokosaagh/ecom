import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";

import { FulfilmentMethod, PaymentMethod } from "../src/generated/prisma/enums";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_ORDER,
  isPaymentMethod,
  paymentMethodLabel,
  paymentUnavailable,
} from "../src/lib/payments/methods";
import {
  ESEWA_COMPLETE,
  SIGNED_FIELD_NAMES,
  amountMatches as esewaAmountMatches,
  buildFormFields,
  formatAmount,
  isValidTransactionUuid,
  nextTransactionUuid,
  orderIdFromTransactionUuid,
  readCallback,
  sign,
  signatureMessage,
} from "../src/lib/payments/esewa";
import {
  KHALTI_STATUSES,
  amountMatches as khaltiAmountMatches,
  isFinalFailure,
  isPaid,
} from "../src/lib/payments/khalti";
import {
  VALIDATE_TOKEN_FIELDS,
  amountMatches as cipsAmountMatches,
  formatAmount as cipsFormatAmount,
  formatTxnDate,
  isPaid as cipsIsPaid,
  isValidTxnId,
  sign as cipsSign,
  tokenMessage as cipsTokenMessage,
  txnIdFor,
} from "../src/lib/payments/connectips";
import {
  cartPaymentOutcome,
  paymentOutcome,
  paymentWasAbandoned,
} from "../src/lib/payments/outcome";

/**
 * Checks for payment methods and gateway message formats.
 *
 * This decides whether money is taken and whether an order is treated as paid,
 * so the bar is higher than elsewhere. Four things are defended.
 *
 * **The eSewa signature must be byte-exact.** A wrong signature is not visibly
 * wrong — it is a payment that will not start, rejected generically at the
 * gateway with nothing to debug. eSewa's docs print a worked example whose
 * output does not match its own inputs (see the note on `PINNED_SIGNATURE`), so
 * what is asserted here is the documented *algorithm*, pinned against a value
 * of our own so it cannot drift.
 *
 * **The signed amount and the sent amount must be the same string.** They are
 * the same money in any formatting; they are only the same *message* in one.
 *
 * **A redirect must never be treated as proof of payment.** A tampered or
 * replayed callback has to fail verification.
 *
 * **A method must not be offered where it cannot work** — wrong currency, or
 * under a gateway's floor.
 *
 *   npm run check:payments
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

/** eSewa's own published UAT credentials and worked example. */
const TEST_SECRET = "8gBm/:&EnhH.1/q";
const TEST_PRODUCT_CODE = "EPAYTEST";

console.log("\neSewa signs exactly what its documentation says");

/**
 * eSewa's documented example inputs.
 *
 * Its docs also print a result for these — `4Ov7pCI1zIOdwtV2BRMUNjz1upIlT/…` —
 * and **that value does not correspond to these inputs.** It was checked
 * against the message with and without spaces, values-only, a trailing newline,
 * the secret HTML-entity-encoded and space-padded, and plain SHA-256 of the two
 * concatenated both ways. Nothing reproduces it, so the printed result is stale
 * rather than our arithmetic being wrong.
 *
 * What *is* unambiguous, and what every working integration implements, is the
 * prose beside it: HMAC-SHA256 over `total_amount,transaction_uuid,product_code`
 * as `key=value` pairs in that order, base64. That is what is asserted here.
 *
 * The pinned value below is therefore **our own**, not eSewa's — a regression
 * guard, so a refactor cannot silently change what gets signed. Do not "fix" it
 * to match the number in eSewa's docs; that number is the thing that is wrong.
 */
const DOC_MESSAGE = "total_amount=100,transaction_uuid=11-201-13,product_code=EPAYTEST";
const PINNED_SIGNATURE = "5DZywcrTKD0gia/rsSMcrRHmJl+4Tbol6S+lWgdJ94E=";

check(
  "the message is built as key=value pairs, comma separated, in order",
  signatureMessage({
    total_amount: "100",
    transaction_uuid: "11-201-13",
    product_code: TEST_PRODUCT_CODE,
  }) === DOC_MESSAGE,
);

check(
  "HMAC-SHA256 base64 over it is stable",
  sign(DOC_MESSAGE, TEST_SECRET) === PINNED_SIGNATURE,
  `got ${sign(DOC_MESSAGE, TEST_SECRET)}`,
);

// Independent of our own implementation: computed straight from node:crypto, so
// a bug inside `sign` cannot make this pass by agreeing with itself.
check(
  "and it is a real HMAC, not merely self-consistent",
  sign(DOC_MESSAGE, TEST_SECRET) ===
    createHmac("sha256", TEST_SECRET).update(DOC_MESSAGE, "utf8").digest("base64"),
);

check(
  "a different secret produces a different signature",
  sign(DOC_MESSAGE, "wrong-secret") !== PINNED_SIGNATURE,
);
check(
  "so does a tampered amount",
  sign(DOC_MESSAGE.replace("100", "1"), TEST_SECRET) !== PINNED_SIGNATURE,
);
check("the signed field list is the documented one", SIGNED_FIELD_NAMES === "total_amount,transaction_uuid,product_code");

console.log("\nAmounts are rendered once, and the form matches the signature");

check("whole rupees have no decimal part", formatAmount(410000) === "4100");
check("a paisa remainder is kept", formatAmount(410050) === "4100.5");
check("and so is a single paisa", formatAmount(410001) === "4100.01");
check("zero is zero", formatAmount(0) === "0");
// Binary floating point is exactly how "4100.499999999999" gets into a signed
// message and breaks a payment nobody can explain.
check(
  "no floating-point tail leaks in",
  !formatAmount(1_070_070).includes("999"),
);

const fields = buildFormFields({
  goodsMinorUnits: 410000,
  deliveryMinorUnits: 70000,
  transactionUuid: "order-1",
  productCode: TEST_PRODUCT_CODE,
  secret: TEST_SECRET,
  successUrl: "https://shop.example/api/payments/esewa/callback",
  failureUrl: "https://shop.example/api/payments/esewa/callback?order=1",
});

check("the total is goods plus delivery", fields.total_amount === "4800");
check("goods are declared separately", fields.amount === "4100");
check("so is delivery", fields.product_delivery_charge === "700");
// eSewa checks that the parts add up to the total, and rejects the form if not.
check(
  "and the parts add up the way eSewa checks",
  Number(fields.amount) +
    Number(fields.tax_amount) +
    Number(fields.product_service_charge) +
    Number(fields.product_delivery_charge) ===
    Number(fields.total_amount),
);

// The invariant the whole module exists for.
check(
  "the signature is over the same total string that is sent",
  fields.signature ===
    sign(
      `total_amount=${fields.total_amount},transaction_uuid=${fields.transaction_uuid},product_code=${fields.product_code}`,
      TEST_SECRET,
    ),
);

console.log("\nA callback is only believed when it verifies");

/**
 * A callback blob, signed honestly and then optionally tampered with.
 *
 * The order matters, and getting it wrong is how this suite first passed a test
 * it should have failed: applying the overrides *before* signing re-signs the
 * tampered body, which is not tampering at all — it is a valid callback for
 * different values. `after` is applied to the JSON once the signature is
 * already computed, which is what an attacker editing a redirect actually does.
 */
function callbackBlob(
  options: {
    signed?: Record<string, string>;
    after?: Record<string, string>;
    secret?: string;
  } = {},
) {
  const body: Record<string, string> = {
    transaction_code: "000AE01",
    status: ESEWA_COMPLETE,
    total_amount: "4800",
    transaction_uuid: "order-1",
    product_code: TEST_PRODUCT_CODE,
    signed_field_names: SIGNED_FIELD_NAMES,
    ...options.signed,
  };

  const message = body.signed_field_names
    .split(",")
    .map((name) => `${name}=${body[name] ?? ""}`)
    .join(",");
  body.signature = sign(message, options.secret ?? TEST_SECRET);

  return Buffer.from(JSON.stringify({ ...body, ...options.after })).toString(
    "base64",
  );
}

const good = readCallback(callbackBlob(), TEST_SECRET);
check("a genuine callback is read", good !== null);
check("with its status", good?.status === ESEWA_COMPLETE);
check("and its transaction id", good?.transaction_uuid === "order-1");

// The attack this check exists for: change the amount in the redirect and hope
// nobody re-derives the HMAC.
check(
  "an amount tampered with after signing is rejected",
  readCallback(callbackBlob({ after: { total_amount: "1" } }), TEST_SECRET) === null,
);
/**
 * The property that justifies the extra network call, stated as a test.
 *
 * eSewa signs three fields — total_amount, transaction_uuid, product_code — and
 * **`status` is not one of them.** So a redirect whose status has been flipped
 * to COMPLETE still verifies perfectly: the signature was never a claim about
 * the status in the first place.
 *
 * This is asserted rather than merely commented because it is the entire reason
 * `api/payments/esewa/callback` calls the transaction status API after the
 * signature passes. Anyone who later decides that call looks redundant should
 * have to delete this check to do it.
 */
const statusFlipped = readCallback(
  callbackBlob({
    signed: { status: "PENDING" },
    after: { status: ESEWA_COMPLETE },
  }),
  TEST_SECRET,
);
check(
  "a status flipped after signing still verifies — the signature does not cover it",
  statusFlipped !== null && statusFlipped.status === ESEWA_COMPLETE,
);
check(
  "which is why the signed field list excludes it",
  !SIGNED_FIELD_NAMES.split(",").includes("status"),
);
check(
  "a forged signature is rejected",
  readCallback(callbackBlob({ after: { signature: "AAAA" } }), TEST_SECRET) === null,
);
check(
  "one signed with the wrong secret is rejected",
  readCallback(callbackBlob({ secret: "not-the-secret" }), TEST_SECRET) === null,
);
// The signed field list is read from the response, not from our constant — so a
// response that signed nothing we care about must not sail through.
check(
  "a response that signs only a harmless field is still checked",
  (() => {
    const forged = callbackBlob({
      signed: { signed_field_names: "product_code" },
      after: { total_amount: "1", status: ESEWA_COMPLETE },
    });
    const read = readCallback(forged, TEST_SECRET);
    // It verifies — eSewa really did sign that one field — so the amount check
    // downstream is what stops it. Asserted here so the division of labour is
    // deliberate rather than accidental.
    return read !== null && !esewaAmountMatches(read.total_amount, 480000);
  })(),
);
check("garbage is rejected", readCallback("not-base64-json", TEST_SECRET) === null);
check(
  "so is a blob with no signature at all",
  readCallback(
    Buffer.from(JSON.stringify({ status: "COMPLETE" })).toString("base64"),
    TEST_SECRET,
  ) === null,
);

console.log("\nReported totals are compared as money, not as strings");

check("the same amount written differently still matches", esewaAmountMatches("4,800.00", 480000));
check("a bare integer matches", esewaAmountMatches("4800", 480000));
check("a different amount does not", !esewaAmountMatches("4700", 480000));
check("nor does nonsense", !esewaAmountMatches("free", 480000));

// Khalti reports paisa, which is what the database stores — no conversion, and
// therefore nothing to get backwards.
check("khalti paisa match directly", khaltiAmountMatches(480000, 480000));
check("a non-number is caught", !khaltiAmountMatches("480000", 480000));

/**
 * Khalti's service charge, observed live in its sandbox.
 *
 * It adds a flat fee on top of the requested amount and shows the customer the
 * larger figure — Rs 50 presented as Rs 55.65, Rs 47,000 as Rs 47,005.65. An
 * equality check here would reject every real payment the moment `lookup`
 * reported the fee-inclusive total, and that failure only surfaces once money
 * is actually moving.
 */
check(
  "an amount inflated by Khalti's service charge is accepted",
  khaltiAmountMatches(5565, 5000),
);
check(
  "and the same on a large order",
  khaltiAmountMatches(4700565, 4700000),
);
// Underpayment is the direction that matters, and is still refused.
check("underpayment is refused", !khaltiAmountMatches(4800, 480000));
check("by even a single paisa", !khaltiAmountMatches(4999, 5000));

console.log("\nOnly one Khalti status means paid");

check("Completed is paid", isPaid("Completed"));
for (const status of ["Pending", "Initiated", "Refunded", "Expired", "User canceled"]) {
  check(`${status} is not`, !isPaid(status));
}
// A payment still in flight must not be retried — two live payments against one
// order is how a customer pays twice.
check("an expired payment may be retried", isFinalFailure("Expired"));
check("a cancelled one may be retried", isFinalFailure("User canceled"));
check("a pending one may not", !isFinalFailure("Pending"));

console.log("\nRetries get a fresh transaction id that still finds the order");

check("the first attempt is the order id", nextTransactionUuid("ord1", null) === "ord1");
check("the second is suffixed", nextTransactionUuid("ord1", "ord1") === "ord1-2");
check("and it keeps counting", nextTransactionUuid("ord1", "ord1-2") === "ord1-3");
// A Khalti pidx left over from an abandoned attempt is not one of ours.
check(
  "a reference from another gateway restarts the count",
  nextTransactionUuid("ord1", "some-khalti-pidx") === "ord1-2",
);
check(
  "every generated id is one eSewa will accept",
  ["ord1", "ord1-2", "ord1-3"].every(isValidTransactionUuid),
);
check("an underscore is not", !isValidTransactionUuid("ord_1"));
check("nor is an empty string", !isValidTransactionUuid(""));

// The round trip that matters: whichever attempt a customer completes, the
// callback has to find the order. Requiring an exact match on the *stored*
// reference stranded anyone who paid from an older tab — money taken, order
// still pending — which is why the callback strips the suffix instead.
check(
  "the first attempt maps back to the order",
  orderIdFromTransactionUuid("ord1") === "ord1",
);
check(
  "and so does a later one",
  orderIdFromTransactionUuid("ord1-7") === "ord1",
);
check(
  "every attempt round-trips",
  ["ord1", "ord1-2", "ord1-3", "ord1-10"].every(
    (uuid) => orderIdFromTransactionUuid(uuid) === "ord1",
  ),
);
// A cuid ends in alphanumerics, so nothing legitimate is truncated.
check(
  "a real order id is left alone",
  orderIdFromTransactionUuid("cmsm8ryzf0001usu7lwp2zeol") ===
    "cmsm8ryzf0001usu7lwp2zeol",
);

console.log("\nA method is only offered where it can work");

// Configured and in currency, so only the amount is in question. The shop is
// priced in NPR by default — see lib/money/currency.
check(
  "COD is always available",
  paymentUnavailable(PaymentMethod.COD, 1, true) === null,
);
check(
  "an unconfigured gateway is not offered",
  paymentUnavailable(PaymentMethod.KHALTI, 100000, false)?.reason === "not-configured",
);
// Khalti's documented floor is 1000 paisa; below it the initiate call is
// rejected, so offering it spends the customer's time to say what we knew.
check(
  "a basket under Khalti's floor is refused",
  paymentUnavailable(PaymentMethod.KHALTI, 999, true)?.reason === "too-small",
);
check(
  "exactly at the floor is fine",
  paymentUnavailable(PaymentMethod.KHALTI, 1000, true) === null,
);
check(
  "eSewa has no floor",
  paymentUnavailable(PaymentMethod.ESEWA, 1, true) === null,
);

console.log("\nThe wording follows the fulfilment method");

check(
  "cash on delivery, when it is delivered",
  paymentMethodLabel(PaymentMethod.COD, FulfilmentMethod.DELIVERY) ===
    "Cash on delivery",
);
// "Cash on delivery" on an order the customer is collecting describes an event
// that will not happen.
check(
  "cash on collection, when it is collected",
  paymentMethodLabel(PaymentMethod.COD, FulfilmentMethod.PICKUP) ===
    "Cash on collection",
);
check(
  "a wallet reads the same either way",
  paymentMethodLabel(PaymentMethod.KHALTI, FulfilmentMethod.PICKUP) === "Khalti",
);

console.log("\nconnectIPS signs with a certificate, not a shared secret");

// A throwaway key pair, so the signing path is exercised without a merchant
// certificate — which NCHL only issues through onboarding, and which therefore
// nobody can self-serve for a test.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

const cipsFields = {
  MERCHANTID: "M1",
  APPID: "A1",
  APPNAME: "Ecom",
  TXNID: "TXN1",
  TXNDATE: "10-08-2026",
  TXNCRNCY: "NPR",
  TXNAMT: "398000",
  REFERENCEID: "ord1",
  REMARKS: "Order ABC",
  PARTICULARS: "Order ABC",
};

/**
 * The byte layout, pinned.
 *
 * This is the one part of the connectIPS integration that could not be checked
 * against a primary source — NCHL's docs render client-side, so the page could
 * not be read as raw text. Pinned here so the layout is a deliberate decision
 * with a single place to correct it, rather than something that quietly drifts.
 * If connectIPS rejects requests with a token error, change this string and the
 * one in `lib/payments/connectips` together.
 */
const CIPS_MESSAGE =
  "MERCHANTID=M1,APPID=A1,APPNAME=Ecom,TXNID=TXN1,TXNDATE=10-08-2026," +
  "TXNCRNCY=NPR,TXNAMT=398000,REFERENCEID=ord1,REMARKS=Order ABC," +
  "PARTICULARS=Order ABC,TOKEN=TOKEN";

check("the token message is built in the documented order", cipsTokenMessage(cipsFields) === CIPS_MESSAGE, `got ${cipsTokenMessage(cipsFields)}`);
check(
  "the validation token uses the short field set",
  cipsTokenMessage(
    { MERCHANTID: "M1", APPID: "A1", REFERENCEID: "ord1", TXNAMT: "398000" },
    VALIDATE_TOKEN_FIELDS,
  ) === "MERCHANTID=M1,APPID=A1,REFERENCEID=ord1,TXNAMT=398000,TOKEN=TOKEN",
);

// Verified with the public key rather than compared to a fixed string: an RSA
// signature is not deterministic across implementations, so a pinned value
// would assert nothing useful. What matters is that it verifies.
const cipsSignature = cipsSign(CIPS_MESSAGE, privateKey);
check(
  "the signature verifies against the matching public key",
  createVerify("RSA-SHA256")
    .update(CIPS_MESSAGE, "utf8")
    .verify(publicKey, cipsSignature, "base64"),
);
check(
  "a tampered message does not verify",
  !createVerify("RSA-SHA256")
    .update(CIPS_MESSAGE.replace("398000", "1"), "utf8")
    .verify(publicKey, cipsSignature, "base64"),
);
check("and it is base64", /^[A-Za-z0-9+/]+={0,2}$/.test(cipsSignature));

// Paisa, unlike eSewa's rupees. Three gateways, three conventions.
check("connectIPS takes paisa as an integer", cipsFormatAmount(398000) === "398000");
check("with no decimal point", !cipsFormatAmount(398050).includes("."));
check("the date is DD-MM-YYYY", formatTxnDate(new Date(Date.UTC(2026, 7, 10))) === "10-08-2026");
check("single digits are padded", formatTxnDate(new Date(Date.UTC(2026, 0, 5))) === "05-01-2026");

// TXNID is capped at 20 characters and must be alphanumeric; a cuid is 25.
check("a cuid is trimmed to a legal txn id", isValidTxnId(txnIdFor("cmsm8ryzf0001usu7lwp2zeol")));
check("and it is 20 characters", txnIdFor("cmsm8ryzf0001usu7lwp2zeol").length === 20);
check("a short id is left alone", txnIdFor("ord1") === "ord1");
check("a hyphen is not allowed here, unlike eSewa", !isValidTxnId("ord-1"));

check("SUCCESS means paid", cipsIsPaid("SUCCESS"));
check("and it is case-insensitive", cipsIsPaid("success"));
check("anything else does not", !cipsIsPaid("FAILED") && !cipsIsPaid("PENDING"));
check("reported paisa are compared as money", cipsAmountMatches("398000", 398000));
check("a mismatch is caught", !cipsAmountMatches("1", 398000));

console.log("\nEvery callback outcome says something");

check("no code means no banner", paymentOutcome(undefined) === null);
check("paid reads as success", paymentOutcome("paid")?.tone === "good");
// Not "failed": the money may well have moved, and what has not happened is us
// agreeing on the figure.
check("a mismatch reads as a problem", paymentOutcome("mismatch")?.tone === "bad");
check(
  "a cancellation is neither",
  paymentOutcome("cancelled")?.tone === "neutral",
);
// Gateway statuses are passed through verbatim, and the set is theirs to
// change — so an unknown one must still produce readable copy.
const unknown = paymentOutcome("Some Future Status");
check("an unrecognised status still renders", unknown !== null);
check("neutrally, rather than claiming failure", unknown?.tone === "neutral");
check("and it quotes what the gateway said", unknown!.detail.includes("Some Future Status"));

for (const code of [
  "paid",
  "cancelled",
  "Pending",
  "Expired",
  "unverified",
  "mismatch",
  "unconfigured",
  "invalid",
  "unknown",
]) {
  const outcome = paymentOutcome(code);
  check(
    `${code} has a title, detail and icon`,
    Boolean(outcome?.title && outcome?.detail && outcome?.icon),
  );
}

console.log("\nEvery method is complete");

for (const method of PAYMENT_METHOD_ORDER) {
  const info = PAYMENT_METHODS[method];
  check(
    `${method} has a label, blurb and icon`,
    Boolean(info.label && info.blurb && info.icon),
  );
}
check(
  "the catalogue covers the enum exactly",
  PAYMENT_METHOD_ORDER.length === Object.keys(PaymentMethod).length,
);
check("a real member is recognised", isPaymentMethod("KHALTI"));
check("an invented one is not", !isPaymentMethod("BITCOIN"));
check("and neither is a prototype key", !isPaymentMethod("toString"));

/**
 * The set that unwinds an order without anyone clicking.
 *
 * This is the highest-consequence list in the file. A code that gets in
 * wrongly cancels an order and puts its stock back on the shelf while the
 * money may still be in flight — so the test worth writing is not "cancelled
 * is in the set" but "nothing that could still settle is".
 */
console.log("\nOnly a final failure unwinds the order");

check("the shopper pressing cancel counts", paymentWasAbandoned("cancelled"));
check("so does eSewa's own CANCELED", paymentWasAbandoned("CANCELED"));
check("and Khalti's two finals", paymentWasAbandoned("User canceled") && paymentWasAbandoned("Expired"));

// Each of these leaves the order alone. `Pending` and `Initiated` may still
// settle; `unverified` means we could not reach the gateway to ask, which is
// the case where cancelling would be guessing with somebody's money.
for (const code of [
  "Pending",
  "PENDING",
  "Initiated",
  "unverified",
  "mismatch",
  "invalid",
  "unknown",
  "unconfigured",
  "paid",
  "Refunded",
  "Partially Refunded",
  "Some Future Status",
]) {
  check(`${code} leaves the order standing`, !paymentWasAbandoned(code));
}

check("and no code at all is not an abandonment", !paymentWasAbandoned(undefined));

// Two lists describing the same idea is how they drift. Khalti's own
// `isFinalFailure` is the authority for Khalti's statuses; the abandon set has
// to agree with it on every one of them.
for (const status of KHALTI_STATUSES) {
  check(
    `khalti "${status}": final=${isFinalFailure(status)} agrees with the abandon set`,
    isFinalFailure(status) === paymentWasAbandoned(status),
  );
}

// A completed payment must never be in there, whatever else changes.
check("a completed payment is never abandoned", !paymentWasAbandoned("Completed"));
check("nor is our own paid code", !paymentWasAbandoned("paid"));

console.log("\nThe basket says what happened to it");

check("no code means no banner", cartPaymentOutcome(undefined) === null);
// The cart banner is only ever reached by an abandonment. Anything else lands
// on the receipt, where `paymentOutcome` speaks instead.
check("a still-settling payment gets no cart banner", cartPaymentOutcome("Pending") === null);
check("nor does a paid one", cartPaymentOutcome("paid") === null);

for (const code of ["cancelled", "CANCELED", "User canceled", "Expired"]) {
  const outcome = cartPaymentOutcome(code);
  check(`${code} explains the basket`, Boolean(outcome?.title && outcome?.detail));
  check(
    `${code} says the money did not move`,
    outcome!.detail.includes("Nothing was charged"),
  );
  // The whole point of the redirect: the shopper's things are in front of them.
  check(`${code} says where the items went`, outcome!.detail.includes("basket"));
}

// `Boolean(...)` because `?.` yields `boolean | undefined`, and a missing
// outcome should read as a failed check rather than fail to compile.
check(
  "an expired payment is named as expired",
  Boolean(cartPaymentOutcome("Expired")?.title.includes("expired")),
);
check(
  "a cancelled one as cancelled",
  Boolean(cartPaymentOutcome("cancelled")?.title.includes("cancelled")),
);

// The outcome for money that arrived after the order was swept. It has to be
// findable and it has to not read as success.
console.log("\nA payment that lands too late is not called success");

const late = paymentOutcome("settled-late");
check("it has copy of its own", late !== null);
check("and reads as a problem", late?.tone === "bad");
check("and tells the customer not to pay twice", late!.detail.includes("not pay again"));

console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} check${failures === 1 ? "" : "s"} failed.\n`,
);

process.exit(failures === 0 ? 0 : 1);
