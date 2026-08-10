"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { reorder, type ReorderState } from "@/lib/actions/reorder";

const INITIAL: ReorderState = {};

/**
 * Buy again.
 *
 * The one interactive thing in a list that is otherwise all server-rendered, so
 * it is its own small Client Component rather than a reason to make the row
 * one. It reports back in place instead of redirecting to the cart: someone
 * working down their order history usually wants to add a second thing, and
 * being thrown to /cart after each press makes that four navigations.
 *
 * What it says matters as much as what it does — a partial reorder names the
 * lines that could not come back, because "added 3 items" when four were
 * expected is a discrepancy the shopper would otherwise meet at the till.
 */
export function ReorderButton({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(reorder, INITIAL);

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      {state.success && (
        <p
          role="status"
          className="text-on-surface-variant flex items-center gap-1.5 text-xs"
        >
          <Icon name="check_circle" size={14} className="text-tertiary" />
          {state.success}{" "}
          <Link
            href="/cart"
            className="text-primary rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            View cart
          </Link>
        </p>
      )}

      {state.message && (
        <p role="alert" className="text-error flex items-center gap-1.5 text-xs">
          <Icon name="error" size={14} />
          {state.message}
        </p>
      )}

      <form action={formAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <button
          type="submit"
          disabled={pending}
          className="border-outline text-primary state-layer inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:opacity-60"
        >
          <Icon name={pending ? "hourglass_top" : "refresh"} size={18} />
          {pending ? "Adding…" : "Buy again"}
        </button>
      </form>
    </div>
  );
}
