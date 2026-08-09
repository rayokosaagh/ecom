"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { resetPassword, type PasswordResetState } from "@/lib/actions/password-reset";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/validation";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Icon } from "@/components/ui/Icon";

const INITIAL: PasswordResetState = {};

/**
 * @param token Carried in a hidden field rather than read from the URL here,
 *   so the value the action receives is the one the page rendered with.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, INITIAL);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="token" value={token} />

      {state.message && (
        <div
          role="alert"
          className="bg-error-container text-on-error-container flex items-start gap-3 rounded-md px-4 py-3 text-sm"
        >
          <Icon name="error" size={20} className="mt-px" />
          <span>{state.message}</span>
        </div>
      )}

      <div className="space-y-4">
        <TextField
          label="New password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          leadingIcon="lock"
          trailingIcon={showPassword ? "visibility_off" : "visibility"}
          onTrailingIconClick={() => setShowPassword((v) => !v)}
          supportingText={`At least ${PASSWORD_MIN_LENGTH} characters`}
          error={state.errors?.password}
          required
        />

        <TextField
          label="Confirm new password"
          name="confirmPassword"
          // Both fields follow the browser's new-password affordance, so a
          // password manager offers to generate once and fill both.
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          leadingIcon="lock"
          error={state.errors?.confirmPassword}
          required
        />
      </div>

      <Button type="submit" loading={pending} fullWidth className="h-11">
        {pending ? "Saving…" : "Set new password"}
      </Button>

      <p className="text-on-surface-variant text-center text-sm">
        <Link
          href="/forgot-password"
          className="text-primary rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Request a new link
        </Link>
      </p>
    </form>
  );
}
