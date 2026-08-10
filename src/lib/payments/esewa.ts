import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * eSewa ePay v2: signing a payment request, and verifying what comes back.
 *
 * Free of Prisma and of any network call, so `npm run check:payments` can
 * exercise it directly — including against eSewa's own published example,
 * which is a known-answer test for the signature. That vector is the whole
 * reason this module is worth having separately: a signature that is wrong is
 * not wrong *visibly*, it is a payment that will not start, and no amount of
 * reading the code proves it right.
 *
 * ## The one invariant
 *
 * **The `total_amount` in the signature must be byte-identical to the
 * `total_amount` in the form.** eSewa recomputes the HMAC over the fields it
 * received; "4100" and "4100.00" are the same money and different messages, and
 * the failure is a generic rejection at the gateway with nothing to debug. So
 * the amount is rendered exactly once, by `formatAmount`, and both the form and
 * the signed message read that same string.
 *
 * ## Units
 *
 * eSewa's `total_amount` is in **rupees** — its own example signs
 * `total_amount=100` for a hundred-rupee payment. Everything in this database
 * is minor units, so the conversion happens here and nowhere else. (Khalti is
 * the other way round: paisa. The two gateways disagreeing is exactly why
 * neither conversion is inlined at a call site.)
 */

/** Signed in this order, and named in the `signed_field_names` field. */
const SIGNED_FIELDS = ["total_amount", "transaction_uuid", "product_code"] as const;

export const SIGNED_FIELD_NAMES = SIGNED_FIELDS.join(",");

export const ESEWA_FORM_URL = {
  sandbox: "https://rc-epay.esewa.com.np/api/epay/main/v2/form",
  live: "https://epay.esewa.com.np/api/epay/main/v2/form",
} as const;

export const ESEWA_STATUS_URL = {
  sandbox: "https://rc.esewa.com.np/api/epay/transaction/status/",
  live: "https://esewa.com.np/api/epay/transaction/status/",
} as const;

/**
 * Minor units to the decimal string eSewa is sent and signs.
 *
 * Trailing zeros are trimmed rather than padded to two places: eSewa's own
 * examples use `100`, not `100.00`, and since the same string is signed, the
 * only thing that actually matters is that this function is the single source
 * of it.
 */
