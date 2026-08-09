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
 */
export default function Loading() {
  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <NavbarSkeleton />

      <main>
        <section className="flex flex-col items-center px-4 pt-16 pb-20 text-center sm:pt-24 sm:pb-28">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="mt-6 h-16 w-full max-w-3xl" />
          <Skeleton className="mt-2 h-16 w-full max-w-2xl" />
          <div className="mt-9 flex gap-3">
            <Skeleton className="h-12 w-48 rounded-full" />
            <Skeleton className="h-12 w-40 rounded-full" />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
          <Skeleton className="mb-6 h-9 w-64" />
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
