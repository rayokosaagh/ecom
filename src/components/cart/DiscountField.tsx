"use client";

import { useActionState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { applyDiscount, removeDiscount, type CartActionState } from "@/lib/actions/cart";
import { formatPrice } from "@/lib/products/format";

/**
 * Apply or remove a discount code.
 *
 * Shows three things, and they are genuinely different: no code, a code that
 * is working, and a code that is stored but has stopped applying. The third is
 * the one worth handling properly — a basket can fall below a minimum spend
 * after an item is removed, and silently dropping the code would leave the
 * shopper wondering where their money went.
 */
export function DiscountField({
  applied,
  failed,
  discountCents,
}: {
  /** Label of the code currently taking money off, if any. */
  applied?: string;
  /** Why a stored code is not applying, if that is the situation. */
  failed?: string;
  discountCents: number;
}) {
  const [state, action, pending] = useActionState<CartActionState, FormData>(
    applyDiscount,
    {},
  );
  const [removing, startRemoving] = useTransition();

  if (applied) {
    return (
      <div className="space-y-2">
        <div className="border-tertiary/40 bg-tertiary-container/40 flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2">
          <span className="text-on-surface flex min-w-0 items-center gap-2 text-sm">
            <Icon name="sell" size={16} className="text-tertiary shrink-0" />
            <span className="truncate">{applied}</span>
          </span>
          <button
            type="button"
            disabled={removing}
            onClick={() => startRemoving(async () => removeDiscount())}
            className="text-on-surface-variant hover:text-error shrink-0 rounded-sm text-xs transition-colors duration-150 focus-visible:outline-2 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
        <p className="text-tertiary text-xs">
          Saving {formatPrice(discountCents)} on this order.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* A stored code that no longer applies. Stated plainly, because the
          alternative is a total that quietly went up. */}
      {failed && (
        <p className="text-error flex items-start gap-1.5 text-xs">
          <Icon name="info" size={14} className="mt-px shrink-0" />
          {failed}
        </p>
      )}

      <form action={action} className="flex gap-2">
        <label htmlFor="discount-code" className="sr-only">
          Discount code
        </label>
        <input
          id="discount-code"
          name="code"
          placeholder="Discount code"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="border-outline bg-surface text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm uppercase transition-colors duration-200 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="border-outline text-on-surface hover:bg-on-surface/[0.06] h-10 shrink-0 rounded-lg border px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
        >
          {pending ? "Checking…" : "Apply"}
        </button>
      </form>

      {state.message && (
        <p role="alert" className="text-error text-xs">
          {state.message}
        </p>
      )}
    </div>
  );
}
