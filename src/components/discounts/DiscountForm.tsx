"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { saveDiscount, type DiscountActionState } from "@/lib/actions/discounts";
import { CODE_MAX } from "@/lib/discounts/validation";
import { DiscountKind } from "@/generated/prisma/enums";

export type DiscountFormValues = {
  id?: string;
  code: string;
  kind: DiscountKind;
  /** Whole percent, or an amount in major units — whichever `kind` says. */
  percent: string;
  amount: string;
  minSubtotal: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  maxRedemptions: string;
  oncePerCustomer: boolean;
  active: boolean;
};

export const BLANK_DISCOUNT: DiscountFormValues = {
  code: "",
  kind: DiscountKind.PERCENT,
  percent: "10",
  amount: "",
  minSubtotal: "",
  maxDiscount: "",
  startsAt: "",
  endsAt: "",
  maxRedemptions: "",
  oncePerCustomer: true,
  active: true,
};

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
      {error && <span className="text-error mt-1 block text-xs">{error}</span>}
    </label>
  );
}

const INPUT =
  "border-outline bg-surface text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary h-10 w-full rounded-lg border px-3 text-sm transition-colors duration-200 focus:outline-none";

/**
 * Create or edit a discount code.
 *
 * The percentage and fixed-amount fields swap rather than both being shown:
 * "20% off" and "$20 off" are wildly different offers and a form that lets you
 * fill in both invites setting one and meaning the other.
 */
export function DiscountForm({ initial }: { initial: DiscountFormValues }) {
  const [state, action, pending] = useActionState<DiscountActionState, FormData>(
    saveDiscount,
    {},
  );
  const [kind, setKind] = useState(initial.kind);

  return (
    <form action={action} className="space-y-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      {state.message && (
        <p
          role="alert"
          className="bg-error-container text-on-error-container flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
        >
          <Icon name="error" size={18} />
          {state.message}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="bg-tertiary-container text-on-tertiary-container flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
        >
          <Icon name="check_circle" size={18} />
          {state.success}
        </p>
      )}

      <Field
        label="Code"
        hint="What the shopper types. Stored uppercased."
        error={state.errors?.code}
      >
        <input
          name="code"
          defaultValue={initial.code}
          maxLength={CODE_MAX}
          placeholder="SPRING20"
          autoCapitalize="characters"
          spellCheck={false}
          className={cn(INPUT, "font-mono uppercase")}
        />
      </Field>

      <fieldset>
        <legend className="text-on-surface-variant mb-1 text-sm">Takes off</legend>
        <div className="flex flex-wrap gap-2">
          {[
            { value: DiscountKind.PERCENT, label: "A percentage" },
            { value: DiscountKind.FIXED, label: "A fixed amount" },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                "cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors duration-150",
                kind === option.value
                  ? "border-primary bg-secondary-container text-on-secondary-container"
                  : "border-outline text-on-surface-variant",
              )}
            >
              <input
                type="radio"
                name="kind"
                value={option.value}
                checked={kind === option.value}
                onChange={() => setKind(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      {kind === DiscountKind.PERCENT ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Percent off" error={state.errors?.value}>
            <input
              name="percent"
              type="number"
              min={1}
              max={100}
              defaultValue={initial.percent}
              className={INPUT}
            />
          </Field>
          <Field
            label="Most it can take off"
            hint="Optional ceiling, so a big basket cannot run away with it."
            error={state.errors?.maxDiscount}
          >
            <input
              name="maxDiscount"
              type="number"
              min={0}
              step="0.01"
              defaultValue={initial.maxDiscount}
              placeholder="No limit"
              className={INPUT}
            />
          </Field>
        </div>
      ) : (
        <Field label="Amount off" error={state.errors?.value}>
          <input
            name="amount"
            type="number"
            min={0}
            step="0.01"
            defaultValue={initial.amount}
            placeholder="10.00"
            className={INPUT}
          />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Minimum spend"
          hint="On goods, before delivery."
          error={state.errors?.minSubtotal}
        >
          <input
            name="minSubtotal"
            type="number"
            min={0}
            step="0.01"
            defaultValue={initial.minSubtotal}
            placeholder="None"
            className={INPUT}
          />
        </Field>
        <Field
          label="Total uses"
          hint="Across everyone. Blank for unlimited."
          error={state.errors?.maxRedemptions}
        >
          <input
            name="maxRedemptions"
            type="number"
            min={1}
            defaultValue={initial.maxRedemptions}
            placeholder="Unlimited"
            className={INPUT}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts" hint="Blank to start immediately." error={state.errors?.startsAt}>
          <input
            name="startsAt"
            type="datetime-local"
            defaultValue={initial.startsAt}
            className={INPUT}
          />
        </Field>
        <Field label="Ends" hint="Blank to run until switched off." error={state.errors?.endsAt}>
          <input
            name="endsAt"
            type="datetime-local"
            defaultValue={initial.endsAt}
            className={INPUT}
          />
        </Field>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="oncePerCustomer"
            defaultChecked={initial.oncePerCustomer}
            className="accent-primary size-4"
          />
          <span className="text-on-surface">One use per customer</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={initial.active}
            className="accent-primary size-4"
          />
          <span className="text-on-surface">Active</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-on-primary state-layer inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:opacity-60"
      >
        {pending && (
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {initial.id ? "Save changes" : "Create code"}
      </button>
    </form>
  );
}
