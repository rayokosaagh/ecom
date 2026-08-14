"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import { TextArea } from "@/components/ui/TextArea";
import {
  MAX_NOTE_LENGTH,
  MAX_PICKUP_ADDRESS_LENGTH,
} from "@/lib/settings/validation";
import {
  updateStoreSettings,
  type StoreSettingsFormState,
} from "@/lib/actions/settings";

export interface StoreSettingsFormValues {
  whatsappNumber: string;
  whatsappEnabled: boolean;
  whatsappNote: string;
  pickupEnabled: boolean;
  pickupAddress: string;
  pickupHours: string;
  pickupNote: string;
}

const INITIAL: StoreSettingsFormState = {};

export function StoreSettingsForm({
  values,
  /** Set when no number is stored and one is coming from the environment. */
  envFallbackNumber,
}: {
  values: StoreSettingsFormValues;
  envFallbackNumber?: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateStoreSettings, INITIAL);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.success && (
        <div
          role="status"
          className="bg-tertiary-container text-on-tertiary-container flex items-center gap-3 rounded-md px-4 py-3 text-sm"
        >
          <Icon name="check_circle" size={20} />
          <span>{state.success}</span>
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

      <Card variant="outlined">
        <CardContent className="space-y-5">
          {/* Said plainly rather than left to be discovered: a number in the
              environment and an empty field here look identical from the form,
              and an admin would reasonably read the blank as "no number". */}
          {envFallbackNumber && (
            <p className="bg-surface-container-highest text-on-surface-variant rounded-md px-4 py-3 text-sm">
              A number is currently coming from the{" "}
              <code className="text-on-surface">WHATSAPP_NUMBER</code> environment
              variable: <strong className="text-on-surface">{envFallbackNumber}</strong>.
              Anything saved here replaces it.
            </p>
          )}

          <TextField
            label="WhatsApp number"
            name="whatsappNumber"
            type="tel"
            inputMode="tel"
            defaultValue={values.whatsappNumber}
            leadingIcon="chat"
            supportingText="Full international form, e.g. +44 7911 123456. Spaces and brackets are fine. Leave empty to turn the buttons off."
            error={state.errors?.whatsappNumber}
          />

          <TextField
            label="Availability note"
            name="whatsappNote"
            defaultValue={values.whatsappNote}
            maxLength={MAX_NOTE_LENGTH}
            leadingIcon="schedule"
            supportingText="Optional, shown under the button — e.g. “Mon–Fri, 9am–6pm” or “Typically replies within an hour”."
            error={state.errors?.whatsappNote}
          />

          {/* An unchecked box submits nothing at all, which is exactly how the
              parser reads "off". */}
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="whatsappEnabled"
              defaultChecked={values.whatsappEnabled}
              className="accent-primary size-4"
            />
            <span className="text-on-surface text-sm">
              Show WhatsApp buttons
              <span className="text-on-surface-variant block text-xs">
                Turns them off everywhere without losing the number.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <div>
            <h3 className="text-on-surface text-sm font-medium">Store pickup</h3>
            <p className="text-on-surface-variant mt-1 text-xs">
              Lets shoppers choose to collect at checkout instead of paying for
              delivery. Collection is always free, and no address is asked for —
              only who is coming.
            </p>
          </div>

          <TextArea
            label="Collect from"
            name="pickupAddress"
            rows={4}
            defaultValue={values.pickupAddress}
            maxLength={MAX_PICKUP_ADDRESS_LENGTH}
            supportingText="Written as you would give it to someone walking there. Line breaks are kept."
            error={state.errors?.pickupAddress}
          />

          <TextField
            label="Opening hours"
            name="pickupHours"
            defaultValue={values.pickupHours}
            maxLength={MAX_NOTE_LENGTH}
            supportingText="Optional — e.g. Sun–Fri, 10am–7pm"
            error={state.errors?.pickupHours}
          />

          <TextField
            label="What to bring"
            name="pickupNote"
            defaultValue={values.pickupNote}
            maxLength={MAX_NOTE_LENGTH}
            supportingText="Optional — shown before the order is placed, e.g. bring your order number"
            error={state.errors?.pickupNote}
          />

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="pickupEnabled"
              defaultChecked={values.pickupEnabled}
              className="accent-primary size-4"
            />
            <span className="text-on-surface text-sm">
              Offer collection at checkout
              <span className="text-on-surface-variant block text-xs">
                Needs an address above. Turns off without losing what is typed.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      {/* The home page's opening arrangement was a setting here — a checkbox
          and two wireframes choosing between the combined hero and the stacked
          one it replaced. The stacked layout has been taken out of the
          storefront, so the choice no longer has a second position to offer. */}

      <Button type="submit" loading={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
