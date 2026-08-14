"use client";

import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { SidePanel } from "@/components/ui/SidePanel";
import { RatingStars } from "@/components/reviews/RatingStars";
import { ReviewMediaGallery } from "@/components/reviews/ReviewMediaGallery";
import { reportReasonLabel } from "@/lib/reviews/policy";
import { cn } from "@/lib/cn";
import { ModerationActions, type ModerationAction } from "./ModerationActions";
import { ReportedBadge, StatusBadge, VerifiedBadge } from "./ReviewBadges";
import type { ReviewCardRow, ReviewDetailPayload, ReviewStatusValue } from "./types";

const STATUS_TEXT: Record<ReviewStatusValue, string> = {
  PENDING: "Pending approval",
  PUBLISHED: "Published",
  HIDDEN: "Hidden",
};

function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${formatDate(date)}, ${date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/** One labelled fact. The panel is mostly these, so they are one shape. */
function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-on-surface-variant text-xs">{label}</dt>
      <dd className="text-on-surface mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-on-surface-variant text-xs font-medium tracking-wide uppercase">
      {children}
    </h3>
  );
}

/**
 * Everything known about one review, beside the list rather than instead of it.
 *
 * Presentational: the extras — the order the customer bought on, the product's
 * rating, every report including the settled ones, the reply thread — are
 * fetched by the queue when a row is opened and handed down here. Those are
 * per-review and expensive in a way the list is not, so they are not rendered
 * with the twenty rows; but they belong to an *event* (somebody opened this
 * row) rather than to this component's lifecycle, which is why the fetch lives
 * in the handler that caused it and not in an effect here.
 *
 * The row that opened it is passed in too, and drawn immediately while that
 * fetch is in flight. A panel that opens empty and fills in a moment later
 * reads as slow even when it is fast; one that opens with the product, the
 * stars and the words already in place reads as instant, because the part the
 * reader looks at first is already there.
 */
