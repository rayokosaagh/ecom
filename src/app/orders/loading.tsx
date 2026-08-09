import { NavbarSkeleton, Skeleton } from "@/components/ui/Skeleton";

/** Order history loading state — a stack of order cards, not a product grid. */
export default function Loading() {
  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <NavbarSkeleton />

      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <Skeleton className="h-9 w-48" />

        <div className="mt-8 space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="border-outline-variant bg-surface space-y-4 rounded-xl border p-5"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-7 w-24 rounded-full" />
              </div>

              {Array.from({ length: 2 }).map((__, line) => (
                <div key={line} className="flex items-center gap-3">
                  <Skeleton className="size-10 shrink-0 rounded-lg" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-16 shrink-0" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
