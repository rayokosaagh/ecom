import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import type { OrderView } from "@/lib/orders/list-params";

/**
 * The list while it is being fetched, in the shape it is about to be.
 *
 * Not a spinner. A spinner says "something is happening somewhere"; this says
 * "eight rows are coming, the amount will be here, the badge will be there" —
 * so the page does not jump when they land, and the reader's eye is already in
 * the right place. It follows the view toggle for the same reason: a card
 * skeleton resolving into a table is a worse lie than no skeleton at all.
 *
 * Eight rows regardless of the page size. It is a placeholder, not a promise
 * about the count, and a hundred shimmering rows is its own kind of noise.
 */
const ROWS = 8;

export function OrdersSkeleton({ view }: { view: OrderView }) {
  return view === "table" ? <TableSkeleton /> : <CardSkeleton />;
}

function TableSkeleton() {
  return (
    <div aria-hidden className="overflow-hidden">
      <div className="border-outline-variant flex items-center gap-4 border-b px-4 py-3">
        <Skeleton className="size-4 shrink-0 rounded-sm" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="ml-auto h-3 w-20" />
      </div>

      {Array.from({ length: ROWS }).map((_unused, index) => (
        <div
          key={index}
          className="border-outline-variant flex items-center gap-4 border-b px-4 py-3 last:border-0"
        >
          <Skeleton className="size-4 shrink-0 rounded-sm" />
          <Skeleton className="h-4 w-20 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-3.5 w-20 shrink-0" />
          <Skeleton className="h-3.5 w-8 shrink-0" />
          <Skeleton className="h-3.5 w-16 shrink-0" />
          <Skeleton className="h-6 w-24 shrink-0 rounded-full" />
          <Skeleton className="size-9 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function CardSkeleton() {
  return (
    <ul aria-hidden className="space-y-3">
      {Array.from({ length: ROWS }).map((_unused, index) => (
        <li key={index}>
          <Card variant="outlined">
            <div className="flex items-center gap-3 p-4">
              <Skeleton className="size-4 shrink-0 rounded-sm" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-4 w-20 shrink-0" />
              <Skeleton className="h-7 w-24 shrink-0 rounded-full" />
              <Skeleton className="size-9 shrink-0 rounded-full" />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
