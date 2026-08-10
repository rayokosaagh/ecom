import "server-only";

import type { KeyObject } from "node:crypto";

import { PaymentMethod } from "@/generated/prisma/enums";
import { CONNECTIPS_URL, loadPrivateKey } from "@/lib/payments/connectips";
import { ESEWA_FORM_URL, ESEWA_STATUS_URL } from "@/lib/payments/esewa";
import { KHALTI_BASE_URL } from "@/lib/payments/khalti";

/**
 * Merchant credentials, and which environment they talk to.
 *
 * `server-only`, and the one place a secret key is read. Nothing here is ever
 * passed to a client component — the checkout form is told *whether* a gateway
 * is configured, never with what.
 *
 * Live or sandbox is chosen by an explicit variable rather than inferred from
 * `NODE_ENV`. Inferring it means a staging deploy — which is `production` to
 * Node — quietly takes real money from whoever is testing it.
 */

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/** Explicit opt-in. Anything other than "live" is the sandbox. */
function isLive(): boolean {
  return env("PAYMENTS_MODE").toLowerCase() === "live";
}

/**
 * Whether payments are pointed at the gateways' test environments.
 *
 * Exported so the payment page can *say so*. A sandbox gateway looks exactly
 * like the real one and rejects real accounts — "login failed" on eSewa's UAT
 * page is what a correct integration does when someone tries their own wallet,
 * and there is nothing on the screen to explain it. Telling them up front is
 * the difference between a two-second detour and an afternoon.
 */
export function paymentsAreSandbox(): boolean {
  return !isLive();
}

export interface KhaltiConfig {
  baseUrl: string;
  secretKey: string;
}

export interface EsewaConfig {
  formUrl: string;
  statusUrl: string;
  productCode: string;
  secret: string;
}

/**
 * Khalti's configuration, or null when it has none.
 *
 * Null rather than throwing: an unconfigured gateway is a shop that has not
 * signed up yet, which is an ordinary state, and `paymentUnavailable` turns it
 * into a button that is simply not offered.
 */
export function khaltiConfig(): KhaltiConfig | null {
  const secretKey = env("KHALTI_SECRET_KEY");
  if (!secretKey) return null;

  return {
    baseUrl: isLive() ? KHALTI_BASE_URL.live : KHALTI_BASE_URL.sandbox,
    secretKey,
  };
}

/**
 * eSewa's configuration, or null when it has none.
 *
 * The sandbox defaults are eSewa's own published test merchant, so collection
 * works out of the box in development with nothing in `.env`. They are only
 * ever used in sandbox mode — going live without setting both is a
 * configuration error, and returning null is what stops it silently signing
 * real payments with a public key.
 */
export function esewaConfig(): EsewaConfig | null {
  const live = isLive();

  const productCode = env("ESEWA_PRODUCT_CODE") || (live ? "" : "EPAYTEST");
  const secret = env("ESEWA_SECRET_KEY") || (live ? "" : "8gBm/:&EnhH.1/q");

  if (!productCode || !secret) return null;

  return {
    formUrl: live ? ESEWA_FORM_URL.live : ESEWA_FORM_URL.sandbox,
    statusUrl: live ? ESEWA_STATUS_URL.live : ESEWA_STATUS_URL.sandbox,
    productCode,
    secret,
  };
}

export interface ConnectipsConfig {
  gatewayUrl: string;
  validateUrl: string;
  merchantId: string;
  appId: string;
  appName: string;
  username: string;
  password: string;
  privateKey: KeyObject;
}

/**
 * connectIPS's configuration, or null when it has none.
 *
 * Six values, and all six are required — there is no sandbox default to fall
 * back on the way eSewa has. NCHL issues the certificate and credentials during
 * merchant onboarding, and there is no self-serve test merchant, so a shop that
 * has not onboarded simply does not see the option.
 *
 * The key arrives as PEM in an environment variable rather than as a path to
 * the `.pfx`. Two reasons: a deploy target may have no writable filesystem to
 * put a certificate on, and Node cannot read a PKCS#12 private key directly
 * anyway. Convert once, at setup:
 *
 *   openssl pkcs12 -in CREDITOR.pfx -nocerts -nodes -out creditor.pem
 *
 * A malformed key returns null rather than throwing. An unparseable certificate
 * is a misconfiguration, and the shop losing one payment button is a better
 * failure than every checkout render crashing.
 */
export function connectipsConfig(): ConnectipsConfig | null {
  const merchantId = env("CONNECTIPS_MERCHANT_ID");
  const appId = env("CONNECTIPS_APP_ID");
  const appName = env("CONNECTIPS_APP_NAME");
  const username = env("CONNECTIPS_USERNAME");
  const password = env("CONNECTIPS_PASSWORD");
  // Newlines survive .env quoting badly, so \n is accepted as an escape.
  const pem = env("CONNECTIPS_PRIVATE_KEY").replace(/\\n/g, "\n");

  if (!merchantId || !appId || !appName || !username || !password || !pem) {
    return null;
  }

  let privateKey: KeyObject;
  try {
    privateKey = loadPrivateKey(pem, env("CONNECTIPS_KEY_PASSPHRASE") || undefined);
  } catch (error) {
    console.error("[connectips] private key could not be loaded", error);
    return null;
  }

  const live = isLive();

  return {
    gatewayUrl: live ? CONNECTIPS_URL.gateway.live : CONNECTIPS_URL.gateway.sandbox,
    validateUrl: live ? CONNECTIPS_URL.validate.live : CONNECTIPS_URL.validate.sandbox,
    merchantId,
    appId,
    appName,
    username,
    password,
    privateKey,
  };
}

/** Whether one method has what it needs to be offered at checkout. */
export function paymentConfigured(method: PaymentMethod): boolean {
  switch (method) {
    case PaymentMethod.KHALTI:
      return khaltiConfig() !== null;
    case PaymentMethod.ESEWA:
      return esewaConfig() !== null;
    case PaymentMethod.CONNECTIPS:
      return connectipsConfig() !== null;
    case PaymentMethod.COD:
      // Nothing to configure — the shop collects it.
      return true;
  }
}
