"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { setReviewStatus } from "@/lib/actions/reviews";
import { ReviewStatus } from "@/generated/prisma/enums";

/**
 * Hide / restore controls for one review.
 *
 * The pair is deliberately not a toggle switch: hiding someone's writing is a
 * decision worth naming, and "Hide" then "Publish" says what will happen where
 * a switch only says what state it is in.
 */
export function ReviewModeration({
  reviewId,
  status,
}: {
  reviewId: string;
  status: ReviewStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();

  const hidden = status === ReviewStatus.HIDDEN;
  const next = hidden ? ReviewStatus.PUBLISHED : ReviewStatus.HIDDEN;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setReviewStatus(reviewId, next);
            setMessage(result.message ?? result.success);
          })
        }
        className={cn(
          "state-layer inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-all duration-200",
          "focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:opacity-60",
          hidden ? "bg-primary text-on-primary" : "border-outline text-error border",
        )}
      >
        <Icon name={hidden ? "visibility" : "visibility_off"} size={16} />
        {hidden ? "Publish" : "Hide"}
      </button>

      {message && (
        <p role="status" className="text-on-surface-variant text-xs">
          {message}
        </p>
      )}
    </div>
  );
}
