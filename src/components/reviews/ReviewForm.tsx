"use client";

import { useActionState, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { submitReview, type ReviewActionState } from "@/lib/actions/reviews";
import {
  ReviewMediaField,
  type ReviewMediaItem,
} from "./ReviewMediaField";
import { BODY_MAX, TITLE_MAX } from "@/lib/reviews/validation";

const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

/**
 * Star picker.
 *
 * Radio inputs rather than buttons: a rating is one choice out of five, which
 * is what a radio group already means to a screen reader and to the keyboard —
 * arrow keys move between options for free. The stars are the labels.
 */
function StarInput({
  value,
  onChange,
  invalid,
}: {
  value: number;
  onChange: (next: number) => void;
  invalid?: boolean;
}) {
  /** What the pointer is over, which previews without committing. */
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value;

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Rating"
        aria-invalid={invalid || undefined}
        className="flex items-center gap-1"
        onMouseLeave={() => setHovered(0)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <label
            key={star}
            onMouseEnter={() => setHovered(star)}
            className="cursor-pointer p-0.5"
          >
            <input
              type="radio"
              name="rating"
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className={cn(
                "peer-focus-visible:outline-primary block text-2xl leading-none transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                star <= shown ? "text-primary" : "text-on-surface-variant/30",
              )}
            >
              ★
            </span>
            <span className="sr-only">
              {star} star{star === 1 ? "" : "s"}
            </span>
          </label>
        ))}

        <span className="text-on-surface-variant ml-2 text-sm">{LABELS[shown]}</span>
      </div>
    </div>
  );
}

/**
 * Write or edit a review.
 *
 * Only rendered for someone eligible to write one — the page decides that, and
 * the action re-checks it.
 *
 * Collapsing after a successful save is the caller's job, not this component's:
 * the review list remounts the row when the server sends back a newer
 * `updatedAt`, which resets the editor without an effect watching for success.
 */
export function ReviewForm({
  productId,
  existing,
  onCancel,
}: {
  productId: string;
  existing?: {
    rating: number;
    title: string | null;
    body: string;
    media?: ReviewMediaItem[];
  } | null;
  /** Offered while editing in place; absent when writing a new review. */
  onCancel?: () => void;
}) {
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(
    submitReview,
    {},
  );
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [body, setBody] = useState(existing?.body ?? "");
  const [media, setMedia] = useState<ReviewMediaItem[]>(existing?.media ?? []);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="productId" value={productId} />

      {state.message && (
        <p
          role="alert"
          className="bg-error-container text-on-error-container flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
        >
          <Icon name="error" size={18} />
          {state.message}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="bg-tertiary-container text-on-tertiary-container flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
        >
          <Icon name="check_circle" size={18} />
          {state.success}
        </p>
      )}

      <div>
        <StarInput
          value={rating}
          onChange={setRating}
          invalid={Boolean(state.errors?.rating)}
        />
        {state.errors?.rating && (
          <p className="text-error mt-1 text-xs">{state.errors.rating}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="review-title"
          className="text-on-surface-variant mb-1 block text-sm"
        >
          Headline <span className="opacity-60">(optional)</span>
        </label>
        <input
          id="review-title"
          name="title"
          maxLength={TITLE_MAX}
          defaultValue={existing?.title ?? ""}
          placeholder="Sums it up in a few words"
          className="border-outline bg-surface text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary h-11 w-full rounded-lg border px-3 text-sm transition-colors duration-200 focus:outline-none"
        />
        {state.errors?.title && (
          <p className="text-error mt-1 text-xs">{state.errors.title}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="review-body"
          className="text-on-surface-variant mb-1 block text-sm"
        >
          Your review
        </label>
        <textarea
          id="review-body"
          name="body"
          rows={4}
          maxLength={BODY_MAX}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          aria-invalid={Boolean(state.errors?.body) || undefined}
          placeholder="How is it to actually live with? What would you tell someone considering it?"
          className="border-outline bg-surface text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary w-full resize-y rounded-lg border px-3 py-2 text-sm transition-colors duration-200 focus:outline-none"
        />
        <div className="mt-1 flex items-start justify-between gap-3">
          <p className="text-error text-xs">{state.errors?.body}</p>
          <p className="text-on-surface-variant shrink-0 text-xs tabular-nums">
            {body.length}/{BODY_MAX}
          </p>
        </div>
      </div>

      <ReviewMediaField value={media} onChange={setMedia} />
      {state.errors?.media && (
        <p className="text-error text-xs">{state.errors.media}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-primary text-on-primary state-layer inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:opacity-60"
        >
          {pending && (
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {existing ? "Update review" : "Post review"}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="text-on-surface-variant hover:bg-on-surface/[0.08] h-11 rounded-full px-5 text-sm transition-colors duration-150 focus-visible:outline-2 disabled:opacity-60"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
