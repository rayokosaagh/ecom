import type { ReviewMediaView } from "@/components/reviews/ReviewMediaGallery";

/**
 * What one row of the moderation queue carries into the browser.
 *
 * Declared here rather than inferred from the Prisma query, because the query
 * lives in a `server-only` module and the list is a client component. Naming
 * the shape at the boundary also keeps the payload deliberate: the queue sends
 * what a card draws, not every column the row happens to have.
 */
export type ReviewStatusValue = "PENDING" | "PUBLISHED" | "HIDDEN";

export interface ReviewReportSummary {
  id: string;
  reason: string;
  note: string | null;
}

export interface ReviewCardRow {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  verified: boolean;
  status: ReviewStatusValue;
  createdAt: Date;
  /** Null while nobody has decided anything about it — the Pending queue's tell. */
  moderatedAt: Date | null;
  author: { name: string; email: string };
  product: { id: string; name: string; slug: string; image: string | null };
  media: ReviewMediaView[];
  /** Likes, under the name the rest of the world calls them. */
  helpfulCount: number;
  replyCount: number;
  /** Open reports only. An empty array is a review nobody has flagged. */
  reports: ReviewReportSummary[];
}

/**
 * The panel's payload, as it arrives from `/api/admin/reviews/[id]`.
 *
 * Dates are strings here and that is not an oversight: this crosses the wire as
 * JSON, which has no date type, so pretending otherwise with a `Date` in the
 * type would be a lie the formatter finds out about at runtime.
 */
export interface ReviewDetailPayload {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  verified: boolean;
  status: ReviewStatusValue;
  createdAt: string;
  updatedAt: string;
  moderatedAt: string | null;
  moderatedBy: { name: string | null; email: string } | null;
  user: { name: string | null; email: string; image: string | null };
  product: { id: string; name: string; slug: string; image: string | null };
  media: ReviewMediaView[];
  _count: { likes: number; replies: number };
  reports: {
    id: string;
    reason: string;
    note: string | null;
    createdAt: string;
    resolvedAt: string | null;
    user: { name: string | null; email: string };
  }[];
  replies: {
    id: string;
    body: string;
    status: ReviewStatusValue;
    createdAt: string;
    user: { name: string | null; email: string };
  }[];
  order: { reference: string; placedAt: string; status: string } | null;
  productRating: { average: number; count: number } | null;
}
