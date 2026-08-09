"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { deleteDiscount, setDiscountActive } from "@/lib/actions/discounts";

/**
 * Switch a code off, or delete one nobody has used.
 *
 * Switching off is the ordinary action and deleting is the exception — a code
 * that has been redeemed is part of the record, and the action refuses to
 * remove it rather than leaving orders pointing at nothing.
 */
export function DiscountRowActions({
  id,
  active,
  used,
}: {
  id: string;
  active: boolean;
  used: number;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string>();

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setDiscountActive(id, !active);
              setMessage(result.message ?? result.success);
            })
          }
          className="border-outline text-on-surface hover:bg-on-surface/[0.06] inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors duration-150 focus-visible:outline-2 disabled:opacity-60"
        >
          <Icon name={active ? "toggle_on" : "toggle_off"} size={18} />
          {active ? "Switch off" : "Switch on"}
        </button>

        {used === 0 &&
          (confirming ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteDiscount(id);
                    setMessage(result.message ?? result.success);
                    setConfirming(false);
                  })
                }
                className="text-error rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 disabled:opacity-60"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-on-surface-variant rounded-sm text-sm hover:underline focus-visible:outline-2"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              aria-label="Delete this code"
              onClick={() => setConfirming(true)}
              className="text-on-surface-variant hover:text-error grid size-9 place-items-center rounded-full transition-colors duration-150 focus-visible:outline-2"
            >
              <Icon name="delete" size={18} />
            </button>
          ))}
      </div>

      {message && (
        <p role="status" className="text-on-surface-variant text-xs">
          {message}
        </p>
      )}
    </div>
  );
}
