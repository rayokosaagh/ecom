"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { adjustStock, type StockActionState } from "@/lib/actions/inventory";
import {
  MAX_NOTE_LENGTH,
  REASONS_FOR_ADDING,
  REASONS_FOR_REMOVING,
  REASON_LABELS,
  formatDelta,
  planAdjustment,
  type AdjustMode,
} from "@/lib/inventory/stock";
import { cn } from "@/lib/cn";

const MODES: { value: AdjustMode; label: string; hint: string }[] = [
  { value: "add", label: "Add", hint: "Units arrived" },
  { value: "remove", label: "Remove", hint: "Units gone" },
  { value: "set", label: "Set", hint: "Counted figure" },
];

/**
 * The one control on the inventory page that changes anything.
 *
 * Collapsed to a button until used, because the page is read far more often
 * than it is written and a grid of open forms is unreadable. Opening one is
 * local state rather than a route, so the filters, the scroll position and the
 * other rows survive it.
 *
 * The preview line is the point of the whole component: it runs the *same*
 * `planAdjustment` the server action runs, so "12 → 52" is not an optimistic
 * guess at what will happen — it is the calculation that will happen, shown
 * before it does. Where it refuses, it refuses here first and says why, which
 * is how "remove 40 of 12" gets fixed instead of submitted.
 *
 * What it deliberately does not do is trust its own arithmetic. The level it
 * previews from is the one the page rendered, and the shop may have sold since;
 * the action re-reads and re-plans against the current figure, and reports a
 * mismatch rather than writing this component's number.
 */
export function AdjustStock({
  productId,
  variantId,
  name,
  configuration,
  stock,
}: {
  productId: string;
  variantId: string | null;
  name: string;
  configuration: string | null;
  stock: number;
}) {
  const unitKey = variantId ? `${productId}:${variantId}` : productId;
  const label = configuration ? `${name} · ${configuration}` : name;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AdjustMode>("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<string>(REASONS_FOR_ADDING[0]);

  const fieldId = useId();
  const amountRef = useRef<HTMLInputElement>(null);

  /**
   * Collapse once the change lands, from inside the action rather than an
   * effect watching its result. The row behind the panel re-renders with the
   * new level from the server, so staying open would leave a preview computed
   * from a figure that has already moved — and a failure has to keep the panel
   * open to show why, which a blanket close-on-submit could not do.
   */
  const [state, formAction, pending] = useActionState<StockActionState, FormData>(
    async (previous, formData) => {
      const result = await adjustStock(previous, formData);
      if (result.success) {
        setOpen(false);
        setAmount("");
      }
      return result;
    },
    {},
  );

  // Only this row's outcome. Every row mounts its own form, but a stale state
  // object from a row that has since re-rendered elsewhere would otherwise show
  // someone else's message.
  const mine = state.key === unitKey ? state : null;

  useEffect(() => {
    if (open) amountRef.current?.focus();
  }, [open]);

  const typed = amount.trim();
  const parsed = typed === "" ? null : Number(typed);
  const plan =
    parsed === null || !Number.isFinite(parsed)
      ? null
      : planAdjustment(stock, mode, parsed);

  /**
   * Reasons follow the *direction of the change*, not the button pressed —
   * "set" can go either way, and which way is only known once the figure is
   * typed. Until then every reason is offered rather than none.
   */
  const reasons =
    plan?.ok === true
      ? plan.data.delta > 0
        ? REASONS_FOR_ADDING
        : REASONS_FOR_REMOVING
      : [...new Set([...REASONS_FOR_ADDING, ...REASONS_FOR_REMOVING])];

  // Controlled, and corrected rather than reset: switching from "add" to
  // "remove" with "Delivery received" selected would otherwise submit a reason
  // the direction cannot have.
  const activeReason = reasons.includes(reason as (typeof reasons)[number])
    ? reason
    : reasons[0];

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-outline text-on-surface hover:bg-on-surface/[0.06] inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="edit" size={16} />
          Adjust
          <span className="sr-only">stock for {label}</span>
        </button>

        {mine?.success && (
          <p role="status" className="text-tertiary max-w-[16rem] text-right text-xs">
            {mine.success}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="bg-surface-container-low border-outline-variant w-full min-w-0 space-y-3 rounded-lg border p-3 sm:w-[22rem]"
    >
      <input type="hidden" name="productId" value={productId} />
      {variantId && <input type="hidden" name="variantId" value={variantId} />}
      <input type="hidden" name="mode" value={mode} />

      <fieldset>
        <legend className="sr-only">How to change the stock for {label}</legend>
        <div className="border-outline-variant flex rounded-full border p-0.5">
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              aria-pressed={mode === option.value}
              title={option.hint}
              className={cn(
                "h-8 flex-1 rounded-full text-sm transition-colors duration-150 focus-visible:outline-2",
                mode === option.value
                  ? "bg-secondary-container text-on-secondary-container font-medium"
                  : "text-on-surface-variant hover:bg-on-surface/[0.06]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-2">
        <label htmlFor={`${fieldId}-amount`} className="sr-only">
          {mode === "set" ? "Counted units" : "Units"}
        </label>
        <input
          ref={amountRef}
          id={`${fieldId}-amount`}
          name="amount"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder={mode === "set" ? "Counted" : "Units"}
          className="border-outline text-on-surface placeholder:text-on-surface-variant focus:border-primary h-10 w-24 rounded-md border bg-transparent px-3 text-sm tabular-nums outline-none transition-colors duration-200"
        />

        {/* The arithmetic, before it is committed. */}
        <p
          className={cn(
            "min-w-0 flex-1 text-xs",
            plan && !plan.ok ? "text-error" : "text-on-surface-variant",
          )}
        >
          {!plan ? (
            <>Currently {stock} in stock</>
          ) : plan.ok ? (
            <span className="text-on-surface tabular-nums">
              {stock} → <strong className="font-medium">{plan.data.stock}</strong>{" "}
              <span className="text-on-surface-variant">
                ({formatDelta(plan.data.delta)})
              </span>
            </span>
          ) : (
            plan.error
          )}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${fieldId}-reason`} className="sr-only">
          Reason
        </label>
        <select
          id={`${fieldId}-reason`}
          name="reason"
          value={activeReason}
          onChange={(event) => setReason(event.target.value)}
          className="border-outline text-on-surface focus:border-primary h-10 rounded-md border bg-transparent px-3 text-sm outline-none transition-colors duration-200"
        >
          {reasons.map((value) => (
            <option key={value} value={value}>
              {REASON_LABELS[value]}
            </option>
          ))}
        </select>

        <label htmlFor={`${fieldId}-note`} className="sr-only">
          Note (optional)
        </label>
        <input
          id={`${fieldId}-note`}
          name="note"
          type="text"
          maxLength={MAX_NOTE_LENGTH}
          placeholder="Note — supplier, delivery number… (optional)"
          className="border-outline text-on-surface placeholder:text-on-surface-variant focus:border-primary h-10 rounded-md border bg-transparent px-3 text-sm outline-none transition-colors duration-200"
        />
      </div>

      {mine?.message && (
        <p role="alert" className="text-error text-xs">
          {mine.message}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-on-surface-variant rounded-sm px-2 text-sm hover:underline focus-visible:outline-2"
        >
          Cancel
        </button>
        <button
          type="submit"
          // Refused here for the reason shown above it; the action refuses it
          // again on its own account.
          disabled={pending || (plan !== null && !plan.ok)}
          className="bg-primary text-on-primary state-layer inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
