"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MAX_PERCENT_OFF, MIN_PERCENT_OFF } from "@/lib/flash/pricing";
import type { FlashSaleFormState } from "@/lib/actions/flash";

export interface FlashSaleFormValues {
  name: string;
  percentOff: string;
  /** "YYYY-MM-DDTHH:mm" in local time, which is what `datetime-local` wants. */
  startsAt: string;
  endsAt: string;
  active: boolean;
}

export const EMPTY_FLASH_SALE: FlashSaleFormValues = {
  name: "",
  percentOff: "20",
  startsAt: "",
  endsAt: "",
  active: true,
};

const INITIAL: FlashSaleFormState = {};

const INPUT =
  "border-outline bg-surface text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary h-10 w-full rounded-lg border px-3 text-sm transition-colors duration-200 focus:outline-none";

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-on-surface-variant mb-1 block text-sm">{label}</span>
      {children}
      {hint && !error && (
        <span className="text-on-surface-variant mt-1 block text-xs">{hint}</span>
      )}
      {error && (
        <span role="alert" className="text-error mt-1 block text-xs">
          {error}
        </span>
      )}
    </label>
  );
}

/**
 * The sale itself — name, discount and window. Products are chosen separately,
 * on the edit screen, because a sale has to exist before anything can be put in
 * it.
 */
export function FlashSaleForm({
  action,
  values = EMPTY_FLASH_SALE,
  submitLabel = "Save sale",
  /** Shown while the sale is running, since saving re-prices everything in it. */
  live = false,
}: {
  action: (state: FlashSaleFormState, formData: FormData) => Promise<FlashSaleFormState>;
  values?: FlashSaleFormValues;
  submitLabel?: string;
  live?: boolean;
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

      {live && (
        <div className="bg-tertiary-container text-on-tertiary-container flex items-start gap-3 rounded-md px-4 py-3 text-sm">
          <Icon name="bolt" size={20} />
          <span>
            This sale is running. Saving puts every price back to what it was,
            then re-applies the discount from the new figures.
          </span>
        </div>
      )}

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <h3 className="text-on-surface text-sm font-medium">Details</h3>

          <Field
            label="Name"
            hint="Shown as the section heading on the storefront."
            error={state.errors?.name}
          >
            <input
              name="name"
              defaultValue={values.name}
              maxLength={60}
              placeholder="Weekend flash sale"
              className={INPUT}
            />
          </Field>

          <Field
            label="Percent off"
            hint={`Applied to whatever each product costs when the sale opens. ${MIN_PERCENT_OFF}–${MAX_PERCENT_OFF}.`}
            error={state.errors?.percentOff}
          >
            <input
              name="percentOff"
              type="number"
              inputMode="numeric"
              min={MIN_PERCENT_OFF}
              max={MAX_PERCENT_OFF}
              defaultValue={values.percentOff}
              className={INPUT}
            />
          </Field>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <h3 className="text-on-surface text-sm font-medium">Window</h3>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Opens"
              hint="Prices drop on the first visit after this."
              error={state.errors?.startsAt}
            >
              <input
                name="startsAt"
                type="datetime-local"
                defaultValue={values.startsAt}
                className={INPUT}
              />
            </Field>

            <Field
              label="Closes"
              hint="Prices go back automatically."
              error={state.errors?.endsAt}
            >
              <input
                name="endsAt"
                type="datetime-local"
                defaultValue={values.endsAt}
                className={INPUT}
              />
            </Field>
          </div>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="active"
              defaultChecked={values.active}
              className="accent-primary mt-0.5 size-4"
            />
            <span className="text-sm">
              <span className="text-on-surface block">Active</span>
              {/* Spelled out because the two controls look interchangeable and
                  are not: the window is the plan, this is the switch. */}
              <span className="text-on-surface-variant block text-xs">
                Separate from the dates. Unticking pulls a running sale
                immediately and puts its prices back, without losing the window
                you set.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending} icon="save">
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link
          href="/admin/flash-sales"
          className="text-on-surface-variant state-layer inline-flex h-10 items-center rounded-full px-6 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
