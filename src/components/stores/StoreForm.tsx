"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import { TextArea } from "@/components/ui/TextArea";
import {
  MAX_ADDRESS_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_HOURS_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PHONE_LENGTH,
} from "@/lib/stores/validation";
import type { StoreLocationFormState } from "@/lib/actions/stores";

export interface StoreFormValues {
  name: string;
  address: string;
  description: string;
  phone: string;
  hours: string;
  latitude: string;
  longitude: string;
  published: boolean;
}

const INITIAL: StoreLocationFormState = {};

/**
 * Create or edit one branch.
 *
 * The action is passed in already bound to an id where there is one, so this
 * component never needs to know which of the two it is doing — the same shape
 * the FAQ and banner forms use.
 *
 * Coordinates are strings here rather than numbers, deliberately: a controlled
 * number field that coerces as you type cannot hold "27." on the way to
 * "27.7172", and the parser on the server is the one place that should decide
 * what is a valid coordinate.
 */
export function StoreForm({
  action,
  values,
  submitLabel,
}: {
  action: (
    state: StoreLocationFormState,
    formData: FormData,
  ) => Promise<StoreLocationFormState>;
  values: StoreFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

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

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <TextField
            label="Store name"
            name="name"
            defaultValue={values.name}
            maxLength={MAX_NAME_LENGTH}
            supportingText="How the branch is known — “Kathmandu · New Road”."
            error={state.errors?.name}
            required
          />

          <TextArea
            label="Address"
            name="address"
            rows={4}
            defaultValue={values.address}
            maxLength={MAX_ADDRESS_LENGTH}
            supportingText="One line per line of the address. Also what the map searches for when no coordinates are given."
            error={state.errors?.address}
            required
          />

          <TextArea
            label="Description"
            name="description"
            rows={3}
            defaultValue={values.description}
            maxLength={MAX_DESCRIPTION_LENGTH}
            supportingText="Optional. A sentence about what is here or what it is near."
            error={state.errors?.description}
          />

          <TextField
            label="Phone number"
            name="phone"
            type="tel"
            defaultValue={values.phone}
            maxLength={MAX_PHONE_LENGTH}
            supportingText="Optional. Shown exactly as typed and made tappable."
            error={state.errors?.phone}
          />

          <TextArea
            label="Opening hours"
            name="hours"
            rows={7}
            defaultValue={values.hours}
            maxLength={MAX_HOURS_LENGTH}
            // Spelled out because the layout depends on it, and an admin has no
            // other way to discover that the colon is what makes two columns.
            supportingText="Optional. One line per day, as “Sun–Fri: 10:00 – 19:00”. Text before the first colon becomes the left column; a line with no colon runs full width."
            error={state.errors?.hours}
          />
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <div>
            <h3 className="text-on-surface text-sm font-medium">Map pin</h3>
            <p className="text-on-surface-variant mt-1 text-sm">
              Optional, and only worth filling in when the address alone lands
              in the wrong place. Right-click the spot in Google Maps and choose
              the coordinates it offers to copy. Fill in both or neither.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Latitude"
              name="latitude"
              inputMode="decimal"
              defaultValue={values.latitude}
              supportingText="−90 to 90"
              error={state.errors?.latitude}
            />
            <TextField
              label="Longitude"
              name="longitude"
              inputMode="decimal"
              defaultValue={values.longitude}
              supportingText="−180 to 180"
              error={state.errors?.longitude}
            />
          </div>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          {/* An unchecked box submits nothing at all, which is exactly how the
              parser reads "not published". */}
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="published"
              defaultChecked={values.published}
              className="accent-primary size-4"
            />
            <span className="text-on-surface text-sm">
              Published
              <span className="text-on-surface-variant block text-xs">
                Unpublished branches stay here but are hidden on the Stores page.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link
          href="/admin/stores"
          className="text-on-surface-variant rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
