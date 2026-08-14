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

/**
 * The card placeholder, shaped like `ProductCard` so nothing jumps on swap.
 *
 * The body follows the real card's own order — brand and category, name,
 * rating, price, colours — at the same `space-y-1 p-3 sm:p-4` it uses. A card
 * whose placeholder has the wrong number of lines is worse than one with no
 * placeholder at all: the grid settles at one height and then reflows to
 * another the moment the products arrive.
 */
export function ProductCardSkeleton() {
  return (
    <div className="border-outline-variant bg-surface h-full overflow-hidden rounded-xl border">
      <Skeleton className="aspect-square rounded-none" />
      <div className="space-y-2 p-3 sm:p-4">
        {/* Brand mark · category */}
        <Skeleton className="h-3 w-24" />
        {/* Name */}
        <Skeleton className="h-4 w-4/5" />
        {/* Rating */}
        <Skeleton className="h-3 w-20" />
        {/* Price */}
        <Skeleton className="h-5 w-24" />
        {/* Colour swatches */}
        <div className="flex items-center gap-1.5 pt-1">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="size-3.5 rounded-full sm:size-4" />
          ))}
        </div>
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
 *
 * Transparent and borderless, because that is what the real bar looks like at
 * the top of a page: it only takes its blurred surface and its bottom rule once
 * the page has scrolled past 10px, and a loading state is by definition showing
 * the top. A filled bar here was a band of colour that drained away the moment
 * the real one mounted.
 *
 * The controls are placed where the real ones are, at the widths they appear
 * at: two menu triggers from `md`, then the icon cluster, with the wishlist and
 * stores glyphs only from `sm` and the hamburger only below `md`.
 */
export function NavbarSkeleton() {
  return (
    <div className="sticky top-0 z-50 w-full border-b border-transparent">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:px-6">
        {/* Logo, then the wordmark it carries from `sm` up. */}
        <Skeleton className="size-9 shrink-0 rounded-xl" />
        <Skeleton className="hidden h-4 w-16 sm:block" />

        {/* Products and Brands. Both are hover menus rather than links, but at
            rest they are the same two pills. */}
        <div className="ml-2 hidden items-center gap-1 md:flex">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-20 rounded-full" />
        </div>

        <div className="ml-auto flex items-center gap-1">
          {/* Search, notifications */}
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="size-10 rounded-full" />
          {/* Wishlist — `sm:grid` on the real bar */}
          <Skeleton className="hidden size-10 rounded-full sm:block" />
          {/* Cart, theme */}
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="size-10 rounded-full" />
          {/* Stores — `sm:grid` on the real bar */}
          <Skeleton className="hidden size-10 rounded-full sm:block" />

          <span aria-hidden className="bg-outline-variant mx-1 hidden h-6 w-px sm:block" />

          {/* The account control: an avatar and its chevron when signed in, a
              "Sign in" pill when not. Drawn at the pill's width, which is the
              wider of the two — better to settle inward than outward. */}
          <Skeleton className="h-10 w-24 rounded-full" />

          {/* Hamburger */}
          <Skeleton className="ml-1 size-10 rounded-full md:hidden" />
        </div>
      </div>
    </div>
  );
}
