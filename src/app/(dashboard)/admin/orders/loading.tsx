import { Skeleton } from "@/components/ui/Skeleton";
import { OrdersSkeleton } from "@/components/admin/orders/OrdersSkeleton";

/**
 * The first paint, before any params are known.
 *
 * The route-level fallback covers arriving at the page; the `Suspense`
 * boundaries inside it cover every filter and page change after that. This one
 * cannot read `searchParams`, so it assumes the table — which is the default
 * view, and therefore right for anyone who has not chosen otherwise.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-28 rounded-full" />
      </div>

      <Skeleton className="h-11 w-full rounded-full sm:max-w-md" />

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-36 rounded-full" />
        <Skeleton className="h-9 w-32 rounded-full" />
        <Skeleton className="h-9 w-32 rounded-full" />
        <Skeleton className="ml-auto h-9 w-20 rounded-full" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_unused, index) => (
          <Skeleton key={index} className="h-10 w-24 rounded-full" />
        ))}
      </div>

      <OrdersSkeleton view="table" />
    </div>
  );
}
