import { createHash, randomBytes } from "node:crypto";

/**
 * The rules a password-reset link is judged by.
 *
 * Deliberately free of `server-only` and of any database access, for the same
 * reason `lib/discounts/rules` is: this decides who gets to take over an
 * account, and it is worth being able to exercise it directly.
 * `npm run check:password-reset` does exactly that.
 */

/**
 * How long a link stays good.
 *
 * An hour is the usual compromise: long enough to survive a slow mail server
 * and someone reading their inbox after lunch, short enough that a link left
 * sitting in a forwarded email or a shared machine goes cold on its own.
 */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Shortest gap between two links for the same account.
 *
 * Without it, anyone who knows an address can use the form as a mail cannon
 * aimed at that person's inbox. The request still reports success while the
 * cooldown is in force — saying "we already sent one" would confirm the
 * account exists, which is precisely what the generic response is protecting.
 */
export const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;

/** Bytes of randomness in the token. 32 is well past guessing range. */
const TOKEN_BYTES = 32;

/**
 * A fresh token for the link.
 *
 * base64url so it survives being pasted into a query string without escaping.
 */
export function newResetToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * What gets stored for a token.
 *
 * SHA-256 rather than scrypt, unlike `lib/auth/password`. The reasoning is
 * opposite in the two cases: a password is low-entropy and human-chosen, so
 * hashing it has to be deliberately slow to survive an offline guessing
 * attack. This token is 32 random bytes — there is nothing to guess, and the
 * only job of the hash is to make sure a stolen database read cannot be
 * replayed as a working link. A fast digest does that perfectly, and keeps
 * redemption a single indexed lookup rather than a scan-and-compare over every
 * outstanding token.
 */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type ResetTokenVerdict = { ok: true } | { ok: false; reason: string };

/** Only the fields the decision needs, so a caller can pass its own row. */
export type RedeemableToken = {
  expiresAt: Date;
  usedAt: Date | null;
};

/**
 * Decide whether a link may still be spent.
 *
 * `null` — no row matched the hash — is judged here rather than by the caller,
 * and gets the *same* message as an expired one. Telling the two apart would
 * answer "did this token ever exist?", which is the one question someone
 * feeding guessed tokens at the form wants answered.
 */
export function judgeResetToken(
  token: RedeemableToken | null,
  now: Date,
): ResetTokenVerdict {
  const dead: ResetTokenVerdict = {
    ok: false,
    reason: "That reset link is invalid or has expired. Request a new one.",
  };

  if (!token) return dead;
  // Checked before expiry so a link that was used and has since aged out still
  // reads as spent rather than merely stale.
  if (token.usedAt) {
    return {
      ok: false,
      reason: "That reset link has already been used. Request a new one.",
    };
  }
  if (now >= token.expiresAt) return dead;

  return { ok: true };
}

/**
 * Whether a new link may be issued, given when the last one went out.
 *
 * `null` means no previous request on record.
 */
export function mayIssueResetToken(lastRequestedAt: Date | null, now: Date): boolean {
  if (!lastRequestedAt) return true;
  return now.getTime() - lastRequestedAt.getTime() >= RESET_REQUEST_COOLDOWN_MS;
}
