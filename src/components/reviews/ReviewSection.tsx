import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { RatingStars } from "./RatingStars";
import { ReviewForm } from "./ReviewForm";
import { ReviewList, type ReviewRow } from "./ReviewList";
import type { RatingSummary } from "@/lib/reviews/service";

/**
 * The reviews block on a product page: the summary, the invitation to write,
 * and the reviews themselves.
 *
 * What the invitation says depends on where the viewer stands — signed out, a
 * visitor who has never ordered, or a customer. Saying the same thing to all
 * three would mean offering a form to people who cannot use it, or hiding it
 * from the ones who can.
 *
 * Someone who has already written one sees no form at all: they have said their
 * piece, and the way back to it is the pencil on their own review, which the
 * list pins to the top.
 */
export function ReviewSection({
  productId,
  productSlug,
  summary,
  reviews,
  eligibility,
  viewerId,
}: {
  productId: string;
  productSlug: string;
  summary: RatingSummary;
  reviews: ReviewRow[];
  eligibility: {
    signedIn: boolean;
    /** Has ordered from us at all — the bar for writing anything. */
    canReview: boolean;
    /** Bought this particular product — what the badge records. */
    purchased: boolean;
    own: ReviewRow | null;
  };
  viewerId?: string;
}) {
  return (
    <section className="mt-14" aria-labelledby="reviews-heading">
      <h2
        id="reviews-heading"
        className="text-on-surface text-headline-sm"
      >
        Reviews
      </h2>

      <div className="mt-6 grid gap-8 lg:grid-cols-[18rem_1fr]">
        <div>
          {summary.count === 0 ? (
            <p className="text-on-surface-variant text-sm">Not rated yet.</p>
          ) : (
            <>
              <div className="flex items-baseline gap-3">
                <span className="text-on-surface text-5xl font-light tabular-nums">
                  {summary.average.toFixed(1)}
                </span>
                <div>
                  <RatingStars value={summary.average} size={18} />
                  <p className="text-on-surface-variant mt-1 text-sm">
                    {summary.count} review{summary.count === 1 ? "" : "s"}
                  </p>
                  {/* Stated rather than implied: the average covers everything,
                      and this says how much of it came from owners. */}
                  {summary.verifiedCount > 0 && (
                    <p className="text-tertiary mt-0.5 flex items-center gap-1 text-xs">
                      <Icon name="verified" size={13} />
                      {summary.verifiedCount} verified purchase
                      {summary.verifiedCount === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
              </div>

              {/* Distribution bars. The shape of the spread says something an
                  average cannot — five 3s and a mix of 1s and 5s both average
                  3, and they mean very different things. */}
              <ul className="mt-5 space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const n = summary.distribution[star] ?? 0;
                  const share =
                    summary.count === 0 ? 0 : (n / summary.count) * 100;
                  return (
                    <li key={star} className="flex items-center gap-2 text-xs">
                      <span className="text-on-surface-variant w-8 shrink-0 tabular-nums">
                        {star} ★
                      </span>
                      <span
                        aria-hidden
                        className="bg-surface-container-highest h-2 flex-1 overflow-hidden rounded-full"
                      >
                        <span
                          className="bg-primary block h-full rounded-full"
                          style={{ width: `${share}%` }}
                        />
                      </span>
                      <span className="text-on-surface-variant w-6 shrink-0 text-right tabular-nums">
                        {n}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div>
          {/* Nothing to offer someone who has already reviewed this — the row
              in the list below carries their edit and delete controls. */}
          {!eligibility.own && (
            <div className="border-outline-variant bg-surface-container-low mb-2 rounded-xl border p-5">
              {!eligibility.signedIn ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-on-surface-variant text-sm">
                    Ordered from us before? Sign in to share what you thought.
                  </p>
                  <Link
                    href={`/login?redirectTo=${encodeURIComponent(`/products/${productSlug}`)}`}
                    className="border-outline text-primary state-layer inline-flex h-10 shrink-0 items-center rounded-full border px-5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    Sign in
                  </Link>
                </div>
              ) : !eligibility.canReview ? (
                <p className="text-on-surface-variant flex items-start gap-2 text-sm">
                  <Icon
                    name="shopping_bag"
                    size={18}
                    className="mt-px shrink-0"
                  />
                  {/* The rule stated plainly rather than a disabled form — being
                    told why is more useful than being shown a dead control. */}
                  Reviews are open to customers who have ordered from us. Place
                  an order and you can review anything in the catalogue.
                </p>
              ) : (
                <>
                  <h3 className="text-on-surface mb-3 text-sm font-medium">
                    Write a review
                  </h3>
                  {eligibility.purchased ? (
                    <p className="text-tertiary mb-3 flex items-center gap-1.5 text-xs">
                      <Icon name="verified" size={14} />
                      You bought this, so yours will be marked a verified
                      purchase.
                    </p>
                  ) : (
                    <p className="text-on-surface-variant mb-3 text-xs">
                      You have not bought this one here, so it will not carry a
                      verified-purchase badge.
                    </p>
                  )}
                  <ReviewForm productId={productId} />
                </>
              )}
            </div>
          )}

          <ReviewList
            reviews={reviews}
            productId={productId}
            viewerId={viewerId}
          />
        </div>
      </div>
    </section>
  );
}
