import { NavbarSkeleton, Skeleton } from "@/components/ui/Skeleton";

/**
 * Product detail loading state.
 *
 * The two-column grid and the gallery's square are held at their real sizes,
 * because those are the two things that would otherwise reflow the whole page
 * when the image arrives.
 */
export default function Loading() {
  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <NavbarSkeleton />

      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <Skeleton className="h-4 w-48" />

        <div className="mt-8 grid gap-10 lg:grid-cols-2">
          <div className="space-y-3">
            <Skeleton className="aspect-square w-full rounded-xl" />
            <div className="flex gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="size-20 rounded-lg" />
              ))}
            </div>
          </div>

          <div>
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-3 h-9 w-3/4" />
            <Skeleton className="mt-4 h-8 w-32" />
            <Skeleton className="mt-2 h-4 w-24" />

            <div className="mt-6 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>

            {/* Variant pickers and the add-to-cart row. */}
            <div className="mt-8 space-y-4">
              <Skeleton className="h-4 w-20" />
              <div className="flex gap-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-24 rounded-full" />
                ))}
              </div>
              <Skeleton className="h-10 w-40 rounded-full" />
            </div>
          </div>
        </div>

        {/* Spec table */}
        <div className="mt-16">
          <Skeleton className="h-8 w-56" />
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-2xl" />
            ))}
          </div>
          <div className="mt-10 grid gap-x-14 gap-y-10 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-3">
                <Skeleton className="h-3 w-28" />
                {Array.from({ length: 4 }).map((__, row) => (
                  <Skeleton key={row} className="h-4 w-full" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
