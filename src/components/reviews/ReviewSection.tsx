import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { ReviewOverview } from "./ReviewOverview";
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
    <section className="border-outline-variant/70 mt-14 border-t pt-10" aria-labelledby="reviews-heading">
      <h2
        id="reviews-heading"
        className="text-on-surface text-headline-sm"
      >
        Customer reviews
      </h2>
      <p className="text-on-surface-variant mt-2 text-sm">
        A little insight from people who have tried it.
      </p>

      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-8">
        <ReviewOverview summary={summary} reviews={reviews} />

        <div className="border-outline-variant/70 min-w-0 rounded-2xl border p-4 sm:p-6">
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
                    // Both halves of the rule, said before they start writing
                    // rather than after they press Post — see
                    // `lib/reviews/policy`. Somebody who learns their review is
                    // held for approval only once it has disappeared reads that
                    // as the site losing it.
                    <p className="text-on-surface-variant mb-3 flex items-start gap-1.5 text-xs">
                      <Icon name="schedule" size={14} className="mt-px shrink-0" />
                      You have not bought this one here, so yours carries no
                      verified-purchase badge and goes to a moderator before it
                      appears.
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
