"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { deleteExpiredDiscounts } from "@/lib/actions/discounts";

/**
 * Sweep away the codes whose window has closed.
 *
 * One button for what would otherwise be a row of individual deletions after
 * every seasonal sale. It asks first — this removes several rows at once and
 * the count is the only warning of how many — and it says plainly when some of
 * them have been redeemed, because that is the case where something is
 * genuinely lost: the orders keep what they were charged, but no longer point
 * back at the code.
 *
 * Buttons are written out rather than taken from `ui/Button`, matching
 * `DiscountRowActions` next door: both sit in a dense row where the common
 * button's 40px height is too tall, and `cn` does not resolve Tailwind
 * conflicts, so overriding its size or colour from outside is not reliable.
 */
export function DeleteExpiredDiscounts({
  count,
  usedCount,
}: {
  /** Codes past their end date. All of them will go. */
  count: number;
  /** How many of those have orders behind them, for the warning. */
  usedCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string>();

  // Nothing expired and nothing to report: the control would only ever be a
  // disabled button.
  if (count === 0 && !message) return null;

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      {count > 0 &&
        (confirming ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteExpiredDiscounts();
                  setMessage(result.message ?? result.success);
                  setConfirming(false);
                })
              }
              className="bg-error text-on-error inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 disabled:opacity-60"
            >
              <Icon name="delete_sweep" size={18} />
              Delete {count}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-on-surface-variant rounded-sm text-sm hover:underline focus-visible:outline-2"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-on-surface-variant hover:text-error hover:bg-on-surface/[0.06] inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm transition-colors duration-150 focus-visible:outline-2"
          >
            <Icon name="delete_sweep" size={18} />
            Delete expired ({count})
          </button>
        ))}

      {confirming && usedCount > 0 && (
        <p className="text-on-surface-variant max-w-sm text-xs sm:text-right">
          {usedCount === 1
            ? "One of these has been redeemed. Its order keeps the amount taken off, but will no longer link back to the code."
            : `${usedCount} of these have been redeemed. Those orders keep the amount taken off, but will no longer link back to the code.`}
        </p>
      )}

      {message && (
        <p role="status" className="text-on-surface-variant text-xs">
          {message}
        </p>
      )}
    </div>
  );
}
