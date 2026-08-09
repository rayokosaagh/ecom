"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";
import { Card, CardContent } from "@/components/ui/Card";
import type { UserFormState } from "@/lib/actions/users";

const INITIAL: UserFormState = {};

export function AdminUserForm({
  action,
  user,
  isSelf,
}: {
  action: (state: UserFormState, formData: FormData) => Promise<UserFormState>;
  user: {
    name: string | null;
    email: string;
    image: string | null;
    role: string;
  };
  isSelf: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.message && (
        <div
          role="alert"
          className="bg-error-container text-on-error-container flex items-start gap-3 rounded-md px-4 py-3 text-sm"
        >
          <Icon name="error" size={20} />
          <span>{state.message}</span>
        </div>
      )}

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <h3 className="text-on-surface text-sm font-medium">Account</h3>

          <TextField
            label="Name"
            name="name"
            defaultValue={user.name ?? ""}
            leadingIcon="person"
            error={state.errors?.name}
            required
          />

          <TextField
            label="Email"
            name="email"
            type="email"
            defaultValue={user.email}
            leadingIcon="mail"
            error={state.errors?.email}
            required
          />

          <TextField
            label="Avatar image URL"
            name="image"
            type="url"
            defaultValue={user.image ?? ""}
            leadingIcon="image"
            error={state.errors?.image}
          />
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <h3 className="text-on-surface text-sm font-medium">Permissions</h3>

          <Select
            label="Role"
            name="role"
            defaultValue={user.role}
            disabled={isSelf}
            options={[
              { value: "USER", label: "User" },
              { value: "ADMIN", label: "Administrator" },
            ]}
            error={state.errors?.role}
            supportingText={
              isSelf
                ? "You cannot change your own role — it would risk locking yourself out."
                : "Administrators can manage all products and users."
            }
          />
          {/* Disabled inputs are not submitted, so preserve the value. */}
          {isSelf && <input type="hidden" name="role" value={user.role} />}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <h3 className="text-on-surface text-sm font-medium">Reset password</h3>

          <TextField
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            leadingIcon="lock_reset"
            supportingText="Leave blank to keep the current password"
            error={state.errors?.newPassword}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending} icon="save">
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Link
          href="/dashboard/users"
          className="text-on-surface-variant state-layer inline-flex h-10 items-center rounded-full px-6 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
