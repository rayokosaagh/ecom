import { NavbarSkeleton, Skeleton } from "@/components/ui/Skeleton";

/** Comparison loading state — header row plus a few spec rows. */
export default function Loading() {
  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <NavbarSkeleton />

      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-4 h-12 w-64" />

        <div className="mt-8">
          <Skeleton className="mb-4 h-4 w-48" />

          <div className="border-outline-variant overflow-hidden rounded-xl border">
            {/* Product column headers */}
            <div className="grid grid-cols-[11rem_repeat(2,minmax(0,1fr))] gap-px">
              <div className="p-3" />
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="border-outline-variant space-y-2 border-l p-3">
                  <Skeleton className="size-20 rounded-lg" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>

            {/* Spec rows */}
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="border-outline-variant grid grid-cols-[11rem_repeat(2,minmax(0,1fr))] gap-px border-t"
              >
                <div className="p-3">
                  <Skeleton className="h-4 w-24" />
                </div>
                {Array.from({ length: 2 }).map((__, cell) => (
                  <div key={cell} className="border-outline-variant border-l p-3">
                    <Skeleton className="h-4 w-28" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
