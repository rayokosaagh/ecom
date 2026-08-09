"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { RatingStars } from "./RatingStars";
import { ReviewForm } from "./ReviewForm";
import {
  ReviewMediaGallery,
  type ReviewMediaView,
} from "./ReviewMediaGallery";
import { ReviewReplies } from "./ReviewReplies";
import { deleteReview, toggleReviewLike } from "@/lib/actions/reviews";

export type ReviewAuthor = { name: string | null; email: string; image: string | null };

export type ReplyRow = {
  id: string;
  body: string;
  verified: boolean;
  createdAt: Date;
  userId: string;
  user: ReviewAuthor;
};

export type ReviewRow = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  verified: boolean;
  status: "PUBLISHED" | "HIDDEN";
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  user: ReviewAuthor;
  media: ReviewMediaView[];
  /** How many people found this helpful. */
  _count: { likes: number };
  /**
   * The viewer's own like, as a zero-or-one array — absent entirely when
   * nobody is signed in, which reads the same as "not liked".
   */
  likes?: { userId: string }[];
  replies: ReplyRow[];
};

/** "Sam W." — enough to be a person, not enough to be an email address. */
export function displayName(user: ReviewAuthor): string {
  if (user.name) return user.name;
  const [handle] = user.email.split("@");
  return handle.length > 2 ? `${handle.slice(0, 2)}…` : handle;
}

export function initials(user: ReviewAuthor): string {
  const source = user.name ?? user.email;
  return source.trim().charAt(0).toUpperCase() || "?";
}

/**
 * The heart.
 *
 * Optimistic: the count and the fill flip on click and only then does the
 * server hear about it. A like is trivially reversible and the round trip is a
 * whole page revalidation, so waiting for it would leave the heart visibly
 * lagging the finger on the one control most likely to be pressed twice.
 *
 * Not a button at all for your own review or for a signed-out visitor — a
 * control that cannot do anything is worse than none, and the count is still
 * shown either way so the number never disappears.
 */
