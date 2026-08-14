import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Icon } from "@/components/ui/Icon";
import { Pagination } from "@/components/products/Pagination";
import { EmptyState } from "@/components/admin/EmptyState";
import { FilterPills } from "@/components/admin/FilterPills";
import { ListToolbar } from "@/components/admin/ListToolbar";
import { ReviewsQueue } from "@/components/admin/reviews/ReviewsQueue";
import {
  ReviewsSkeleton,
  ReviewsSummarySkeleton,
} from "@/components/admin/reviews/ReviewsSkeleton";
import {
  RatingBreakdown,
  ReviewsSummary,
} from "@/components/admin/reviews/ReviewsSummary";
import type { ReviewCardRow } from "@/components/admin/reviews/types";
import { requireAdmin } from "@/lib/auth/dal";
import {
  getReviewQueueCounts,
  getReviewStats,
  getReviewedProducts,
  getReviewsForAdmin,
  type AdminReviewRow,
} from "@/lib/reviews/service";
import {
  DATE_RANGE_OPTIONS,
  RATING_OPTIONS,
  REVIEW_TABS,
  SORT_OPTIONS,
  describeDateWindow,
  parsePage,
  parseRating,
  parseRangeKey,
  parseSort,
  parseTab,
  resolveDateWindow,
} from "@/lib/reviews/list-params";

export const metadata: Metadata = { title: "Reviews" };

const BASE_PATH = "/admin/reviews";

/**
 * Every param this screen reads.
 *
 * `status` carries the tab rather than a `ReviewStatus`, because one of the
 * five tabs — Reported — is not a status at all. See `REVIEW_TABS`.
 */
interface ReviewParams {
  status?: string;
  q?: string;
  product?: string;
  rating?: string;
  range?: string;
  sort?: string;
  page?: string;
}

/** Rebuild the query string, overriding some keys and dropping any set to null. */
function queryString(
  params: ReviewParams,
  overrides: Record<string, string | null> = {},
) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...overrides })) {
    if (value) next.set(key, String(value));
  }
  return next.toString();
}

function hrefWith(params: ReviewParams, overrides: Record<string, string | null>) {
  const search = queryString(params, overrides);
  return search ? `${BASE_PATH}?${search}` : BASE_PATH;
}

/**
 * The filters, as the service takes them.
 *
 * One place, used by the list, the tab counts and the empty state, so the three
 * cannot end up describing different sets of reviews.
 */
function filtersFrom(params: ReviewParams) {
  return {
    query: params.q?.trim() || undefined,
    productId: params.product || undefined,
    rating: parseRating(params.rating),
    window: resolveDateWindow(
      parseRangeKey(params.range),
      undefined,
      undefined,
      new Date(),
    ),
  };
}

/**
 * The review moderation queue.
 *
 * Laid out the way the order list is, and for the same reasons: the filters
 * live in the URL so a view can be linked, bookmarked and reloaded; the
 * counting, the searching and the paging happen on the server; and the parts
 * that need their own query sit behind their own `Suspense` so a slow count
 * cannot hold up the rows.
 *
 * The keys on those boundaries are what make the skeletons appear on a *filter
 * change* rather than only on first load — a Suspense boundary remounts when
 * its key changes.
 */
