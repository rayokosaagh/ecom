import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Sign-in and registration loading state.
 *
 * Overrides the root fallback, which carries a top-bar placeholder these
 * routes never render — inheriting it would flash a navbar that then vanishes.
 */
export default function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="border-outline-variant bg-surface w-full max-w-sm space-y-5 rounded-xl border p-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-14 w-full rounded-sm" />
        <Skeleton className="h-14 w-full rounded-sm" />
        <Skeleton className="h-10 w-full rounded-full" />
        <Skeleton className="mx-auto h-4 w-48" />
      </div>
    </div>
  );
}
