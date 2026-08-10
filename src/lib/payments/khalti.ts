/**
 * Khalti ePayment: starting a payment, and confirming one.
 *
 * The shape of Khalti's flow is the opposite of eSewa's. eSewa is signed by us
 * and POSTed by the browser; Khalti is a server-to-server call that returns a
 * hosted URL to send the customer to. Nothing is signed, because nothing has
 * to be: the secret key never leaves the server, and the answer that decides
 * whether an order is paid comes from a second server-to-server call rather
 * than from the redirect.
 *
 * The pure parts live here and the network calls are the two exported
 * functions at the bottom, so the check suite can exercise the decisions —
 * which statuses mean paid, whether an amount matches — without a key.
 */

export const KHALTI_BASE_URL = {
  sandbox: "https://dev.khalti.com/api/v2",
  live: "https://khalti.com/api/v2",
} as const;

/**
 * Khalti's documented statuses.
 *
 * Written out rather than narrowed to "is it Completed", because the ones that
 * are not completed are not all the same thing: `Pending` may still settle and
 * is worth telling a customer about, while `Expired` and `User canceled` are
 * final and mean the order should be payable again.
 */
export const KHALTI_STATUSES = [
  "Completed",
  "Pending",
  "Initiated",
  "Refunded",
  "Partially Refunded",
  "Expired",
  "User canceled",
] as const;

export type KhaltiStatus = (typeof KHALTI_STATUSES)[number];

/** The only status that means the money is ours. */
export function isPaid(status: string): boolean {
  return status === "Completed";
}

/**
 * Whether the customer can be offered another attempt.
 *
 * A payment still in flight must not be retried — two live `pidx` values
 * against one order is how a customer pays twice.
 */
export function isFinalFailure(status: string): boolean {
  return status === "Expired" || status === "User canceled";
}

/**
 * Whether Khalti collected at least what the order costs.
 *
 * `amount` is in paisa, which is what this database already stores — so no
 * conversion, and nothing to get backwards.
 *
 * **Not an equality check, and that is deliberate.** Khalti adds its own
 * service charge on top of the requested amount and shows the customer the
 * larger figure: a Rs 50 order is presented as Rs 55.65, and a Rs 47,000 order
 * as Rs 47,005.65 — a flat fee, observed on both. If `lookup` reports the
 * fee-inclusive total rather than what we asked for, an equality check would
 * reject **every** genuine payment with `payment=mismatch`, which is a failure
 * that only appears once real money is moving.
 *
 * The direction is what matters. Less than the order total is underpayment and
 * is refused; more means the customer was charged a fee we do not levy and do
 * not receive, which is between them and Khalti and is no reason to withhold
 * their goods.
 */
export function amountMatches(
  reportedPaisa: unknown,
  expectedMinorUnits: number,
): boolean {
  return (
    typeof reportedPaisa === "number" &&
    Number.isFinite(reportedPaisa) &&
    Math.round(reportedPaisa) >= expectedMinorUnits
  );
}

export interface KhaltiInitiateResult {
  pidx: string;
  payment_url: string;
  expires_at?: string;
  expires_in?: number;
}

export interface KhaltiLookupResult {
  pidx: string;
  status: string;
  total_amount: number;
  transaction_id: string | null;
  fee?: number;
  refunded?: boolean;
}

export class KhaltiError extends Error {}

async function post<T>(
  url: string,
  secretKey: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      // Khalti's documented scheme: the literal word "Key", then the secret.
      Authorization: `Key ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    // Never served from a cache: one of these starts a payment and the other
    // decides whether an order is paid.
    cache: "no-store",
  });

  const text = await response.text();

  if (!response.ok) {
    // Khalti returns field-keyed validation errors as JSON. Surfaced as text
    // rather than parsed: the caller logs it for an operator, and inventing a
    // shape for an error response is how a logger starts throwing.
    throw new KhaltiError(`Khalti ${response.status}: ${text.slice(0, 400)}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new KhaltiError(`Khalti returned a non-JSON body: ${text.slice(0, 200)}`);
  }
}

/**
 * Start a payment and get the URL to send the customer to.
 *
 * @param amountMinorUnits Paisa. Khalti's floor is 1000; `paymentUnavailable`
 *   refuses smaller baskets before it gets here.
 */
export async function initiate(
  config: { baseUrl: string; secretKey: string },
  input: {
    amountMinorUnits: number;
    purchaseOrderId: string;
    purchaseOrderName: string;
    returnUrl: string;
    websiteUrl: string;
    customer?: { name?: string; email?: string; phone?: string };
  },
): Promise<KhaltiInitiateResult> {
  const result = await post<KhaltiInitiateResult>(
    `${config.baseUrl}/epayment/initiate/`,
    config.secretKey,
    {
      return_url: input.returnUrl,
      website_url: input.websiteUrl,
      amount: input.amountMinorUnits,
      purchase_order_id: input.purchaseOrderId,
      purchase_order_name: input.purchaseOrderName,
      ...(input.customer ? { customer_info: input.customer } : {}),
    },
  );

  if (!result?.pidx || !result?.payment_url) {
    throw new KhaltiError("Khalti did not return a pidx and payment_url");
  }

  return result;
}

/**
 * Ask Khalti what actually happened.
 *
 * This, not the redirect, is what marks an order paid. The browser arrives back
 * carrying `status=Completed` in a query string that anyone can type; the only
 * statement worth acting on is the one Khalti makes to our server, about a
 * `pidx` we stored before the customer left.
 */
export async function lookup(
  config: { baseUrl: string; secretKey: string },
  pidx: string,
): Promise<KhaltiLookupResult> {
  return post<KhaltiLookupResult>(
    `${config.baseUrl}/epayment/lookup/`,
    config.secretKey,
    { pidx },
  );
}
