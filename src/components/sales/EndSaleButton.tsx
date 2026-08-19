"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { adjustPrice, type StockActionState } from "@/lib/actions/inventory";
import { centsToInput, formatPrice } from "@/lib/products/format";

/**
 * Take one line off sale, in two clicks.
 *
 * Confirmed rather than immediate, because what happens to the price is the
 * whole question. By default the price goes back to the regular price — that
 * is what "the sale is over" means to nearly everyone — and the confirmation
 * says the figure. Unticking the box removes the regular price and leaves the
 * price where it is, for the shop that meant the markdown to stick.
 *
 * Posts to the same `adjustPrice` action the price panel uses — a blank
 * regular price, plus the regular price as the new price when the box is
 * ticked — so the change is judged by the same rules,
 * guarded by the same conditional update and written to the same ledger as a
 * sale ended from the panel. A one-click shortcut that wrote the column
 * directly would be the one sale change history could not see.
 */
export function EndSaleButton({
  productId,
  variantId,
  name,
  configuration,
  priceCents,
  compareAtPriceCents,
}: {
  productId: string;
  variantId: string | null;
  name: string;
  configuration: string | null;
  priceCents: number;
  /** The regular price the price can go back to. */
  compareAtPriceCents: number | null;
}) {
  const unitKey = variantId ? `${productId}:${variantId}` : productId;
  const label = configuration ? `${name} · ${configuration}` : name;
  const [confirming, setConfirming] = useState(false);
  const canRestore = compareAtPriceCents !== null && compareAtPriceCents > priceCents;
  const [restore, setRestore] = useState(true);

  const [state, formAction, pending] = useActionState<StockActionState, FormData>(
    async (previous, formData) => {
      const result = await adjustPrice(previous, formData);
      if (result.success) setConfirming(false);
      return result;
    },
    {},
  );
  const mine = state.key === unitKey ? state : null;

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="border-outline text-on-surface hover:bg-on-surface/[0.06] inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="sell" size={16} />
          End sale
          <span className="sr-only"> — {label}</span>
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
      className="bg-surface-container-low border-outline-variant w-full min-w-0 space-y-2 rounded-lg border p-3 sm:w-[22rem]"
    >
      <input type="hidden" name="productId" value={productId} />
      {variantId && <input type="hidden" name="variantId" value={variantId} />}
      {/* Blank regular price = not on sale. The price is posted only when it
          should go back up; left out, it stays where it is. */}
      <input type="hidden" name="compareAt" value="" />
      <input
        type="hidden"
        name="price"
        value={restore && canRestore ? centsToInput(compareAtPriceCents!) : ""}
      />
      <input
        type="hidden"
        name="note"
        value={
          restore && canRestore
            ? "Sale ended from the Sales page; price back to the regular price"
            : "Sale ended from the Sales page; price kept"
        }
      />

      <p className="text-on-surface text-xs">
        End the sale on <strong className="font-medium">{label}</strong>?
      </p>
      {canRestore ? (
        <label className="flex cursor-pointer items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={restore}
            onChange={(event) => setRestore(event.target.checked)}
            className="accent-primary mt-0.5 size-4 shrink-0"
          />
          <span className="text-on-surface">
            Put the price back to{" "}
            <span className="tabular-nums">{formatPrice(compareAtPriceCents!)}</span>
            <span className="text-on-surface-variant block">
              {restore
                ? "The regular price becomes the price again."
                : `The price stays at ${formatPrice(priceCents)}; only the crossed-out figure goes.`}
            </span>
          </span>
        </label>
      ) : (
        <p className="text-on-surface-variant text-xs">
          The regular price is removed; the price stays at{" "}
          <span className="tabular-nums">{formatPrice(priceCents)}</span>.
        </p>
      )}

      {mine?.message && (
        <p role="alert" className="text-error text-xs">
          {mine.message}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-on-surface-variant rounded-sm px-2 text-sm hover:underline focus-visible:outline-2"
        >
          Keep sale
        </button>
        <button
          type="submit"
          disabled={pending}
          className="bg-primary text-on-primary state-layer inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Ending…" : "End sale"}
        </button>
      </div>
    </form>
  );
}
