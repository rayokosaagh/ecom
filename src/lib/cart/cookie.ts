import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

/**
 * The handle that identifies a guest's cart.
 *
 * Deliberately free of any dependency on the session layer: the sign-in event
 * needs to read and clear this cookie, and routing that through the module
 * that resolves the current user would make `auth.ts` import itself.
 */

export const CART_COOKIE = "ecom.cart";

/** Long enough that a cart survives a few days of thinking about it. */
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function newCartToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function readCartToken(): Promise<string | null> {
  return (await cookies()).get(CART_COOKIE)?.value ?? null;
}

/**
 * `httpOnly` because nothing on the client has any reason to read this, and a
 * token scripts can read is a token an injected script can steal a cart with.
 * `sameSite: lax` so it survives a normal navigation back from an external
 * sign-in but is not sent on cross-site POSTs.
 *
 * Only callable where Next allows a response cookie to be written — a Server
 * Action or Route Handler, never during a page render.
 */
export async function writeCartToken(token: string): Promise<void> {
  (await cookies()).set(CART_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Drop the cookie once its cart has been claimed by an account. */
export async function clearCartToken(): Promise<void> {
  (await cookies()).delete(CART_COOKIE);
}
