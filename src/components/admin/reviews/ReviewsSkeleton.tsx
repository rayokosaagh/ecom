import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * The queue while it is being fetched, in the shape it is about to be.
 *
 * The same reasoning `OrdersSkeleton` sets out: a spinner says something is
 * happening somewhere, this says a thumbnail is coming here, two lines of
 * writing there and the buttons on the right — so nothing jumps when the rows
 * land and the reader's eye is already in the right place.
 *
 * Five rows regardless of the page size. It is a placeholder, not a promise
 * about the count.
 */
const ROWS = 5;

export function ReviewsSkeleton() {
  return (
    <ul aria-hidden className="space-y-3">
      {Array.from({ length: ROWS }).map((_unused, index) => (
        <li key={index}>
          <Card variant="outlined">
            <div className="flex items-start gap-4 p-4">
              <Skeleton className="size-14 shrink-0 rounded-lg" />

              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-4/5" />
              </div>

              <div className="hidden shrink-0 gap-2 sm:flex">
                <Skeleton className="h-9 w-24 rounded-full" />
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** The figures above the queue, while they are being counted. */
export function ReviewsSummarySkeleton() {
  return (
    <Card variant="outlined" aria-hidden className="overflow-hidden">
      <div className="divide-outline-variant grid grid-cols-2 divide-x divide-y sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
        {Array.from({ length: 5 }).map((_unused, index) => (
          <div key={index} className="space-y-2 px-4 py-3.5">
            <Skeleton className="h-5 w-14" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </Card>
  );
}
