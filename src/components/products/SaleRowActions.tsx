"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { endSale } from "@/lib/actions/sales";

/**
 * Take one product off the sale shelf.
 *
 * Confirmed rather than immediate, because the wording matters and people
 * assume the opposite: ending a sale clears the "was" price and leaves the
 * price exactly where it is. Putting it back up is a price change and lives in
 * the product form, which is why "Edit price" sits alongside.
 */
export function SaleRowActions({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string>();

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Link
          href={`/dashboard/products/${productId}/edit`}
          className="border-outline text-on-surface hover:bg-on-surface/[0.06] inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors duration-150 focus-visible:outline-2"
        >
          <Icon name="edit" size={18} />
          Edit price
        </Link>

        {confirming ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await endSale(productId);
                  setMessage(result.message ?? result.success);
                  setConfirming(false);
                })
              }
              className="text-error rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 disabled:opacity-60"
            >
              End sale
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
            aria-label={`End the sale on ${productName}`}
            onClick={() => setConfirming(true)}
            className="text-on-surface-variant hover:text-error grid size-9 place-items-center rounded-full transition-colors duration-150 focus-visible:outline-2"
          >
            <Icon name="sell" size={18} />
          </button>
        )}
      </div>

      {confirming && !message && (
        <p className="text-on-surface-variant max-w-[22rem] text-right text-xs">
          Clears the “was” price. The price customers pay does not change.
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
