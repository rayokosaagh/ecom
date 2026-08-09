import { NavbarSkeleton, Skeleton } from "@/components/ui/Skeleton";

/** Cart loading state — line items beside the summary card. */
export default function Loading() {
  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <NavbarSkeleton />

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <Skeleton className="h-9 w-40" />

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
          <ul className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <li
                key={index}
                className="border-outline-variant bg-surface flex items-center gap-4 rounded-xl border p-4"
              >
                <Skeleton className="size-20 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-9 w-28 rounded-full" />
              </li>
            ))}
          </ul>

          <div className="border-outline-variant bg-surface h-fit space-y-4 rounded-xl border p-5">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-10 w-full rounded-full" />
          </div>
        </div>
      </main>
    </div>
  );
}
