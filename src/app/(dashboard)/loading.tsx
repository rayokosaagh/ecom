import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Dashboard loading state.
 *
 * No navbar placeholder here, unlike the storefront routes: the dashboard's
 * chrome lives in its layout, which persists across navigation — only the
 * panel is replaced.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32 rounded-full" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="border-outline-variant bg-surface flex items-center gap-4 rounded-xl border p-4"
          >
            <Skeleton className="size-12 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="size-9 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
