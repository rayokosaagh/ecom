import {
  NavbarSkeleton,
  ProductCardSkeleton,
  Skeleton,
} from "@/components/ui/Skeleton";

/**
 * Catalogue loading state.
 *
 * Mirrors the real page's structure — header, toolbar, facet rails, sidebar,
 * grid — so the swap to real content is a fill rather than a re-layout. The
 * count of placeholder cards is arbitrary but stable; matching the eventual
 * result count is impossible and guessing low would shrink the page twice.
 */
export default function Loading() {
  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <NavbarSkeleton />

      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-4 h-12 w-80 max-w-full" />
        <Skeleton className="mt-3 h-4 w-24" />

        {/* Toolbar */}
        <Skeleton className="mt-6 h-14 w-full rounded-xl" />

        {/* Category pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-28 rounded-full" />
          ))}
        </div>

        {/* Brand bar */}
        <div className="border-outline-variant mt-6 flex gap-2 overflow-hidden border-y py-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-11 w-32 shrink-0 rounded-full" />
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-8 lg:flex-row">
          {/* Spec sidebar — only rendered from lg up, matching the real one. */}
          <div className="hidden lg:block lg:w-64 lg:shrink-0">
            <Skeleton className="mb-2 h-3 w-16" />
            <div className="border-outline-variant divide-outline-variant divide-y rounded-xl border">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-2.5 p-3">
                  <Skeleton className="size-5 rounded" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <Skeleton className="mb-4 h-4 w-24" />
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