export function ReviewDetailPanel({
  review,
  detail,
  error,
  onRetry,
  open,
  onClose,
  pending,
  onAction,
  canModerate,
}: {
  /** The list row, so the panel can draw before the detail lands. */
  review: ReviewCardRow | null;
  /** Null while the fetch is in flight, or after it failed. */
  detail: ReviewDetailPayload | null;
  error: string | null;
  onRetry: () => void;
  open: boolean;
  onClose: () => void;
  pending: ModerationAction | null;
  onAction: (action: ModerationAction) => void;
  canModerate: boolean;
}) {
  /**
   * In flight, derived rather than tracked.
   *
   * "Open, with neither an answer nor a failure yet" is exactly what waiting
   * means here, and reading it off the two values that already exist keeps them
   * from ever disagreeing with a third.
   */
  const loading = open && !detail && !error;

  // The moderation actions change the row underneath us, so the panel's own
  // copy has to be refreshed rather than left claiming the old status.
  const status = review?.status ?? detail?.status ?? "PUBLISHED";
  const openReports = (detail?.reports ?? []).filter((report) => !report.resolvedAt);
  const settledReports = (detail?.reports ?? []).filter((report) => report.resolvedAt);
  const reportCount = detail ? openReports.length : (review?.reports.length ?? 0);

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Review details"
      footer={
        review && canModerate ? (
          <ModerationActions
            status={status}
            reportCount={reportCount}
            pending={pending}
            onAction={onAction}
            layout="stacked"
          />
        ) : undefined
      }
    >
      {review && (
        <div className="space-y-5">
          {/* The product, and how it is doing overall. A review is a verdict on
              something, and "4.8 from 128" is the context that says whether
              this one is an outlier or the pattern. */}
          <div className="flex items-start gap-3">
            <span className="bg-surface-container-highest size-16 shrink-0 overflow-hidden rounded-lg">
              {review.product.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={review.product.image}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <span className="text-on-surface-variant grid size-full place-items-center">
                  <Icon name="image" size={22} />
                </span>
              )}
            </span>

            <div className="min-w-0 flex-1">
              <Link
                href={`/products/${review.product.slug}`}
                className="text-on-surface rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {review.product.name}
              </Link>

              {detail?.productRating ? (
                <p className="text-on-surface-variant mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <RatingStars value={detail.productRating.average} size={13} />
                  <span className="tabular-nums">
                    {detail.productRating.average.toFixed(1)}
                  </span>
                  <span>
                    · {detail.productRating.count} review
                    {detail.productRating.count === 1 ? "" : "s"} in total
                  </span>
                </p>
              ) : (
                loading && <Skeleton className="mt-1.5 h-3 w-32" />
              )}
            </div>
          </div>

          {/* The verdict itself. */}
          <div className="border-outline-variant space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <RatingStars value={review.rating} size={18} />
              <span className="text-on-surface text-sm font-medium tabular-nums">
                {review.rating}/5
              </span>
              <span className="sr-only">out of 5</span>
              <StatusBadge status={status} className="ml-auto" />
              <ReportedBadge count={reportCount} />
            </div>

            {review.title && (
              <p className="text-on-surface text-base leading-snug font-semibold">
                {review.title}
              </p>
            )}

            {/* The whole thing, unclamped — this panel is the one place the
                review is read rather than scanned. */}
            <p className="text-on-surface text-sm leading-relaxed whitespace-pre-line">
              {review.body}
            </p>

            <VerifiedBadge verified={review.verified} />

            <ReviewMediaGallery media={review.media} thumbClassName="size-20" />
          </div>

          {/* The facts around it. Two columns on anything but a phone, because
              they are short values and a single column of them is a long thin
              list that pushes the reports off the screen. */}
          <div>
            <SectionHeading>Details</SectionHeading>
            <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-3.5">
              <Fact label="Reviewer">
                {review.author.name}
                <span className="text-on-surface-variant block text-xs">
                  {review.author.email}
                </span>
              </Fact>

              <Fact label="Order">
                {loading && !detail ? (
                  <Skeleton className="h-4 w-24" />
                ) : detail?.order ? (
                  <>
                    <span className="font-mono text-sm tracking-tight">
                      {detail.order.reference}
                    </span>
                    <span className="text-on-surface-variant block text-xs">
                      {formatDate(detail.order.placedAt)} ·{" "}
                      {detail.order.status.toLowerCase()}
                    </span>
                  </>
                ) : (
                  <span className="text-on-surface-variant">
                    No matching order
                  </span>
                )}
              </Fact>

              <Fact label="Written">{formatDate(review.createdAt)}</Fact>
              <Fact label="Status">{STATUS_TEXT[status]}</Fact>

              {detail && detail._count.likes > 0 && (
                <Fact label="Found helpful">
                  <span className="tabular-nums">{detail._count.likes}</span>
                </Fact>
              )}
              {detail && detail._count.replies > 0 && (
                <Fact label="Replies">
                  <span className="tabular-nums">{detail._count.replies}</span>
                </Fact>
              )}
            </dl>
          </div>

          {/* Why somebody objected, in their own words. Open complaints first,
              settled ones under them — a review flagged twice before is a
              different decision from one flagged for the first time. */}
          {(openReports.length > 0 || settledReports.length > 0) && (
            <div>
              <SectionHeading>
                Reports ({openReports.length} open)
              </SectionHeading>
              <ul className="mt-2.5 space-y-2">
                {[...openReports, ...settledReports].map((report) => (
                  <li
                    key={report.id}
                    className={cn(
                      "rounded-xl border p-3 text-sm",
                      report.resolvedAt
                        ? "border-outline-variant text-on-surface-variant"
                        : "border-error/40 bg-error-container/25",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Icon
                        name={report.resolvedAt ? "flag_circle" : "flag"}
                        size={14}
                        className={report.resolvedAt ? undefined : "text-error"}
                      />
                      <span className="text-on-surface font-medium">
                        {reportReasonLabel(report.reason)}
                      </span>
                      {report.resolvedAt && (
                        <span className="text-on-surface-variant text-xs">
                          · dismissed {formatDate(report.resolvedAt)}
                        </span>
                      )}
                    </div>

                    {report.note && (
                      <p className="text-on-surface mt-1.5 text-sm leading-relaxed">
                        “{report.note}”
                      </p>
                    )}

                    <p className="text-on-surface-variant mt-1.5 text-xs">
                      {report.user.name ?? report.user.email} ·{" "}
                      {formatDateTime(report.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Answers to the review, so a moderator can see the conversation
              they are about to remove half of. */}
          {detail && detail.replies.length > 0 && (
            <div>
              <SectionHeading>Replies</SectionHeading>
              <ul className="mt-2.5 space-y-2.5">
                {detail.replies.map((reply) => (
                  <li
                    key={reply.id}
                    className="border-outline-variant rounded-xl border p-3"
                  >
                    <p className="text-on-surface-variant flex flex-wrap items-center gap-x-2 text-xs">
                      <span className="text-on-surface font-medium">
                        {reply.user.name ?? reply.user.email}
                      </span>
                      {formatDate(reply.createdAt)}
                      <StatusBadge status={reply.status} />
                    </p>
                    <p className="text-on-surface mt-1 text-sm leading-relaxed whitespace-pre-line">
                      {reply.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Who decided what, and when. Null on both sides is not missing
              data — it is a review nobody has looked at, which is precisely
              what the Pending queue is counting. */}
          <div>
            <SectionHeading>Moderation</SectionHeading>
            <p className="text-on-surface-variant mt-2 text-sm">
              {loading && !detail ? (
                <Skeleton className="h-4 w-48" />
              ) : detail?.moderatedAt ? (
                <>
                  Last decided {formatDateTime(detail.moderatedAt)}
                  {detail.moderatedBy &&
                    ` by ${detail.moderatedBy.name ?? detail.moderatedBy.email}`}
                  .
                </>
              ) : (
                "Nobody has acted on this review yet."
              )}
            </p>
          </div>

          {/* The fetch failed. Everything above still drew from the row, so the
              panel is degraded rather than broken — and the retry is next to
              the explanation rather than at the top of the page. */}
          {error && (
            <div className="border-outline-variant flex flex-wrap items-center gap-3 rounded-xl border p-3">
              <Icon name="error" size={18} className="text-error shrink-0" />
              <p className="text-on-surface-variant min-w-0 flex-1 text-sm">
                {error}
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="text-primary state-layer inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Icon name="refresh" size={16} />
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </SidePanel>
  );
}
