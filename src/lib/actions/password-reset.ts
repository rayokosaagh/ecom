"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";

import { parsePasswordReset, parseResetRequest } from "@/lib/auth/validation";
import { issuePasswordReset, redeemPasswordReset } from "@/lib/auth/reset";

export type PasswordResetState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
};

/**
 * The one answer the request form ever gives.
 *
 * Identical whether the address has an account, is unknown, or belongs to
 * someone who asked a moment ago and is still inside the cooldown. A form that
 * says "no account with that address" is a free membership oracle: feed it a
 * breach dump and it sorts the list into customers and non-customers.
 */
const SENT_MESSAGE =
  "If that address has an account, a reset link is on its way. It expires in an hour — check your spam folder if it does not arrive.";

export async function requestPasswordReset(
  _prev: PasswordResetState,
  formData: FormData,
): Promise<PasswordResetState> {
  const parsed = parseResetRequest(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  /**
   * Deferred until after the response, which does two jobs.
   *
   * The visitor is not left watching a spinner while a mail provider takes its
   * time — but more importantly, it closes the timing channel the generic
   * message above would otherwise leave open. Looking up a user, minting a
   * token and posting to an API takes measurably longer than discovering there
   * is no such address; identical wording that arrives 300ms later for real
   * customers still answers the question. Doing the work after the response
   * means every request returns in the same breath.
   */
  after(async () => {
    try {
      await issuePasswordReset(parsed.data.email);
    } catch (error) {
      // Nothing to tell the visitor — they have already been answered, and the
      // answer would be the same either way. This is for whoever reads the logs.
      console.error("[password-reset] could not issue a link", error);
    }
  });

  return { success: SENT_MESSAGE };
}

/**
 * Set the new password and spend the link.
 *
 * On success it redirects rather than reporting inline: the form's token is
 * now dead, so leaving the visitor on a page whose only action cannot be
 * repeated is a trap. Signing them in automatically would be the other option,
 * and is deliberately not taken — proving control of a mailbox is grounds for
 * setting a password, and asking them to use it once confirms it landed.
 */
export async function resetPassword(
  _prev: PasswordResetState,
  formData: FormData,
): Promise<PasswordResetState> {
  const parsed = parsePasswordReset(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const verdict = await redeemPasswordReset(parsed.data.token, parsed.data.password);
  if (!verdict.ok) return { message: verdict.reason };

  redirect("/login?reset=1");
}
