"use client";

import { useActionState, useId, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { setReorderPoint, type StockActionState } from "@/lib/actions/inventory";
import { LOW_STOCK_THRESHOLD, MAX_NOTE_LENGTH } from "@/lib/inventory/stock";
import { cn } from "@/lib/cn";

/**
 * A line's own low-stock mark and reorder note, shown under its stock level.
 *
 * Collapsed to one quiet line — "Low at 5 · Acme, 2 weeks" — because most
 * lines use the shop default and never touch this. Opened, it is two fields:
 * the count at or below which this line counts as low (blank = the default),
 * and free text for whoever reorders. Saving is a setting, not a stock
 * movement: no ledger row, no reason, and the level itself is untouched.
 */
export function ReorderPoint({
  productId,
  variantId,
  name,
  configuration,
  lowStockAt,
  reorderNote,
}: {
  productId: string;
  variantId: string | null;
  name: string;
  configuration: string | null;
  lowStockAt: number | null;
  reorderNote: string | null;
}) {
  const unitKey = variantId ? `${productId}:${variantId}` : productId;
  const label = configuration ? `${name} · ${configuration}` : name;
  const [open, setOpen] = useState(false);
  const fieldId = useId();

  const [state, formAction, pending] = useActionState<StockActionState, FormData>(
    async (previous, formData) => {
      const result = await setReorderPoint(previous, formData);
      if (result.success) setOpen(false);
      return result;
    },
    {},
  );
  const mine = state.key === unitKey ? state : null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Change this line's low-stock mark or reorder note"
        className="text-on-surface-variant mt-1 inline-flex max-w-[14rem] items-center gap-1 rounded-sm text-left text-xs hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Icon name="tune" size={13} />
        <span className="truncate">
          Low at {lowStockAt ?? LOW_STOCK_THRESHOLD}
          {lowStockAt === null && <span className="opacity-70"> (default)</span>}
          {reorderNote && <> · {reorderNote}</>}
        </span>
        <span className="sr-only"> — change for {label}</span>
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="bg-surface-container-low border-outline-variant mt-1 w-[16rem] space-y-2 rounded-lg border p-3"
    >
      <input type="hidden" name="productId" value={productId} />
      {variantId && <input type="hidden" name="variantId" value={variantId} />}

      <div className="flex items-center gap-2">
        <label htmlFor={`${fieldId}-low`} className="text-on-surface w-16 shrink-0 text-xs">
          Low at
        </label>
        <input
          id={`${fieldId}-low`}
          name="lowStockAt"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          defaultValue={lowStockAt ?? ""}
          placeholder={`${LOW_STOCK_THRESHOLD} (default)`}
          className="border-outline text-on-surface placeholder:text-on-surface-variant focus:border-primary h-9 w-full rounded-md border bg-transparent px-2 text-sm tabular-nums outline-none"
        />
      </div>
      <p className="text-on-surface-variant text-xs">
        At or below this count the line is flagged low and admins are told. Leave blank for
        the shop default.
      </p>

      <div className="flex items-center gap-2">
        <label htmlFor={`${fieldId}-note`} className="text-on-surface w-16 shrink-0 text-xs">
          Reorder
        </label>
        <input
          id={`${fieldId}-note`}
          name="reorderNote"
          type="text"
          maxLength={MAX_NOTE_LENGTH}
          defaultValue={reorderNote ?? ""}
          placeholder="Supplier, lead time, order code…"
          className="border-outline text-on-surface placeholder:text-on-surface-variant focus:border-primary h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none"
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
          className="text-on-surface-variant rounded-sm px-2 text-xs hover:underline focus-visible:outline-2"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className={cn(
            "bg-primary text-on-primary inline-flex h-8 items-center rounded-full px-3 text-xs font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