export function formatAmount(minorUnits: number, minorPerMajor = 100): string {
  const major = minorUnits / minorPerMajor;
  // `toFixed(2)` then strip, rather than `String(major)`, so binary floating
  // point cannot leak "4100.499999999999" into a signed message.
  return major.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

/** The exact message eSewa's HMAC is computed over. */
export function signatureMessage(fields: {
  total_amount: string;
  transaction_uuid: string;
  product_code: string;
}): string {
  return SIGNED_FIELDS.map((name) => `${name}=${fields[name]}`).join(",");
}

/** HMAC-SHA256 over the message, base64 — as eSewa specifies. */
export function sign(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("base64");
}

/**
 * Every field of the eSewa form.
 *
 * Carries an index signature as well as its named fields: the component that
 * renders it iterates the entries rather than naming eleven inputs, and the
 * names are eSewa's to decide, not ours to restate.
 */
export interface EsewaFormFields {
  [field: string]: string;
  amount: string;
  tax_amount: string;
  total_amount: string;
  transaction_uuid: string;
  product_code: string;
  product_service_charge: string;
  product_delivery_charge: string;
  success_url: string;
  failure_url: string;
  signed_field_names: string;
  signature: string;
}

/**
 * Every field of the form the browser POSTs to eSewa.
 *
 * Goods and delivery are declared separately because eSewa asks for them
 * separately and checks that they add up: `total_amount` must equal
 * `amount + tax_amount + product_service_charge + product_delivery_charge`. The
 * total is computed from the parts here rather than taken as a fourth argument,
 * so it cannot be handed a figure that contradicts them.
 */
export function buildFormFields(input: {
  /** Goods after any discount, in minor units. */
  goodsMinorUnits: number;
  /** Delivery, in minor units. Zero for collection. */
  deliveryMinorUnits: number;
  /** Alphanumeric and hyphens only — eSewa rejects anything else. */
  transactionUuid: string;
  productCode: string;
  secret: string;
  successUrl: string;
  failureUrl: string;
}): EsewaFormFields {
  const amount = formatAmount(input.goodsMinorUnits);
  const delivery = formatAmount(input.deliveryMinorUnits);
  const total = formatAmount(input.goodsMinorUnits + input.deliveryMinorUnits);

  const signed = {
    total_amount: total,
    transaction_uuid: input.transactionUuid,
    product_code: input.productCode,
  };

  return {
    amount,
    tax_amount: "0",
    total_amount: total,
    transaction_uuid: input.transactionUuid,
    product_code: input.productCode,
    product_service_charge: "0",
    product_delivery_charge: delivery,
    success_url: input.successUrl,
    failure_url: input.failureUrl,
    signed_field_names: SIGNED_FIELD_NAMES,
    signature: sign(signatureMessage(signed), input.secret),
  };
}

/** eSewa rejects a transaction_uuid containing anything else. */
export function isValidTransactionUuid(value: string): boolean {
  return /^[A-Za-z0-9-]+$/.test(value) && value.length > 0;
}

/**
 * The transaction id for the next attempt at paying one order.
 *
 * eSewa refuses a `transaction_uuid` it has already seen, so a retry cannot
 * reuse the first one — but the value must still lead back to the order, since
 * the callback looks it up by exactly this.
 *
 * Derived from the previous attempt rather than from a clock or a random
 * source, which is what makes it a pure function: the same order in the same
 * state always produces the same next id, so it can be exercised directly and
 * cannot be a source of nondeterminism inside a render.
 *
 *   null      → "cmslw2r0x0000"
 *   "…0000"   → "…0000-2"
 *   "…0000-2" → "…0000-3"
 */
export function nextTransactionUuid(
  orderId: string,
  previous: string | null,
): string {
  if (!previous) return orderId;

  const suffixed = previous.match(/^(.*)-(\d+)$/);
  if (suffixed && suffixed[1] === orderId) {
    return `${orderId}-${Number(suffixed[2]) + 1}`;
  }

  // Either the first attempt used the bare order id, or the stored reference
  // belongs to another gateway entirely — a Khalti `pidx` from a payment the
  // customer abandoned before switching. Both mean "this is attempt two".
  return `${orderId}-2`;
}

/**
 * The order a transaction id belongs to, whichever attempt it was.
 *
 * The inverse of `nextTransactionUuid`, and it exists because matching the
 * *stored* reference exactly is not good enough. Opening the payment page twice
 * mints a second id and overwrites the first; a customer who then completes the
 * payment in the older tab comes back with an id nothing matches — money taken,
 * order still pending, and no automatic way to reconcile it.
 *
 * Stripping the attempt suffix makes every attempt for an order settleable.
 * That is safe because the id is a lookup key and never an authorisation: the
 * signature proves eSewa produced the callback, the status API proves the money
 * moved, and the amount check proves it was the right amount. This only decides
 * *which* order those three statements are about.
 */
export function orderIdFromTransactionUuid(uuid: string): string {
  return uuid.replace(/-\d+$/, "");
}

export interface EsewaCallback {
  transaction_code: string;
  status: string;
  total_amount: string;
  transaction_uuid: string;
  product_code: string;
  signed_field_names: string;
  signature: string;
}

/**
 * Read and authenticate the base64 blob eSewa redirects back with.
 *
 * The signature is re-derived over **the fields eSewa says it signed**, read
 * from `signed_field_names` in the response rather than from our own constant.
 * That is not politeness to a future protocol version — it is the only way the
 * check means anything: verifying a list we chose would happily pass a response
 * that signed nothing we cared about.
 *
 * Compared with `timingSafeEqual`. The comparison is not really a secret-
 * dependent branch an attacker can time over a redirect, but a signature check
 * written the fast way is a habit worth not having.
 *
 * Returns null on anything malformed. A caller must treat null and "not
 * COMPLETE" identically: neither is proof of payment.
 */
export function readCallback(
  data: string,
  secret: string,
): EsewaCallback | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;

  const names = String(parsed.signed_field_names ?? "");
  const claimed = String(parsed.signature ?? "");
  if (!names || !claimed) return null;

  const message = names
    .split(",")
    .map((name) => `${name}=${String(parsed[name] ?? "")}`)
    .join(",");

  const expected = sign(message, secret);

  const a = Buffer.from(expected);
  const b = Buffer.from(claimed);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return {
    transaction_code: String(parsed.transaction_code ?? ""),
    status: String(parsed.status ?? ""),
    total_amount: String(parsed.total_amount ?? ""),
    transaction_uuid: String(parsed.transaction_uuid ?? ""),
    product_code: String(parsed.product_code ?? ""),
    signed_field_names: names,
    signature: claimed,
  };
}

/**
 * Whether eSewa's reported total matches what we asked for.
 *
 * String comparison would fail on "4100" against "4,100.0", both of which are
 * the same money — and eSewa's status API is not required to echo our exact
 * formatting back. Compared as minor units, with grouping separators stripped.
 */
export function amountMatches(
  reported: string,
  expectedMinorUnits: number,
  minorPerMajor = 100,
): boolean {
  const major = Number(reported.replace(/,/g, "").trim());
  if (!Number.isFinite(major)) return false;
  return Math.round(major * minorPerMajor) === expectedMinorUnits;
}

/** The only status that means the money moved. */
export const ESEWA_COMPLETE = "COMPLETE";
