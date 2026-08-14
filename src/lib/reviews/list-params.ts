import { ReviewStatus } from "@/generated/prisma/enums";

/**
 * The shape of the review moderation queue, read off the URL.
 *
 * The same arrangement the order list uses — see `lib/orders/list-params` — and
 * for the same reason: the page parses these on the server while the toolbar
 * that produces them is a client component, so both sides have to agree about
 * what a legal value is. Not `server-only` for exactly that reason.
 *
 * The date helpers are imported from the order list rather than written again.
 * "Today", "last 7 days" and a custom span mean the same thing whatever is
 * being listed, and a second copy is a second set of timezone bugs.
 */

export {
  DATE_RANGE_OPTIONS,
  describeDateWindow,
  parseRangeKey,
  resolveDateWindow,
  type DateRangeKey,
  type DateWindow,
} from "@/lib/orders/list-params";

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The queue's top-level filter.
 *
 * Four of the five map onto a stored value; `reported` does not, because being
 * reported is not a state a review is *in* — a published review and a hidden
 * one can both be flagged, and a flag is settled without the review moving.
 * So it is its own tab over the same rows, which is also why the counts across
 * these tabs do not add up to the total and are not meant to.
 */
export const REVIEW_TABS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "published", label: "Published" },
  { value: "hidden", label: "Hidden" },
  { value: "reported", label: "Reported" },
] as const;

export type ReviewTab = (typeof REVIEW_TABS)[number]["value"];

const TABS = new Set<string>(REVIEW_TABS.map((tab) => tab.value));

export function parseTab(value: string | undefined): ReviewTab {
  return value && TABS.has(value) ? (value as ReviewTab) : "";
}

/** The stored status a tab stands for, or undefined where it stands for none. */
export function statusForTab(tab: ReviewTab): ReviewStatus | undefined {
  switch (tab) {
    case "pending":
      return ReviewStatus.PENDING;
    case "published":
      return ReviewStatus.PUBLISHED;
    case "hidden":
      return ReviewStatus.HIDDEN;
    default:
      return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* Rating                                                                     */
/* -------------------------------------------------------------------------- */

export const RATING_OPTIONS = [5, 4, 3, 2, 1].map((value) => ({
  value: String(value),
  label: `${value} star${value === 1 ? "" : "s"}`,
}));

export function parseRating(value: string | undefined): number | undefined {
  const n = Number.parseInt(value ?? "", 10);
  return n >= 1 && n <= 5 ? n : undefined;
}

/* -------------------------------------------------------------------------- */
/* Sort                                                                       */
/* -------------------------------------------------------------------------- */

export type ReviewSort = "newest" | "oldest" | "highest" | "lowest" | "reported";

export const SORT_OPTIONS: { value: ReviewSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "highest", label: "Highest rated" },
  { value: "lowest", label: "Lowest rated" },
];

const SORTS = new Set<string>(SORT_OPTIONS.map((option) => option.value));

/**
 * Oldest first while moderating, newest first everywhere else.
 *
 * The same reasoning the order list gives for its Pending tab: a queue is
 * worked from the front, and the review that has been waiting longest is the
 * one the customer is wondering about. A feed is read from the top.
 */
export function defaultSort(tab: ReviewTab): ReviewSort {
  return tab === "pending" || tab === "reported" ? "oldest" : "newest";
}

export function parseSort(value: string | undefined, tab: ReviewTab): ReviewSort {
  return value && SORTS.has(value) ? (value as ReviewSort) : defaultSort(tab);
}

/* -------------------------------------------------------------------------- */
/* Paging                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Twenty per page.
 *
 * A review card is tall — a rating, a title, a body and possibly photographs —
 * so the fifty an order row can afford would be a page nobody reaches the
 * bottom of.
 */
export const PER_PAGE = 20;

export function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