function LikeButton({
  review,
  mine,
  signedIn,
}: {
  review: ReviewRow;
  mine: boolean;
  signedIn: boolean;
}) {
  const serverLiked = (review.likes?.length ?? 0) > 0;
  const [liked, setLiked] = useState(serverLiked);
  const [count, setCount] = useState(review._count.likes);
  const [, startTransition] = useTransition();

  const label =
    count === 0
      ? "Nobody has found this helpful yet"
      : `${count} ${count === 1 ? "person finds" : "people find"} this helpful`;

  /**
   * The *number* appears only once there is one — the heart itself always
   * does.
   *
   * A "0" beside every review is a column of zeroes down the page: a
   * scoreboard nobody is winning, drawing the eye to the least informative
   * thing on the card. The heart is a different matter — it is the control,
   * and hiding it leaves nothing to press and no sign the feature exists.
   */
  const showCount = count > 0;

  if (mine || !signedIn) {
    return (
      <span
        className="text-on-surface-variant inline-flex items-center gap-1.5 text-xs"
        title={mine ? "You cannot like your own review" : "Sign in to like reviews"}
      >
        <Icon name="favorite" size={16} filled={showCount} />
        {showCount && <span className="tabular-nums">{count}</span>}
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={label}
      onClick={() => {
        const next = !liked;
        setLiked(next);
        setCount((n) => n + (next ? 1 : -1));
        startTransition(async () => {
          const result = await toggleReviewLike(review.id);
          // The server refused — put the heart back where it was rather than
          // leave the page claiming something the database does not say.
          if (result.message) {
            setLiked(!next);
            setCount((n) => n + (next ? -1 : 1));
          }
        });
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2",
        liked
          ? "text-error hover:bg-error/[0.08]"
          : "text-on-surface-variant hover:text-error hover:bg-on-surface/[0.06]",
      )}
    >
      <Icon
        name="favorite"
        size={16}
        filled={liked}
        // The one flourish: a filled heart springs very slightly on the way in.
        className={cn("transition-transform duration-200", liked && "scale-110")}
      />
      {showCount && <span className="tabular-nums">{count}</span>}
    </button>
  );
}

function Row({
  review,
  productId,
  mine,
  viewerId,
}: {
  review: ReviewRow;
  productId: string;
  mine: boolean;
  viewerId?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  /** Two-step delete. The bin sits beside the pencil, and a misclick there
      throws away something the author took time to write. */
  const [confirming, setConfirming] = useState(false);
  /** Owned here rather than inside `ReviewReplies`, because the button that
      opens the composer now sits in the shared action row. */
  const [replying, setReplying] = useState(false);

  const edited = review.updatedAt.getTime() - review.createdAt.getTime() > 1000;

  return (
    <li className="border-outline-variant/60 border-b py-5 last:border-b-0">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="bg-secondary-container text-on-secondary-container grid size-9 shrink-0 place-items-center rounded-full text-sm font-medium"
        >
          {initials(review.user)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-on-surface text-sm font-medium">
              {displayName(review.user)}
            </span>
            {/* Only where it was earned. A badge everyone carries says
                nothing, which is the whole reason writing is open to any
                customer while this is not. */}
            {review.verified && (
              <span className="text-tertiary inline-flex items-center gap-1 text-xs">
                <Icon name="verified" size={14} />
                Verified purchase
              </span>
            )}
            {mine && (
              <span className="bg-surface-container-highest text-on-surface-variant rounded-full px-2 py-0.5 text-xs">
                Yours
              </span>
            )}
            {/* Only the author sees this, and only for their own review. */}
            {mine && review.status === "HIDDEN" && (
              <span className="bg-error-container text-on-error-container inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
                <Icon name="visibility_off" size={12} />
                Hidden by a moderator
              </span>
            )}
          </div>

          {editing ? (
            <div className="mt-3">
              <ReviewForm
                productId={productId}
                existing={{
                  ...review,
                  media: review.media.map(({ url, kind }) => ({ url, kind })),
                }}
                onCancel={() => setEditing(false)}
              />
            </div>
          ) : (
            <>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <RatingStars value={review.rating} size={14} />
                <span className="sr-only">{review.rating} out of 5</span>
                <span className="text-on-surface-variant text-xs">
                  {review.createdAt.toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {edited && " · edited"}
                </span>
              </div>

              {/* Full-strength ink and a step up in size. Both of these were
                  set as supporting text — the headline at the same size as
                  the body, the body itself in `on-surface-variant` — which
                  left the actual writing quieter than the metadata around it.
                  The review is the content of this section; it should be the
                  most legible thing in it. */}
              {review.title && (
                <p className="text-on-surface mt-2.5 text-base leading-snug font-semibold">
                  {review.title}
                </p>
              )}
              <p className="text-on-surface mt-1.5 text-sm leading-relaxed whitespace-pre-line">
                {review.body}
              </p>

              <ReviewMediaGallery media={review.media} />

              {/* One row for everything you can do to a review: like it, answer
                  it, and — if it is yours — edit or delete it. These were three
                  separate stacked rows, which read as three unrelated groups
                  and pushed the replies far down the card. */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <LikeButton review={review} mine={mine} signedIn={Boolean(viewerId)} />

                {viewerId && !replying && (
                  <button
                    type="button"
                    onClick={() => setReplying(true)}
                    className="text-on-surface-variant hover:text-primary inline-flex items-center gap-1 rounded-sm text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <Icon name="reply" size={14} />
                    Reply
                  </button>
                )}

                {mine && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirming(false);
                        setEditing(true);
                      }}
                      className="text-on-surface-variant hover:text-primary inline-flex items-center gap-1 rounded-sm text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <Icon name="edit" size={14} />
                      Edit
                    </button>

                    {confirming ? (
                      <span className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              await deleteReview(review.id);
                            })
                          }
                          className="text-error inline-flex items-center gap-1 rounded-sm text-xs font-medium hover:underline focus-visible:outline-2 disabled:opacity-50"
                        >
                          <Icon name="delete" size={14} />
                          Delete for good
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(false)}
                          className="text-on-surface-variant rounded-sm text-xs hover:underline focus-visible:outline-2"
                        >
                          Keep it
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        className="text-on-surface-variant hover:text-error inline-flex items-center gap-1 rounded-sm text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        <Icon name="delete" size={14} />
                        Delete
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* The thread and its composer. The trigger lives in the row
                  above, so this is controlled rather than owning its own
                  open state. */}
              <ReviewReplies
                reviewId={review.id}
                replies={review.replies}
                viewerId={viewerId}
                composing={replying}
                onDone={() => setReplying(false)}
              />
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export function ReviewList({
  reviews,
  productId,
  viewerId,
}: {
  reviews: ReviewRow[];
  productId: string;
  viewerId?: string;
}) {
  if (reviews.length === 0) {
    return (
      <p className="text-on-surface-variant py-6 text-sm">
        No reviews yet — yours could be the first.
      </p>
    );
  }

  // The viewer's own review leads. It is the one they came back to change, and
  // hunting for it down a long list to find the pencil is exactly the problem
  // the pencil is there to solve.
  const ordered = viewerId
    ? [...reviews].sort((a, b) =>
        a.userId === viewerId ? -1 : b.userId === viewerId ? 1 : 0,
      )
    : reviews;

  return (
    <ul>
      {ordered.map((review) => (
        <Row
          // `updatedAt` in the key is deliberate: a successful save sends back
          // a newer one, which remounts the row and closes the editor. Without
          // it the form would sit open over the review it had just saved.
          key={`${review.id}-${review.updatedAt.getTime()}`}
          review={review}
          productId={productId}
          mine={viewerId === review.userId}
          viewerId={viewerId}
        />
      ))}
    </ul>
  );
}
