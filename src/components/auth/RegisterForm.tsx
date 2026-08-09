"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { register, type AuthFormState } from "@/lib/actions/auth";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/validation";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Icon } from "@/components/ui/Icon";

const INITIAL: AuthFormState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(register, INITIAL);
  const [showPassword, setShowPassword] = useState(false);

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

      <div className="space-y-4">
        <TextField
          label="Name"
          name="name"
          autoComplete="name"
          leadingIcon="person"
          error={state.errors?.name}
          required
        />

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
          autoComplete="new-password"
          leadingIcon="lock"
          trailingIcon={showPassword ? "visibility_off" : "visibility"}
          onTrailingIconClick={() => setShowPassword((v) => !v)}
          supportingText={`At least ${PASSWORD_MIN_LENGTH} characters`}
          error={state.errors?.password}
          required
        />

        <TextField
          label="Confirm password"
          name="confirmPassword"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          leadingIcon="lock_reset"
          error={state.errors?.confirmPassword}
          required
        />
      </div>

      <Button type="submit" loading={pending} fullWidth className="h-11">
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-on-surface-variant text-center text-sm">
        Already have an account?{" "}
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
