"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Icon } from "@/components/ui/Icon";
import { Card, CardContent } from "@/components/ui/Card";
import {
  updateNotifications,
  deleteAccount,
  type UserFormState,
} from "@/lib/actions/users";

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

export interface NotificationPreferences {
  notifyOrders: boolean;
  notifyStock: boolean;
  notifyNews: boolean;
  notifyEmails: boolean;
}

const SWITCHES: {
  name: keyof NotificationPreferences;
  label: string;
  blurb: string;
  icon: string;
}[] = [
  {
    name: "notifyOrders",
    label: "Order updates",
    blurb: "Paid, shipped, delivered and cancelled — in the app.",
    icon: "shopping_bag",
  },
  {
    name: "notifyEmails",
    label: "Order emails",
    blurb: "The same updates by email, including your receipt.",
    icon: "mail",
  },
  {
    name: "notifyStock",
    label: "Back in stock",
    blurb: "When something you were waiting for returns.",
    icon: "inventory_2",
  },
  {
    name: "notifyNews",
    label: "News and offers",
    blurb: "Sales, new arrivals and the occasional announcement.",
    icon: "campaign",
  },
];

/**
 * Which notices this account wants.
 *
 * Checkboxes rather than a fashionable toggle-switch: this is a form that
 * submits, the browser already knows what a checkbox means to a keyboard and a
 * screen reader, and nothing here is applied until Save is pressed. A switch
 * that looks instant but is not is the worst of both.
 *
 * Security notices are deliberately absent — see `PREFERENCE` in
 * `lib/notifications/service`. A password change you cannot opt out of hearing
 * about is the point of telling you.
 */
export function NotificationForm({ preferences }: { preferences: NotificationPreferences }) {
  const [state, formAction, pending] = useActionState(updateNotifications, INITIAL);

  return (
    <Card variant="outlined">
      <CardContent>
        <form action={formAction} className="space-y-5">
          <h3 className="text-on-surface text-sm font-medium">Notifications</h3>

          <Feedback state={state} />

          <fieldset className="space-y-3">
            <legend className="sr-only">What to be told about</legend>

            {SWITCHES.map((row) => (
              <label
                key={row.name}
                className="border-outline-variant hover:bg-on-surface/[0.04] flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
              >
                <input
                  type="checkbox"
                  name={row.name}
                  defaultChecked={preferences[row.name]}
                  className="accent-primary mt-0.5 size-4"
                />
                <span className="min-w-0">
                  <span className="text-on-surface flex items-center gap-1.5 text-sm font-medium">
                    <Icon name={row.icon} size={16} />
                    {row.label}
                  </span>
                  <span className="text-on-surface-variant mt-0.5 block text-xs">
                    {row.blurb}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <Button type="submit" loading={pending} icon="save">
            {pending ? "Saving…" : "Save preferences"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Close the account.
 *
 * Kept behind a disclosure rather than sitting open at the bottom of the page:
 * it is the one irreversible control here, and a destructive button that is
 * always one stray click away is a hazard, not a feature.
 *
 * Three gates, which is not excessive for something that cannot be undone — the
 * disclosure, the password, and typing the word. The password alone is filled
 * by a password manager without the owner reading a thing.
 */
export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteAccount, INITIAL);
  const [open, setOpen] = useState(false);

  return (
    <Card variant="outlined" className="border-error/40">
      <CardContent className="space-y-4">
        <div>
          <h3 className="text-error text-sm font-medium">Close your account</h3>
          <p className="text-on-surface-variant mt-1 text-sm">
            Your name, email, addresses, wishlist and reviews are deleted, and you
            will not be able to sign in again.
          </p>
          {/* Said outright rather than discovered later. A shop cannot forget
              where it sent a parcel, and pretending otherwise would be the
              dishonest version of this control. */}
          <p className="text-on-surface-variant mt-2 text-xs">
            Orders you have already placed are kept, with the delivery details
            recorded on them, because the shop has to account for its sales.
          </p>
        </div>

        <Feedback state={state} />

        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="border-error text-error state-layer inline-flex h-10 items-center gap-2 rounded-full border px-5 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
          >
            <Icon name="delete_forever" size={18} />
            Close my account
          </button>
        ) : (
          <form action={formAction} className="space-y-4" noValidate>
            <TextField
              label="Your password"
              name="password"
              type="password"
              autoComplete="current-password"
              leadingIcon="lock"
              error={state.errors?.password}
              required
            />

            <TextField
              label="Type DELETE to confirm"
              name="confirm"
              leadingIcon="warning"
              error={state.errors?.confirm}
              required
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className="bg-error text-on-error state-layer inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:opacity-60"
              >
                {pending && (
                  <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {pending ? "Closing…" : "Close my account permanently"}
              </button>

              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="text-on-surface-variant hover:text-on-surface rounded-full px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
