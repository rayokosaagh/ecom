"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { login, type AuthFormState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Icon } from "@/components/ui/Icon";

const INITIAL: AuthFormState = {};

/**
 * @param notice One-off confirmation from wherever the visitor arrived from —
 *   currently a completed password reset. Cleared as soon as they submit,
 *   because by then it is describing something two steps back.
 */
export function LoginForm({
  redirectTo,
  notice,
}: {
  redirectTo?: string;
  notice?: string;
}) {
  const [state, formAction, pending] = useActionState(login, INITIAL);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

      {notice && !state.message && (
        <div
          role="status"
          className="bg-tertiary-container text-on-tertiary-container flex items-start gap-3 rounded-md px-4 py-3 text-sm"
        >
          <Icon name="check_circle" size={20} className="mt-px" />
          <span>{notice}</span>
        </div>
      )}

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
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          leadingIcon="mail"
          error={state.errors?.email}
          required
        />

        <TextField
          label="Password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          leadingIcon="lock"
          trailingIcon={showPassword ? "visibility_off" : "visibility"}
          onTrailingIconClick={() => setShowPassword((v) => !v)}
          error={state.errors?.password}
          required
        />

        <p className="text-right text-sm">
          <Link
            href="/forgot-password"
            className="text-primary rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Forgot password?
          </Link>
        </p>
      </div>

      <Button type="submit" loading={pending} fullWidth className="h-11">
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-on-surface-variant text-center text-sm">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="text-primary rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}
