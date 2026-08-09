"use client";

import { useActionState, useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { REPLY_MAX } from "@/lib/reviews/validation";
import {
  deleteReply,
  submitReply,
  type ReviewActionState,
} from "@/lib/actions/reviews";
import { displayName, initials, type ReplyRow } from "./ReviewList";

const INITIAL: ReviewActionState = {};

/**
 * The answers under one review.
 *
 * Flat, matching the schema: a reply cannot be replied to. Indented once
 * against a rule rather than nested boxes — one level of depth only needs one
 * level of signal, and a card inside a card inside a list is three borders
 * saying the same thing.
 *
 * The composer is closed until asked for. A textarea permanently open under
 * every review would make the list read as a form rather than as writing, and
 * most people scrolling reviews are reading, not answering.
 */
export function ReviewReplies({
  reviewId,
  replies,
  viewerId,
  composing,
  onDone,
}: {
  reviewId: string;
  replies: ReplyRow[];
  viewerId?: string;
  /** Whether the composer is open. Owned by the row, whose action bar holds
      the button that opens it. */
  composing: boolean;
  /** Posted, or cancelled — either way the composer should close. */
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    submitReply.bind(null, reviewId),
    INITIAL,
  );

  /**
   * A posted reply arrives through the revalidated page, so the composer has
   * nothing left to show — close it and hand the space back to the thread.
   *
   * Adjusted during render against the previous value rather than in an
   * effect. An effect would paint the composer once more before closing it,
   * and React's own guidance (and the lint rule that enforces it) is that
   * state derived from a prop or a hook's result belongs here.
   */
  const [seenSuccess, setSeenSuccess] = useState(state.success);
  if (state.success !== seenSuccess) {
    setSeenSuccess(state.success);
    if (state.success) onDone();
  }

  return (
    <div className="mt-2">
      {replies.length > 0 && (
        <ul className="border-outline-variant/60 mt-3 ml-1 space-y-3 border-l pl-4">
          {replies.map((reply) => (
            <ReplyItem key={reply.id} reply={reply} viewerId={viewerId} />
          ))}
        </ul>
      )}

      {viewerId && composing && (
          <form action={formAction} className="mt-3 ml-1 pl-4" noValidate>
            <label htmlFor={`reply-${reviewId}`} className="sr-only">
              Write a reply
            </label>
            <textarea
              id={`reply-${reviewId}`}
              name="body"
              rows={2}
              autoFocus
              disabled={pending}
              maxLength={REPLY_MAX}
              placeholder="Write a reply…"
              aria-invalid={Boolean(state.errors?.body) || undefined}
              className={cn(
                "text-on-surface caret-primary w-full resize-y rounded-sm border bg-transparent px-3 py-2 text-sm",
                "transition-colors duration-200 focus:outline-none",
                state.errors?.body
                  ? "border-error focus:border-error"
                  : "border-outline-variant focus:border-primary",
              )}
            />

            {state.errors?.body && (
              <p role="alert" className="text-error mt-1.5 flex items-center gap-1.5 text-xs">
                <Icon name="error" size={14} />
                {state.errors.body}
              </p>
            )}
            {state.message && (
              <p role="alert" className="text-error mt-1.5 text-xs">
                {state.message}
              </p>
            )}

            <div className="mt-2 flex items-center gap-2">
              <button
                type="submit"
                disabled={pending}
                className="bg-primary text-on-primary inline-flex h-8 items-center gap-1.5 rounded-full px-4 text-xs font-medium transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
              >
                {pending && (
                  <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                Reply
              </button>
              <button
                type="button"
                onClick={onDone}
                disabled={pending}
                className="text-on-surface-variant h-8 rounded-full px-3 text-xs hover:underline focus-visible:outline-2 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
      )}
    </div>
  );
}

function ReplyItem({ reply, viewerId }: { reply: ReplyRow; viewerId?: string }) {
  const [pending, startTransition] = useTransition();
  // Same two-step the review's own delete uses, for the same reason.
  const [confirming, setConfirming] = useState(false);
  const mine = viewerId === reply.userId;

  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className="bg-surface-container-highest text-on-surface-variant grid size-7 shrink-0 place-items-center rounded-full text-xs font-medium"
      >
        {initials(reply.user)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-on-surface text-xs font-medium">
            {displayName(reply.user)}
          </span>
          {/* The same badge the review above carries, on the same terms — a
              reply from someone who owns the thing is worth more than one from
              someone who does not, and that is as true in an answer as in a
              verdict. */}
          {reply.verified && (
            <span className="text-tertiary inline-flex items-center gap-1 text-[0.6875rem]">
              <Icon name="verified" size={12} />
              Verified purchase
            </span>
          )}
          <span className="text-on-surface-variant text-[0.6875rem]">
            {reply.createdAt.toLocaleDateString("en-US", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>

        {/* Full-strength ink, matching the review it answers. */}
        <p className="text-on-surface mt-0.5 text-sm leading-relaxed whitespace-pre-line">
          {reply.body}
        </p>

        {mine &&
          (confirming ? (
            <span className="mt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteReply(reply.id);
                  })
                }
                className="text-error rounded-sm text-[0.6875rem] font-medium hover:underline focus-visible:outline-2 disabled:opacity-50"
              >
                Delete for good
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-on-surface-variant rounded-sm text-[0.6875rem] hover:underline focus-visible:outline-2"
              >
                Keep it
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-on-surface-variant hover:text-error mt-1 inline-flex items-center gap-1 rounded-sm text-[0.6875rem] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Icon name="delete" size={12} />
              Delete
            </button>
          ))}
      </div>
    </li>
  );
}
