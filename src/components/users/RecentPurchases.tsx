import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { ProfilePanel } from "@/components/users/ProfilePanel";
import { RatingStars } from "@/components/reviews/RatingStars";
import { ReviewStatus } from "@/generated/prisma/enums";
import type { RecentPurchase } from "@/lib/orders/purchases";

/**
 * What this account has bought, and what it has said about it.
 *
 * A Server Component, like the rest of the read-only profile: every card is
 * either a link to the product or a link to the review form, and neither needs
 * JavaScript to be one. The form itself is a Client Component on its own route.
 *
 * Sits below order history rather than replacing it, because the two answer
 * different questions. History is "what did I order, when, for how much" — a
 * record, by order. This is "what do I own" — by product, deduplicated, and it
 * is the natural place to be asked for a review, because the question only
 * makes sense per product.
 */
export function RecentPurchases({ purchases }: { purchases: RecentPurchase[] }) {
  if (purchases.length === 0) return null;

  return (
    <ProfilePanel
      id="purchases"
      title="Recently purchased"
      blurb="Bought and paid for. Tell other shoppers what you thought."
    >
      <ul className="grid gap-3 sm:grid-cols-2">
          {purchases.map((purchase) => (
            <li
              key={purchase.productId}
              className="border-outline-variant flex items-start gap-3 rounded-lg border p-3"
            >
              <div className="bg-surface-container-highest size-16 shrink-0 overflow-hidden rounded-lg">
                {purchase.image ? (
                  /* Plain <img>, matching every other product thumbnail whose
                     source may be an uploaded file or a pasted address. */
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={purchase.image}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="text-on-surface-variant grid size-full place-items-center">
                    <Icon name="inventory_2" size={22} />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                {/* A delisted product has no page to link to, so the name is
                    plain text rather than a link to a 404. */}
                {purchase.published && purchase.slug ? (
                  <Link
                    href={`/products/${purchase.slug}`}
                    className="text-on-surface hover:text-primary line-clamp-2 rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {purchase.name}
                  </Link>
                ) : (
                  <p className="text-on-surface line-clamp-2 text-sm font-medium">
                    {purchase.name}
                  </p>
                )}

                <p className="text-on-surface-variant mt-0.5 text-xs">
                  {purchase.purchasedAt.toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>

                <div className="mt-2">
                  <ReviewLink purchase={purchase} />
                </div>
              </div>
            </li>
          ))}
      </ul>
    </ProfilePanel>
  );
}

/**
 * The one control on each card, in one of four states.
 *
 * A hidden review is shown as hidden rather than as no review at all: somebody
 * whose writing was moderated should be able to see that it exists and edit it,
 * not be silently invited to write the same thing again.
 */
function ReviewLink({ purchase }: { purchase: RecentPurchase }) {
  // Reviewing requires a published product — `submitReview` refuses otherwise,
  // so offering the form here would be offering a button that cannot work.
  if (!purchase.published) {
    return (
      <p className="text-on-surface-variant flex items-center gap-1.5 text-xs">
        <Icon name="visibility_off" size={14} />
        No longer sold
      </p>
    );
  }

  const href = `/profile/reviews/${purchase.productId}`;

  if (!purchase.review) {
    return (
      <Link
        href={href}
        className="border-outline text-primary state-layer inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Icon name="rate_review" size={16} />
        Write a review
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <RatingStars value={purchase.review.rating} size={14} />
      <span className="sr-only">{purchase.review.rating} out of 5</span>

      {purchase.review.status === ReviewStatus.HIDDEN && (
        <span className="text-on-surface-variant flex items-center gap-1 text-xs">
          <Icon name="visibility_off" size={13} />
          Hidden
        </span>
      )}

      <Link
        href={href}
        className="text-primary rounded-sm text-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Edit review
      </Link>
    </div>
  );
}