export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<ReviewParams>;
}) {
  // The layout checks the session, but layouts do not re-render on every
  // navigation — so the page enforces the admin gate itself. Everything below
  // is moderation, which is exactly what this gate exists for: a customer who
  // reaches this URL is redirected rather than shown a read-only copy.
  await requireAdmin();

  const params = await searchParams;
  const tab = parseTab(params.status);

  // Every key that changes *which* reviews come back.
  const resultsKey = [
    tab,
    params.q,
    params.product,
    params.rating,
    params.range,
    params.sort,
    params.page,
  ]
    .map((value) => value ?? "")
    .join("|");

  // The rail counts move with the search and the filters but not with the tab
  // or the page, so picking a tab does not re-suspend them.
  const countsKey = [params.q, params.product, params.rating, params.range]
    .map((value) => value ?? "")
    .join("|");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">Reviews</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          Manage customer feedback and product ratings.
        </p>
      </div>

      {/* The overview. Its own boundary because it counts the whole table and
          has nothing to do with which page of the queue is showing — no key, so
          it is not re-suspended by a filter change, only re-rendered. */}
      <Suspense fallback={<ReviewsSummarySkeleton />}>
        <Overview params={params} />
      </Suspense>

      <Suspense fallback={<div className="h-10" />}>
        <StatusRail key={countsKey} params={params} />
      </Suspense>

      <Suspense fallback={<div className="h-11" />}>
        <Toolbar />
      </Suspense>

      <Suspense key={resultsKey} fallback={<ReviewsSkeleton />}>
        <Results params={params} />
      </Suspense>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

async function Overview({ params }: { params: ReviewParams }) {
  const stats = await getReviewStats();

  // Nothing to summarise, and five zeroes plus an empty set of bars is a worse
  // answer than the list's own "no reviews yet" a screen below.
  if (stats.total === 0) return null;

  return (
    <div className="space-y-3">
      <ReviewsSummary
        stats={stats}
        // Picking a figure keeps the search and the filters that are already
        // on, and drops the page — page 4 of All is not page 4 of Pending.
        hrefFor={(value) => hrefWith(params, { status: value || null, page: null })}
      />
      <RatingBreakdown stats={stats} />
    </div>
  );
}

async function StatusRail({ params }: { params: ReviewParams }) {
  const counts = await getReviewQueueCounts(filtersFrom(params));

  return (
    <FilterPills
      label="Filter by status"
      param="status"
      basePath={BASE_PATH}
      // `page` and `sort` are dropped for the reason the order list drops
      // them: page 4 of Published is not page 4 of Pending, and the Pending
      // tab has its own oldest-first default to fall back to.
      params={{ ...params, page: undefined, sort: undefined }}
      options={REVIEW_TABS.map((entry) => ({
        value: entry.value,
        label: entry.label,
        count: counts[entry.value === "" ? "all" : entry.value],
      }))}
    />
  );
}

async function Toolbar() {
  const products = await getReviewedProducts();

  return (
    <ListToolbar
      searchLabel="Search reviews, products, customers or an order reference"
      // The pills own `status`; without this, Clear would wipe the search and
      // the dropdowns while quietly leaving the tab where it was.
      alsoClear={["status"]}
      filters={[
        // Only products that have been reviewed — a dropdown of the whole
        // catalogue would be mostly options that filter the list to nothing.
        ...(products.length > 0
          ? [
              {
                param: "product",
                label: "Product",
                options: products.map((product) => ({
                  value: product.id,
                  label: `${product.name} (${product.count})`,
                })),
              },
            ]
          : []),
        { param: "rating", label: "Rating", options: RATING_OPTIONS },
        {
          param: "status",
          label: "Status",
          // The same param the pills above write, so the two are one control
          // in two places rather than two states to keep in step.
          options: REVIEW_TABS.filter((entry) => entry.value !== "").map((entry) => ({
            value: entry.value,
            label: entry.label,
          })),
        },
        {
          param: "range",
          label: "Date",
          // No custom range: this list is worked by recency, not by reporting
          // period, and a pair of date fields for a queue somebody clears every
          // morning is furniture.
          options: DATE_RANGE_OPTIONS.filter((option) => option.value !== "custom"),
        },
        {
          param: "sort",
          label: "Sort",
          options: SORT_OPTIONS,
          emptyLabel: "Sort: default",
        },
      ]}
    />
  );
}

async function Results({ params }: { params: ReviewParams }) {
  const tab = parseTab(params.status);
  const filters = filtersFrom(params);

  const { reviews, total, totalPages, page, perPage } = await getReviewsForAdmin({
    ...filters,
    tab,
    sort: parseSort(params.sort, tab),
    page: parsePage(params.page),
  });

  if (total === 0) return <NoResults tab={tab} params={params} />;

  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);
  const rangeLabel = describeDateWindow(parseRangeKey(params.range), filters.window);

  return (
    <div className="space-y-3">
      <p className="text-on-surface-variant px-1 text-xs">
        Showing <span className="tabular-nums">{first}</span>–
        <span className="tabular-nums">{last}</span> of{" "}
        <span className="tabular-nums">{total}</span> review{total === 1 ? "" : "s"}
        {rangeLabel && ` · ${rangeLabel}`}
      </p>

      <ReviewsQueue rows={reviews.map(toCardRow)} canModerate />

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        hrefFor={(n) => hrefWith(params, { page: String(n) })}
      />
    </div>
  );
}

