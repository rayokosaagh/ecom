"use client";

import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { RatingStars } from "@/components/reviews/RatingStars";
import { ReviewMediaGallery } from "@/components/reviews/ReviewMediaGallery";
import { reportReasonLabel } from "@/lib/reviews/policy";
import { cn } from "@/lib/cn";
import { ModerationActions, type ModerationAction } from "./ModerationActions";
import { ReportedBadge, StatusBadge, VerifiedBadge } from "./ReviewBadges";
import type { ReviewCardRow } from "./types";

/** The date format the rest of the dashboard uses. */
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * One review in the moderation queue.
 *
 * Built to be *scanned*: what it is about and how it was rated on the first
 * line, who said it and when on the second, the writing itself clamped to two
 * lines, and everything else — the full text, the order, the reports, the reply
 * thread — behind the panel a click away. A queue where every row is the whole
 * record is a queue that fits four rows on a screen.
 *
 * The card opens the panel through an overlay button pinned across it rather
 * than by wrapping everything in one, because it contains a link to the product
 * and several controls of its own: nesting interactive elements inside a button
 * is invalid markup, and the browser's own handling of it is unpredictable.
 * That is the same arrangement `ProductCard` uses for the storefront grid — see
 * the note there. Everything clickable sits above the overlay on `z-10`.
 */
export function ReviewCard({
  review,
  pending,
  onAction,
  onOpen,
  canModerate,
}: {
  review: ReviewCardRow;
  pending: ModerationAction | null;
  onAction: (action: ModerationAction) => void;
  onOpen: () => void;
  canModerate: boolean;
}) {
  const reportCount = review.reports.length;
  /** Enough of the flag to decide whether to open it — the reason and how many. */
  const leadReason = reportCount > 0 ? reportReasonLabel(review.reports[0].reason) : null;

  return (
    <Card
      variant="outlined"
      className={cn(
        "relative overflow-hidden transition-shadow duration-200",
        // The hover lift the dashboard's other clickable cards use. Shadow
        // only — a card that moves under the cursor makes a list of them
        // ripple as the pointer crosses it.
        "hover:shadow-elevation-1",
        // A flagged review earns a marker rather than a tinted card: colouring
        // the whole surface would make the queue's worst rows the loudest thing
        // on a page that is mostly text.
        reportCount > 0 && "border-error/40",
      )}
    >
      {/* The overlay. First in the DOM so everything after it paints above. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open the review of ${review.product.name} by ${review.author.name}`}
        className="absolute inset-0 z-0 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2"
      />

      <div className="pointer-events-none relative flex flex-wrap items-start gap-3 p-4 sm:flex-nowrap sm:gap-4">
        {/* Product thumbnail. Not a link: the product name beside it already is
            one, and two targets for one destination inside a row that is itself
            a target is three ways to click the same card. */}
        <span className="bg-surface-container-highest size-14 shrink-0 overflow-hidden rounded-lg">
          {review.product.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={review.product.image}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <span className="text-on-surface-variant grid size-full place-items-center">
              <Icon name="image" size={20} />
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          {/* Line one: what it is about, and what state it is in. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/products/${review.product.slug}`}
              className="text-on-surface pointer-events-auto relative z-10 rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {review.product.name}
            </Link>
            <StatusBadge status={review.status} />
            <ReportedBadge count={reportCount} />
          </div>

          {/* Line two: the verdict and who reached it. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <RatingStars value={review.rating} size={14} />
            <span className="text-on-surface-variant text-xs">
              <span className="tabular-nums">{review.rating}/5</span> ·{" "}
              {review.author.name} · {formatDate(review.createdAt)}
            </span>
            <VerifiedBadge verified={review.verified} />
          </div>

          {/* The writing. Two lines, because the panel holds the rest — and a
              queue of untruncated reviews is a queue you scroll rather than
              read. */}
          {review.title && (
            <p className="text-on-surface mt-2 truncate text-sm font-medium">
              {review.title}
            </p>
          )}
          <p className="text-on-surface-variant mt-1 line-clamp-2 text-sm leading-relaxed">
            {review.body}
          </p>

          {/* Why it was flagged, in one line. The whole complaint — every
              reporter, every note — is in the panel; this is the part that
              decides whether the panel is worth opening. */}
          {leadReason && (
            <p className="text-error mt-2 flex items-center gap-1.5 text-xs">
              <Icon name="report" size={14} />
              {leadReason}
              {reportCount > 1 && (
                <span className="text-on-surface-variant">
                  · {reportCount} reports
                </span>
              )}
            </p>
          )}

          {/* Attachments are the part most likely to need moderating, so they
              are shown here rather than only on the storefront — deciding on a
              review you cannot fully see is guesswork. Smaller than the
              storefront's, and they open full size on their own. */}
          <div className="pointer-events-auto relative z-10">
            <ReviewMediaGallery
              media={review.media}
              className="mt-2.5"
              thumbClassName="size-14"
            />
          </div>

          {/* The quiet facts, last: what other shoppers made of it. Each only
              appears once there is one, so an unremarked review has no row of
              zeroes under it. */}
          {(review.helpfulCount > 0 || review.replyCount > 0) && (
            <p className="text-on-surface-variant mt-2.5 flex flex-wrap items-center gap-x-4 text-xs">
              {review.helpfulCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="favorite" size={13} />
                  {review.helpfulCount} found this helpful
                </span>
              )}
              {review.replyCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="reply" size={13} />
                  {review.replyCount}{" "}
                  {review.replyCount === 1 ? "reply" : "replies"}
                </span>
              )}
            </p>
          )}
        </div>

        {/* The decision. Right-aligned on a wide screen and wrapped underneath
            on a narrow one, which is what `flex-wrap` on the row buys — the
            actions stay reachable rather than being squeezed into a column two
            words wide. */}
        {canModerate && (
          <div className="pointer-events-auto relative z-10 w-full shrink-0 sm:w-auto">
            <ModerationActions
              status={review.status}
              reportCount={reportCount}
              pending={pending}
              onAction={onAction}
              onReview={onOpen}
              className="sm:justify-end"
            />
          </div>
        )}
      </div>
    </Card>
  );
}
