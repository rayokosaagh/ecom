import { cn } from "@/lib/cn";

/**
 * Placeholder box for loading UI.
 *
 * `text-on-surface` is load-bearing rather than decorative: the shimmer
 * overlay in globals.css is built from `currentColor`, so the sweep picks up
 * the theme's foreground and reads correctly in both light and dark without a
 * second definition.
 *
 * Marked `aria-hidden` throughout — the route's own `loading.tsx` announces
 * itself, and a screen reader reading out two dozen empty boxes is noise.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "skeleton text-on-surface bg-on-surface/[0.07] block rounded-md",
        className,
      )}
    />
  );
}

/** The card placeholder, shaped like `ProductCard` so nothing jumps on swap. */
export function ProductCardSkeleton() {
  return (
    <div className="border-outline-variant bg-surface overflow-hidden rounded-xl border">
      <Skeleton className="aspect-square rounded-none" />
      <div className="space-y-2 p-3 sm:p-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

/**
 * Stand-in for the top app bar.
 *
 * Every storefront page renders its own `Navbar`, so a route's loading UI
 * replaces it — without this the bar would vanish for the length of the fetch
 * and the whole page would jump 64px when it came back.
 */
export function NavbarSkeleton() {
  return (
    <div className="bg-surface-container border-outline-variant/50 sticky top-0 z-50 w-full border-b">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-3 sm:px-6">
        <Skeleton className="size-9 rounded-xl" />
        <Skeleton className="hidden h-4 w-16 sm:block" />
        <div className="flex-1" />
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>
    </div>
  );
}
