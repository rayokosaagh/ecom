import { createSign, createPrivateKey, type KeyObject } from "node:crypto";

/**
 * connectIPS (NCHL): signing a payment request, and validating one.
 *
 * The third shape in this folder, and the least like the others. Khalti is a
 * bearer key over JSON; eSewa is an HMAC with a shared secret; connectIPS is an
 * **RSA signature made with a private key from a merchant certificate**
 * (`CREDITOR.pfx`), which NCHL issues during merchant onboarding. There is no
 * shared secret, and no public sandbox anyone can self-serve into.
 *
 * ## Read this before trusting the signature
 *
 * The exact byte layout of the signed string is the one part of this file that
 * could not be verified against a primary source. NCHL's documentation site
 * renders client-side, so the page could not be read as raw text, and the
 * summarised version of it is not something to sign bytes against — earlier in
 * this same integration a summarised page produced a base64 value that turned
 * out to be fabricated.
 *
 * So `TOKEN_FIELDS` below encodes the documented field order, and
 * `tokenMessage` joins it in the documented way, and **both are pinned by
 * `npm run check:payments` so a change is deliberate rather than accidental**.
 * If connectIPS rejects every request with a token error, this is the first
 * and almost certainly the only place to look: compare `tokenMessage` against
 * the merchant pack NCHL supplies and fix the separator or the order here.
 * Nothing else in the flow depends on the layout.
 */

export const CONNECTIPS_URL = {
  gateway: {
    sandbox: "https://uat.connectips.com/connectipswebgw/loginpage",
    live: "https://login.connectips.com/connectipswebgw/loginpage",
  },
  validate: {
    sandbox: "https://uat.connectips.com/connectipswebws/api/creditor/validatetxn",
    live: "https://login.connectips.com/connectipswebws/api/creditor/validatetxn",
  },
} as const;

/** The order the request token is built in. See the warning above. */
export const TOKEN_FIELDS = [
  "MERCHANTID",
  "APPID",
  "APPNAME",
  "TXNID",
  "TXNDATE",
  "TXNCRNCY",
  "TXNAMT",
  "REFERENCEID",
  "REMARKS",
  "PARTICULARS",
] as const;

/** The shorter token used when asking whether a transaction succeeded. */
export const VALIDATE_TOKEN_FIELDS = [
  "MERCHANTID",
  "APPID",
  "REFERENCEID",
  "TXNAMT",
] as const;

export interface ConnectipsRequest {
  MERCHANTID: string;
  APPID: string;
  APPNAME: string;
  /** Alphanumeric, unique per attempt. */
  TXNID: string;
  /** `DD-MM-YYYY`. */
  TXNDATE: string;
  TXNCRNCY: string;
  /** **Paisa**, as an integer string — connectIPS takes the minor unit. */
  TXNAMT: string;
  REFERENCEID: string;
  REMARKS: string;
  PARTICULARS: string;
}

/**
 * The string that gets signed.
 *
 * `KEY=VALUE` joined by commas, with the trailing `TOKEN=TOKEN` literal the
 * documentation shows — it is part of the message, not a placeholder to
 * substitute.
 */
export function tokenMessage(
  fields: Record<string, string>,
  order: readonly string[] = TOKEN_FIELDS,
): string {
  return `${order.map((name) => `${name}=${fields[name] ?? ""}`).join(",")},TOKEN=TOKEN`;
}

/**
 * SHA256withRSA over the message, base64.
 *
 * The key is a `KeyObject` rather than a path or a passphrase, so this function
 * never touches the filesystem and never sees the certificate password — that
 * belongs to `lib/payments/config`, which is `server-only`. It also means the
 * signing itself can be exercised with a throwaway key pair.
 */
export function sign(message: string, privateKey: KeyObject): string {
  return createSign("RSA-SHA256").update(message, "utf8").sign(privateKey, "base64");
}

/** `DD-MM-YYYY`, the only date format connectIPS accepts. */
export function formatTxnDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getUTCFullYear()}`;
}

/**
 * connectIPS takes paisa as a plain integer string.
 *
 * The opposite of eSewa, which wants rupees, and the same as Khalti. Three
 * gateways, three conventions — which is exactly why each conversion lives in
 * its own module and none is inlined at a call site.
 */
export function formatAmount(minorUnits: number): string {
  return String(Math.round(minorUnits));
}

/** TXNID must be alphanumeric, and short — 20 characters in the merchant pack. */
export function isValidTxnId(value: string): boolean {
  return /^[A-Za-z0-9]{1,20}$/.test(value);
}

/**
 * A transaction id derived from the order, and the order id it came from.
 *
 * A cuid is 25 characters and contains only alphanumerics, so it is too long
 * but otherwise legal. The last 20 characters are taken — the tail rather than
 * the head, because a cuid's leading characters are a timestamp shared by
 * everything created in the same millisecond, while the tail is the random
 * part. `REFERENCEID` carries the full order id, so nothing is lost.
 */
export function txnIdFor(orderId: string): string {
  return orderId.slice(-20);
}

export interface ConnectipsValidation {
  status: string;
  statusDesc?: string;
  referenceId?: string;
  txnAmount?: string;
}

/** The only status that means the money moved. */
export const CONNECTIPS_SUCCESS = "SUCCESS";

export function isPaid(status: string): boolean {
  return status.toUpperCase() === CONNECTIPS_SUCCESS;
}

/** connectIPS reports paisa, which is what this database stores. */
export function amountMatches(reported: unknown, expectedMinorUnits: number): boolean {
  const value = Number(String(reported ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(value)) return false;
  return Math.round(value) === expectedMinorUnits;
}

export class ConnectipsError extends Error {}

/**
 * Ask connectIPS whether a transaction actually succeeded.
 *
 * Basic auth with the merchant's gateway username and password — separate
 * credentials from the signing certificate, and the reason `config` carries
 * four secrets rather than two.
 *
 * As with the other two gateways, this and not the redirect is what decides
 * whether an order is paid.
 */
export async function validate(
  config: {
    validateUrl: string;
    merchantId: string;
    appId: string;
    username: string;
    password: string;
    privateKey: KeyObject;
  },
  input: { referenceId: string; amountMinorUnits: number },
): Promise<ConnectipsValidation> {
  const fields = {
    MERCHANTID: config.merchantId,
    APPID: config.appId,
    REFERENCEID: input.referenceId,
    TXNAMT: formatAmount(input.amountMinorUnits),
  };

  const body = {
    ...fields,
    token: sign(tokenMessage(fields, VALIDATE_TOKEN_FIELDS), config.privateKey),
  };

  const response = await fetch(config.validateUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(
        `${config.username}:${config.password}`,
      ).toString("base64")}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    throw new ConnectipsError(
      `connectIPS ${response.status}: ${text.slice(0, 400)}`,
    );
  }

  try {
    return JSON.parse(text) as ConnectipsValidation;
  } catch {
    throw new ConnectipsError(
      `connectIPS returned a non-JSON body: ${text.slice(0, 200)}`,
    );
  }
}

/** Load a PEM private key. Kept here so `config` does not import crypto twice. */
export function loadPrivateKey(pem: string, passphrase?: string): KeyObject {
  return createPrivateKey(passphrase ? { key: pem, passphrase } : { key: pem });
}