/**
 * The database row as the client list needs it.
 *
 * The mapping is the boundary: the queue is a client component, so what crosses
 * into it should be what a card draws rather than every column the query
 * happened to select. It is also where the author's display name is settled —
 * an account with no name shows its email, which is what the storefront's own
 * review list does.
 */
function toCardRow(review: AdminReviewRow): ReviewCardRow {
  return {
    id: review.id,
    rating: review.rating,
    title: review.title,
    body: review.body,
    verified: review.verified,
    status: review.status,
    createdAt: review.createdAt,
    moderatedAt: review.moderatedAt,
    author: {
      name: review.user.name ?? review.user.email,
      email: review.user.email,
    },
    product: review.product,
    media: review.media,
    helpfulCount: review._count.likes,
    replyCount: review._count.replies,
    reports: review.reports.map((report) => ({
      id: report.id,
      reason: report.reason,
      note: report.note,
    })),
  };
}

/**
 * Why the list is empty, rather than merely that it is.
 *
 * Four situations wearing the same blank space: a search that matched nothing,
 * a queue that has been cleared, a tab standing on a state nothing is in, and a
 * shop nobody has reviewed yet. Only the last is a fact about the shop, and
 * telling a new one "nothing matches those filters" would send an admin looking
 * for a bug.
 */
function NoResults({ tab, params }: { tab: string; params: ReviewParams }) {
  const narrowed = Boolean(
    params.q || params.product || params.rating || params.range,
  );

  const clearHref = hrefWith(params, {
    q: null,
    product: null,
    rating: null,
    range: null,
    page: null,
  });

  const clearAction = (
    <Link
      href={clearHref}
      className="text-primary state-layer inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <Icon name="filter_alt_off" size={18} />
      Clear filters
    </Link>
  );

  if (narrowed) {
    return (
      <EmptyState
        icon={params.q ? "search_off" : "filter_alt_off"}
        title={params.q ? `No reviews match “${params.q}”` : "No reviews found"}
        description={
          params.q
            ? "Searches cover the review's title and body, the product's name, the customer's name and email, and the reference of the order they bought it on."
            : "Try changing your search or filters."
        }
        action={clearAction}
      />
    );
  }

  // An empty queue is good news, and each one is a different piece of it.
  if (tab === "pending") {
    return (
      <EmptyState
        icon="task_alt"
        title="You’re all caught up"
        description="There are no reviews waiting for moderation. Reviews from customers who did not buy the product wait here for approval; verified purchases publish themselves."
      />
    );
  }

  if (tab === "reported") {
    return (
      <EmptyState
        icon="flag"
        title="Nothing has been reported"
        description="Reviews flagged by shoppers land here with the reason they were flagged, so you can hide them or dismiss the complaint."
      />
    );
  }

  if (tab === "hidden") {
    return (
      <EmptyState
        icon="visibility"
        title="Nothing is hidden"
        description="Reviews you take off the product page stay here, so a decision can be looked at again or undone."
      />
    );
  }

  if (tab === "published") {
    return (
      <EmptyState
        icon="reviews"
        title="Nothing is published yet"
        description="Approved reviews appear here, and on the product page they were written about."
      />
    );
  }

  return (
    <EmptyState
      icon="reviews"
      title="No reviews yet"
      description="Customer reviews will appear here once customers start reviewing products. Writing one takes a completed order, so these begin arriving after your first sales."
    />
  );
}
