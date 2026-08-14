import {
  NavbarSkeleton,
  ProductCardSkeleton,
  Skeleton,
} from "@/components/ui/Skeleton";

/**
 * Home loading state — and, being at the root, the fallback for any descendant
 * segment that does not declare its own.
 *
 * That cascade is why the routes whose shape differs each have one: the
 * catalogue, a product, the cart, the comparison, the dashboard, the orders
 * list, and `(auth)`, which sits under a layout with no top bar at all and
 * would otherwise inherit a navbar placeholder it never renders.
 *
 * It follows the page it stands in for rather than being a generic grey page:
 * the hero is the two-column arrangement the front door actually serves — copy
 * on the left, one featured product on a stage to the right with its facts
 * floating over it — followed by the two shelves that are always there. The
 * flash sale and the sale shelf are not drawn at all, because both render
 * nothing unless something is running and a placeholder for a section that
 * turns out to be absent is a gap that closes itself the moment the page
 * arrives.
 *
 * The chips on the stage are the real `bg-surface hero-float` slabs with
 * placeholder lines inside rather than plain grey blocks. They are what the
 * hero's shape is made of, and drawing them for real is what makes this read as
 * the page loading rather than as a different page.
 */
export default function Loading() {
  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <NavbarSkeleton />

      <main>
        {/* The hero. Same gutters, same column ratio and the same vertical
            rhythm as `FeaturedShowcase` in its hero layout, so the swap is a
            fill rather than a re-layout. */}
        <section className="mx-auto max-w-7xl px-4 pt-12 pb-24 sm:px-6 sm:pt-20 sm:pb-28">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
            {/* Copy: centred while the columns are stacked, left-aligned from
                `lg` — exactly as `HeroCopy` is. */}
            <div className="flex min-w-0 flex-col items-center lg:items-start">
              {/* Eyebrow */}
              <Skeleton className="h-4 w-52" />

              {/* Headline, over two lines — the second is the accented one. */}
              <Skeleton className="mt-6 h-10 w-full max-w-md sm:h-12" />
              <Skeleton className="mt-3 h-10 w-4/5 max-w-sm sm:h-12" />

              {/* Shop all products · Create an account */}
              <div className="mt-9 flex flex-wrap justify-center gap-3 lg:justify-start">
                <Skeleton className="h-12 w-48 rounded-full" />
                <Skeleton className="h-12 w-40 rounded-full" />
              </div>

              {/* The two promises */}
              <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-2 lg:justify-start">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-36" />
              </div>
            </div>

            {/* Stage. The same height the real one states outright, so the fold
                does not move when the product lands. */}
            <div className="min-w-0">
              <div className="relative h-[32rem] md:h-[44rem]">
                {/* The product itself, standing on the page rather than in a
                    card — so this is a soft shape in the middle of the stage,
                    not a filled rectangle the width of the column. */}
                <Skeleton className="absolute top-1/2 left-1/2 h-[52%] w-[68%] -translate-x-1/2 -translate-y-1/2 rounded-3xl" />

                {/* The floating facts: what it is at the top, what it costs and
                    where it goes at the bottom. */}
                <div className="absolute inset-0 flex flex-col justify-between gap-3 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    {/* "Featured" */}
                    <div className="bg-surface hero-float rounded-full px-3 py-1.5">
                      <Skeleton className="h-4 w-20" />
                    </div>
                    {/* Rating */}
                    <div className="bg-surface hero-float shrink-0 rounded-full px-3 py-1.5">
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end justify-between gap-3">
                    {/* Brand · category, then the name */}
                    <div className="bg-surface hero-float min-w-0 space-y-2 rounded-2xl px-4 py-3">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-6 w-44" />
                    </div>

                    {/* Price, then the View button */}
                    <div className="bg-surface hero-float flex shrink-0 items-center gap-3 rounded-2xl py-2 pr-2 pl-4">
                      <Skeleton className="h-6 w-20" />
                      <Skeleton className="h-11 w-24 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>

              {/* The dots that change panel. */}
              <div className="mt-5 flex justify-center gap-2 lg:justify-start">
                <Skeleton className="h-2 w-8 rounded-full" />
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-2 w-2 rounded-full" />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Best sellers — the accordion's one fixed row, at the height it
            states for itself. */}
        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
          <Skeleton className="h-8 w-56" />
          <div className="mt-6 flex gap-2 overflow-hidden">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton
                key={index}
                className={
                  // One panel open and the rest closed, which is how the row
                  // first draws: the open one takes the space, the closed ones
                  // are the slivers beside it.
                  index === 0
                    ? "h-[20rem] flex-1 rounded-2xl md:h-[26rem] md:flex-[3]"
                    : "h-[20rem] w-16 shrink-0 rounded-2xl md:h-[26rem] md:w-auto md:flex-1"
                }
              />
            ))}
          </div>
        </section>

        {/* Brand strip. Two rails that run the full width — the gutters belong
            to the header here, not the section, exactly as in `BrandStrip`, so
            the tiles travel off the edge of the page rather than stopping short
            of a margin. */}
        <section className="mx-auto max-w-7xl pb-24">
          <div className="mb-7 flex items-baseline gap-4 px-4 sm:px-6">
            <Skeleton className="h-8 w-52 shrink-0" />
            <span aria-hidden className="bg-outline-variant hidden h-px flex-1 sm:block" />
            <Skeleton className="h-3 w-20 shrink-0" />
          </div>

          <div className="space-y-4 overflow-hidden">
            {Array.from({ length: 2 }).map((_, row) => (
              <div key={row} className="flex gap-4">
                {Array.from({ length: 8 }).map((__, index) => (
                  <Skeleton
                    key={index}
                    className="aspect-3/2 w-40 shrink-0 rounded-2xl sm:w-48"
                  />
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* Latest arrivals */}
        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
          <div className="mb-6 flex items-end justify-between gap-4">
            <Skeleton className="h-8 w-60" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <ProductCardSkeleton key={index} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
