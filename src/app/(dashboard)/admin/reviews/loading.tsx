import { Skeleton } from "@/components/ui/Skeleton";
import {
  ReviewsSkeleton,
  ReviewsSummarySkeleton,
} from "@/components/admin/reviews/ReviewsSkeleton";

/**
 * The first paint, before any params are known.
 *
 * The route-level fallback covers arriving at the page; the `Suspense`
 * boundaries inside it cover every filter, tab and page change after that. The
 * shape is the page's own — figures, breakdown, tabs, toolbar, queue — so
 * nothing moves as the real thing lands on top of it.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="space-y-3">
        <ReviewsSummarySkeleton />
        <Skeleton className="h-[9.5rem] w-full rounded-xl" />
      </div>

      {/* Status pills. The widths differ because the labels do — a rail of five
          identical pills is a placeholder for a control this page has not
          got. Written out rather than computed, since Tailwind only emits the
          classes it can see. */}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 w-16 rounded-full" />
        <Skeleton className="h-10 w-24 rounded-full" />
        <Skeleton className="h-10 w-28 rounded-full" />
        <Skeleton className="h-10 w-22 rounded-full" />
        <Skeleton className="h-10 w-26 rounded-full" />
      </div>

      {/* Search, then the filter row under it */}
      <div className="space-y-3">
        <Skeleton className="h-11 w-full rounded-full sm:max-w-md" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_unused, index) => (
            <Skeleton key={index} className="h-9 w-28 rounded-full" />
          ))}
        </div>
      </div>

      <ReviewsSkeleton />
    </div>
  );
}
