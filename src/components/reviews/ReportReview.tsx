"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { REPORT_REASONS } from "@/lib/reviews/policy";
import { reportReview, type ReviewActionState } from "@/lib/actions/reviews";

const INITIAL: ReviewActionState = {};

/**
 * The flag a shopper can raise on somebody else's review.
 *
 * This is where the moderation queue's Reported tab gets its contents. Without
 * it that tab would be a screen with no way for anything to arrive in it, which
 * is the difference between a feature and a mock-up of one.
 *
 * Closed until asked for, like the reply composer beside it: a reason picker
 * open under every review would make a page of writing look like a page of
 * complaints forms. Once it has been sent the control is replaced by the
 * acknowledgement rather than left there to be pressed again — the action
 * refuses a second open report anyway, and a button that does nothing is worse
 * than none.
 *
 * Not shown at all for your own review or to a signed-out visitor. The action
 * enforces both; this only decides what to draw.
 */
export function ReportReview({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    reportReview.bind(null, reviewId),
    INITIAL,
  );
  const [reason, setReason] = useState<string>("");

  if (state.success) {
    return (
      <span className="text-on-surface-variant inline-flex items-center gap-1 text-xs">
        <Icon name="check" size={14} />
        {state.success}
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-on-surface-variant hover:text-error inline-flex items-center gap-1 rounded-sm text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Icon name="flag" size={14} />
        Report
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="border-outline-variant bg-surface-container-low mt-1 w-full space-y-2 rounded-xl border p-3"
      noValidate
    >
      <p className="text-on-surface text-xs font-medium">
        What is wrong with this review?
      </p>

      <div className="flex flex-wrap gap-1.5">
        {REPORT_REASONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors duration-150",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
              reason === option.value
                ? "border-secondary-container bg-secondary-container text-on-secondary-container"
                : "border-outline-variant text-on-surface-variant hover:bg-on-surface/[0.06]",
            )}
          >
            <input
              type="radio"
              name="reason"
              value={option.value}
              checked={reason === option.value}
              onChange={(event) => setReason(event.target.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>

      {state.errors?.reason && (
        <p className="text-error text-xs">{state.errors.reason}</p>
      )}

      <label htmlFor={`report-note-${reviewId}`} className="sr-only">
        Anything to add
      </label>
      <textarea
        id={`report-note-${reviewId}`}
        name="note"
        rows={2}
        maxLength={300}
        disabled={pending}
        placeholder={
          reason === "OTHER"
            ? "Tell us what is wrong with it"
            : "Anything to add? (optional)"
        }
        aria-invalid={Boolean(state.errors?.note) || undefined}
        className={cn(
          "text-on-surface caret-primary w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-sm",
          "placeholder:text-on-surface-variant focus:border-primary outline-none transition-colors duration-200",
          state.errors?.note ? "border-error" : "border-outline-variant",
        )}
      />
      {state.errors?.note && (
        <p className="text-error text-xs">{state.errors.note}</p>
      )}

      {state.message && (
        <p role="alert" className="text-error text-xs">
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-primary text-on-primary state-layer inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:opacity-60"
        >
          {pending && (
            <Icon
              name="progress_activity"
              size={14}
              className="motion-safe:animate-spin"
            />
          )}
          Send report
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-on-surface-variant state-layer inline-flex h-9 items-center rounded-full px-3 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Cancel
        </button>
        <p className="text-on-surface-variant text-xs">
          A moderator sees this, not the author.
        </p>
      </div>
    </form>
  );
}
