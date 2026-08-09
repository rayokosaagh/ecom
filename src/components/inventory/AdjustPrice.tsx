"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { adjustPrice, type StockActionState } from "@/lib/actions/inventory";
import {
  MAX_NOTE_LENGTH,
  parsePriceInput,
  planPriceChange,
  priceDeltaSign,
} from "@/lib/inventory/price";
import { formatPrice } from "@/lib/products/format";
import { cn } from "@/lib/cn";

/**
 * The price control on the inventory page.
 *
 * Deliberately the same component as `AdjustStock` in every way that is not
 * about money: collapsed to a button until used, local state rather than a
 * route so the filters and scroll position survive it, and a preview line
 * driven by the *same* `planPriceChange` the server action runs — so what the
 * panel shows is the calculation that will happen rather than a guess at it.
 *
 * Where it differs is what it refuses. Stock only has to reason about itself; a
 * price has two other things holding it. Both refusals appear here, before the
 * button is pressed, so the reason arrives while the admin can still act on it:
 *
 *  - A live flash sale is written straight into the price column and puts it
 *    back on close. The panel does not open at all in that case — offering a
 *    field that cannot be saved is worse than saying why up front.
 *  - A standing "was" price has to stay above the price. Raising past it is
 *    caught as it is typed.
 *
 * A note but no reason dropdown, matching `PriceChange` — see the model's own
 * comment on why the two ledgers are asymmetric.
 */
export function AdjustPrice({
  productId,
  variantId,
  name,
  configuration,
  priceCents,
  compareAtPriceCents,
  flashSaleName,
}: {
  productId: string;
  variantId: string | null;
  name: string;
  configuration: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  /** The flash sale holding this product's price, if one is live. */
  flashSaleName: string | null;
}) {
  const unitKey = variantId ? `${productId}:${variantId}` : productId;
  const label = configuration ? `${name} · ${configuration}` : name;

  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");

  const fieldId = useId();
  const priceRef = useRef<HTMLInputElement>(null);

  // Collapse once the change lands, from inside the action rather than an
  // effect watching its result — see the note on AdjustStock, which this
  // mirrors exactly.
  const [state, formAction, pending] = useActionState<StockActionState, FormData>(
    async (previous, formData) => {
      const result = await adjustPrice(previous, formData);
      if (result.success) {
        setOpen(false);
        setPrice("");
      }
      return result;
    },
    {},
  );

  // Only this row's outcome. Every row mounts its own form, and a stale state
  // object would otherwise show someone else's message.
  const mine = state.key === unitKey ? state : null;

  useEffect(() => {
    if (open) priceRef.current?.focus();
  }, [open]);

  const typed = price.trim();
  const parsed = typed === "" ? null : parsePriceInput(typed);
  const plan =
    parsed === null
      ? null
      : parsed.ok
        ? planPriceChange(
            {
              currentCents: priceCents,
              compareAtCents: compareAtPriceCents,
              inLiveFlashSale: flashSaleName !== null,
              flashSaleName,
            },
            parsed.cents,
          )
        : { ok: false as const, error: parsed.error };

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          // Not disabled: a disabled control with no explanation is a dead end,
          // and the panel's whole job in this case is to carry the explanation.
          className="border-outline text-on-surface hover:bg-on-surface/[0.06] inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="sell" size={16} />
          Reprice
          <span className="sr-only">{label}</span>
        </button>

        {mine?.success && (
          <p role="status" className="text-tertiary max-w-[16rem] text-right text-xs">
            {mine.success}
          </p>
        )}
      </div>
    );
  }

  // A flash sale owns the column. There is nothing useful to offer, so the
  // panel is the explanation and a way out rather than a form.
  if (flashSaleName) {
    return (
      <div className="bg-surface-container-low border-outline-variant w-full min-w-0 space-y-3 rounded-lg border p-3 sm:w-[22rem]">
        <p className="text-on-surface flex items-start gap-2 text-xs">
          <Icon name="bolt" size={16} className="text-tertiary mt-px shrink-0" />
          <span>
            <strong className="font-medium">{flashSaleName}</strong> is holding
            this price until it ends. Changing it here would stop the price going
            back when the sale closes — edit the sale instead.
          </span>
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-on-surface-variant rounded-sm px-2 text-sm hover:underline focus-visible:outline-2"
          >
            Close
          </button>
          <a
            href="/admin/flash-sales"
            className="border-outline text-on-surface hover:bg-on-surface/[0.06] inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Flash sales
            <Icon name="arrow_forward" size={16} />
          </a>
        </div>
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

      <div className="flex items-center gap-2">
        <label htmlFor={`${fieldId}-price`} className="sr-only">
          New price for {label}
        </label>
        <input
          ref={priceRef}
          id={`${fieldId}-price`}
          name="price"
          type="text"
          // Not `type="number"`: a price is typed with grouping separators
          // pasted in from the table above, and a number input silently
          // discards the whole value rather than letting the parser strip them.
          inputMode="decimal"
          required
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          placeholder="New price"
          className="border-outline text-on-surface placeholder:text-on-surface-variant focus:border-primary h-10 w-28 rounded-md border bg-transparent px-3 text-sm tabular-nums outline-none transition-colors duration-200"
        />

        {/* The change, before it is committed. */}
        <p
          className={cn(
            "min-w-0 flex-1 text-xs",
            plan && !plan.ok ? "text-error" : "text-on-surface-variant",
          )}
        >
          {!plan ? (
            <>
              Currently {formatPrice(priceCents)}
              {compareAtPriceCents !== null && (
                <> · was {formatPrice(compareAtPriceCents)}</>
              )}
            </>
          ) : plan.ok ? (
            <span className="text-on-surface tabular-nums">
              {formatPrice(priceCents)} →{" "}
              <strong className="font-medium">{formatPrice(plan.data.toCents)}</strong>{" "}
              <span className="text-on-surface-variant">
                ({priceDeltaSign(plan.data.deltaCents)}
                {formatPrice(Math.abs(plan.data.deltaCents))})
              </span>
            </span>
          ) : (
            plan.error
          )}
        </p>
      </div>

      <label htmlFor={`${fieldId}-note`} className="sr-only">
        Note (optional)
      </label>
      <input
        id={`${fieldId}-note`}
        name="note"
        type="text"
        maxLength={MAX_NOTE_LENGTH}
        placeholder="Note — supplier cost, competitor… (optional)"
        className="border-outline text-on-surface placeholder:text-on-surface-variant focus:border-primary h-10 w-full rounded-md border bg-transparent px-3 text-sm outline-none transition-colors duration-200"
      />

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
