"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Icon } from "@/components/ui/Icon";
import { Card, CardContent } from "@/components/ui/Card";
import { AvatarField } from "@/components/users/AvatarField";
import { updateProfile, changePassword, type UserFormState } from "@/lib/actions/users";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/validation";

const INITIAL: UserFormState = {};

function Feedback({ state }: { state: UserFormState }) {
  if (state.success) {
    return (
      <div
        role="status"
        className="bg-tertiary-container text-on-tertiary-container flex items-center gap-3 rounded-md px-4 py-3 text-sm"
      >
        <Icon name="check_circle" size={20} />
        <span>{state.success}</span>
      </div>
    );
  }
  if (state.message) {
    return (
      <div
        role="alert"
        className="bg-error-container text-on-error-container flex items-center gap-3 rounded-md px-4 py-3 text-sm"
      >
        <Icon name="error" size={20} />
        <span>{state.message}</span>
      </div>
    );
  }
  return null;
}

export function ProfileDetailsForm({
  user,
}: {
  user: { name: string | null; email: string; image: string | null };
}) {
  const [state, formAction, pending] = useActionState(updateProfile, INITIAL);

  // The picture is state rather than an uncontrolled input because uploading
  // has to redraw the preview immediately — the value arrives from the server
  // action, not from anything the user typed.
  const [image, setImage] = useState(user.image ?? "");

  const initial = (user.name ?? user.email).charAt(0).toUpperCase();

  return (
    <Card variant="outlined">
      <CardContent>
        <form action={formAction} className="space-y-5" noValidate>
          <h3 className="text-on-surface text-sm font-medium">Your details</h3>

          <Feedback state={state} />

          <AvatarField
            name="image"
            value={image}
            onChange={setImage}
            fallback={initial}
            error={state.errors?.image}
          />

          <TextField
            label="Name"
            name="name"
            defaultValue={user.name ?? ""}
            leadingIcon="person"
            autoComplete="name"
            error={state.errors?.name}
            required
          />

          <TextField
            label="Email"
            name="email"
            type="email"
            defaultValue={user.email}
            leadingIcon="mail"
            autoComplete="email"
            error={state.errors?.email}
            required
          />

          <Button type="submit" loading={pending} icon="save">
            {pending ? "Saving…" : "Save details"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, INITIAL);

  return (
    <Card variant="outlined">
      <CardContent>
        <form action={formAction} className="space-y-5" noValidate>
          <h3 className="text-on-surface text-sm font-medium">Change password</h3>

          <Feedback state={state} />

          <TextField
            label="Current password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            leadingIcon="lock"
            error={state.errors?.currentPassword}
            required
          />

          <TextField
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            leadingIcon="lock_reset"
            supportingText={`At least ${PASSWORD_MIN_LENGTH} characters`}
            error={state.errors?.newPassword}
            required
          />

          <TextField
            label="Confirm new password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            leadingIcon="lock_reset"
            error={state.errors?.confirmPassword}
            required
          />

          <Button type="submit" loading={pending} icon="key">
            {pending ? "Updating…" : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
