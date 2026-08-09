"use client";

import { useActionState } from "react";
import Link from "next/link";

import {
  requestPasswordReset,
  type PasswordResetState,
} from "@/lib/actions/password-reset";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Icon } from "@/components/ui/Icon";

const INITIAL: PasswordResetState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, INITIAL);

  /**
   * The form is replaced by the confirmation rather than sitting under it.
   *
   * Leaving a submit button next to "a link is on its way" invites a second
   * press, and the second press does nothing visible — the cooldown in
   * `reset-rules` silently declines it, because saying so would confirm the
   * address has an account.
   */
  if (state.success) {
    return (
      <div className="space-y-6">
        <div
          role="status"
          className="bg-tertiary-container text-on-tertiary-container flex items-start gap-3 rounded-md px-4 py-3 text-sm"
        >
          <Icon name="mark_email_read" size={20} className="mt-px" />
          <span>{state.success}</span>
        </div>

        <p className="text-on-surface-variant text-center text-sm">
          <Link
            href="/login"
            className="text-primary rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.message && (
        <div
          role="alert"
          className="bg-error-container text-on-error-container flex items-start gap-3 rounded-md px-4 py-3 text-sm"
        >
          <Icon name="error" size={20} className="mt-px" />
          <span>{state.message}</span>
        </div>
      )}

      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        leadingIcon="mail"
        error={state.errors?.email}
        supportingText="We will send a link to this address if it has an account."
        required
      />

      <Button type="submit" loading={pending} fullWidth className="h-11">
        {pending ? "Sending…" : "Send reset link"}
      </Button>

      <p className="text-on-surface-variant text-center text-sm">
        Remembered it?{" "}
        <Link
          href="/login"
          className="text-primary rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
