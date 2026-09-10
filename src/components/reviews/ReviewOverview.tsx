import { Icon } from "@/components/ui/Icon";
import type { RatingSummary } from "@/lib/reviews/service";
import type { ReviewRow } from "./ReviewList";
import { ReviewMediaGallery } from "./ReviewMediaGallery";
import { RatingStars } from "./RatingStars";

export function ReviewOverview({
  summary,
  reviews,
}: {
  summary: RatingSummary;
  reviews: ReviewRow[];
}) {
  // The list can include the viewer's unpublished review. Only public media
  // belongs in the shared customer gallery.
  const media = reviews
    .filter((review) => review.status === "PUBLISHED")
    .flatMap((review) => review.media)
    .slice(0, 6);
  const highRatings = (summary.distribution[4] ?? 0) + (summary.distribution[5] ?? 0);

  return (
    <aside aria-label="Review overview" className="min-w-0 space-y-4">
      <div className="border-outline-variant/70 bg-surface-container-low overflow-hidden rounded-2xl border">
        <div className="p-6">
          <h3 className="text-on-surface-variant text-xs font-semibold tracking-widest uppercase">
            Customer rating
          </h3>
          {summary.count > 0 ? (
            <>
              <div className="mt-4 flex items-center gap-4">
                <p className="text-on-surface text-6xl font-light tracking-tight tabular-nums">
                  {summary.average.toFixed(1)}
                  <span className="sr-only"> out of 5</span>
                </p>
                <div>
                  <RatingStars value={summary.average} size={19} />
                  <p className="text-on-surface-variant mt-2 text-xs">
                    Based on {summary.count} review{summary.count === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <ul aria-label="Rating breakdown" className="mt-6 space-y-3">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = summary.distribution[star] ?? 0;
                  return (
                    <li key={star} className="flex items-center gap-3 text-xs">
                      <span className="text-on-surface-variant flex w-7 shrink-0 items-center gap-1 tabular-nums">
                        {star}<Icon name="star" size={12} filled />
                        <span className="sr-only"> stars:</span>
                      </span>
                      <span aria-hidden className="bg-surface-container-highest h-2 flex-1 overflow-hidden rounded-full">
                        <span className="bg-primary block h-full rounded-full" style={{ width: `${(count / summary.count) * 100}%` }} />
                      </span>
                      <span className="text-on-surface-variant w-7 text-right tabular-nums">
                        {count}<span className="sr-only"> reviews</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="border-outline-variant/70 mt-6 flex items-center gap-3 border-t pt-5">
                <span className="bg-primary-container text-on-primary-container grid size-10 shrink-0 place-items-center rounded-xl">
                  <Icon name="star" size={20} />
                </span>
                <p className="text-on-surface-variant text-xs leading-relaxed">
                  <span className="text-on-surface block text-base font-semibold tabular-nums">
                    {Math.round((highRatings / summary.count) * 100)}% of reviews
                  </span>
                  rated this product 4 or 5 stars
                </p>
              </div>
            </>
          ) : (
            <div className="mt-5">
              <span className="bg-primary-container text-on-primary-container grid size-12 place-items-center rounded-2xl">
                <Icon name="reviews" size={25} />
              </span>
              <p className="text-on-surface mt-4 text-xl font-medium">Every opinion starts something.</p>
              <p className="text-on-surface-variant mt-2 text-sm leading-relaxed">
                No ratings yet. Your experience could help the next customer decide.
              </p>
            </div>
          )}
        </div>
        <div className="border-outline-variant/70 bg-surface-container border-t px-6 py-4">
          <p className="text-tertiary flex items-center gap-2 text-xs font-medium">
            <Icon name="verified" size={16} />
            {summary.verifiedCount > 0
              ? `${summary.verifiedCount} verified purchase${summary.verifiedCount === 1 ? "" : "s"}`
              : "Look for the verified badge"}
          </p>
          <p className="text-on-surface-variant mt-2 text-xs leading-relaxed">
            Verified reviewers bought this product from us.
          </p>
        </div>
      </div>

      <div className="border-outline-variant/70 rounded-2xl border p-5">
        <div className="text-primary mb-3 flex items-center gap-2">
          <Icon name="photo_camera" size={20} />
          <span className="text-xs font-semibold tracking-widest uppercase">Real-life details</span>
        </div>
        <h3 className="text-on-surface text-base font-semibold">Through customers&apos; eyes</h3>
        {media.length > 0 ? (
          <>
            <p className="text-on-surface-variant mt-1.5 text-xs leading-relaxed">
              A closer look, shared in customer reviews. Tap to explore.
            </p>
            <ReviewMediaGallery media={media} className="grid grid-cols-3" thumbClassName="aspect-square w-full" />
          </>
        ) : (
          <div className="bg-surface-container-low mt-4 rounded-xl p-4">
            <p className="text-on-surface text-sm font-medium">Show it in your everyday.</p>
            <p className="text-on-surface-variant mt-2 text-xs leading-relaxed">
              No customer photos or videos yet. Add a photo or clip to your review to share the details that matter to you.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
