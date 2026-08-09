import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { RatingStars } from "@/components/reviews/RatingStars";
import { ReviewModeration } from "@/components/reviews/ReviewModeration";
import { ReviewMediaGallery } from "@/components/reviews/ReviewMediaGallery";
import { requireAdmin } from "@/lib/auth/dal";
import { getReviewCounts, getReviewsForAdmin } from "@/lib/reviews/service";
import { cn } from "@/lib/cn";
import { ReviewStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Reviews" };

const STATUSES = [ReviewStatus.PUBLISHED, ReviewStatus.HIDDEN] as const;

function isStatus(value: string | undefined): value is ReviewStatus {
  return STATUSES.includes(value as ReviewStatus);
}

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // The layout checks the session, but layouts do not re-render on every
  // navigation — so the page enforces the admin gate itself.
  await requireAdmin();

  const { status } = await searchParams;
  const active = isStatus(status) ? status : undefined;

  const [reviews, counts] = await Promise.all([
    getReviewsForAdmin(active),
    getReviewCounts(),
  ]);

  const total = counts.PUBLISHED + counts.HIDDEN;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">Reviews</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          {total === 0
            ? "Reviews appear here once customers start writing them."
            : "Anyone who has ordered can review; “Verified” means they bought that item. Hiding takes a review off the product page and out of its rating."}
        </p>
      </div>

      {/* Same pill language as the orders screen. */}
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        <Link
          href="/admin/reviews"
          aria-current={active ? undefined : "true"}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200",
            "focus-visible:outline-2 focus-visible:outline-offset-2",
            active
              ? "text-on-surface-variant hover:bg-on-surface/[0.06]"
              : "bg-secondary-container text-on-secondary-container",
          )}
        >
          All <span className="opacity-60">{total}</span>
        </Link>
        {STATUSES.map((value) => (
          <Link
            key={value}
            href={`/admin/reviews?status=${value}`}
            aria-current={active === value ? "true" : undefined}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium capitalize transition-colors duration-200",
              "focus-visible:outline-2 focus-visible:outline-offset-2",
              active === value
                ? "bg-secondary-container text-on-secondary-container"
                : "text-on-surface-variant hover:bg-on-surface/[0.06]",
            )}
          >
            {value.toLowerCase()} <span className="opacity-60">{counts[value]}</span>
          </Link>
        ))}
      </nav>

      {reviews.length === 0 ? (
        <Card variant="outlined">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon name="reviews" size={40} className="text-on-surface-variant" />
            <p className="text-on-surface">
              {active ? `Nothing ${active.toLowerCase()}` : "No reviews yet"}
            </p>
            <p className="text-on-surface-variant max-w-sm text-sm">
              Writing a review takes a completed order, so these start arriving
              once customers do.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {reviews.map((review) => (
            <li key={review.id}>
              <Card variant="outlined">
                <div className="flex flex-wrap items-start gap-4 p-4">
                  <span className="bg-surface-container-highest size-14 shrink-0 overflow-hidden rounded-lg">
                    {review.product.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={review.product.image}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="text-on-surface-variant grid size-full place-items-center">
                        <Icon name="image" size={20} />
                      </span>
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={`/products/${review.product.slug}`}
                        className="text-on-surface rounded-sm text-sm font-medium hover:underline focus-visible:outline-2"
                      >
                        {review.product.name}
                      </Link>
                      {review.verified && (
                        <span className="text-tertiary inline-flex items-center gap-1 text-xs">
                          <Icon name="verified" size={13} />
                          Verified
                        </span>
                      )}
                      {review.status === ReviewStatus.HIDDEN && (
                        <span className="bg-error-container text-on-error-container inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
                          <Icon name="visibility_off" size={12} />
                          Hidden
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <RatingStars value={review.rating} size={14} />
                      <span className="text-on-surface-variant text-xs">
                        {review.rating}/5 · {review.user.name ?? review.user.email} ·{" "}
                        {review.createdAt.toLocaleDateString("en-US", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    {review.title && (
                      <p className="text-on-surface mt-2 text-sm font-medium">
                        {review.title}
                      </p>
                    )}
                    <p className="text-on-surface-variant mt-1 text-sm leading-relaxed whitespace-pre-line">
                      {review.body}
                    </p>

                    {/* Attachments are the part most likely to need moderating,
                        so they are shown here rather than only on the storefront
                        — deciding on a review you cannot fully see is guesswork. */}
                    <ReviewMediaGallery media={review.media} />
                  </div>

                  <ReviewModeration reviewId={review.id} status={review.status} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
