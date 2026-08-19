"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { clearIgnoredRegularPrice } from "@/lib/actions/sales";

/**
 * Clear a regular price that sits on a product priced by configuration.
 *
 * One click, no confirmation: the column has no effect anywhere a customer
 * looks, so there is nothing to be careful about — see the action's comment.
 */
export function ClearIgnoredButton({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await clearIgnoredRegularPrice(productId);
            setMessage(result.success ?? result.message);
          })
        }
        className="border-outline text-on-surface hover:bg-on-surface/[0.06] inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
      >
        <Icon name="backspace" size={16} />
        {pending ? "Clearing…" : "Clear"}
      </button>
      {message && (
        <p role="status" className="text-on-surface-variant max-w-[16rem] text-right text-xs">
          {message}
        </p>
      )}
    </div>
  );
}
