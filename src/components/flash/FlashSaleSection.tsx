import Link from "next/link";

import { FlashCountdown } from "@/components/flash/FlashCountdown";
import { ProductCard } from "@/components/products/ProductCard";
import { Icon } from "@/components/ui/Icon";
import type { FlashSaleView } from "@/lib/flash/service";

/**
 * The running flash sale, on the home page.
 *
 * Deliberately the loudest section on the page, and above the standing sale
 * shelf. The two say different things: `SaleSection` lists things that happen to
 * be cheaper than they were, with no deadline attached, while this is an event
 * with a clock on it. Putting a countdown on the first would be a lie, and
 * burying the second under it would waste the only part of the page that is
 * genuinely time-sensitive.
 *
 * Renders nothing when no sale is running — `getLiveFlashSale` returns null,
 * including for a sale whose window is open but whose products are all drafts.
 * An empty flash section with a live timer is worse than no section.
 */
export function FlashSaleSection({
  sale,
  wishlistIds,
  ratings,
}: {
  sale: FlashSaleView | null;
  wishlistIds: Set<string>;
  ratings: Map<string, { average: number; count: number }>;
}) {
  if (!sale) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      {/* A tinted panel rather than a bare section: the discount is real and
          temporary, and the surface change is what separates it from the
          permanently-discounted shelf further down.

          The tint is a diagonal gradient rather than a flat fill, running the
          same primary → secondary the accent words do, so the panel reads as
          part of the same family. Built from scheme tokens rather than fixed
          colours, so it inverts with the theme instead of needing a second
          set. Kept at low alpha throughout: this sits behind product cards,
          and a stronger wash would start competing with the photography it is
          meant to frame. */}
      <div className="from-primary-container/50 via-secondary-container/30 to-secondary-container/45 border-secondary/20 rounded-3xl border bg-gradient-to-br p-5 sm:p-7">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-on-tertiary-container flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.18em] uppercase">
              <Icon name="bolt" size={14} />
              Flash sale · {sale.percentOff}% off
            </p>
            <h2 className="text-on-surface mt-2 text-3xl font-medium tracking-tight">
              {sale.name}
            </h2>
          </div>

          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <span className="text-on-surface-variant text-[11px] font-semibold tracking-[0.18em] uppercase">
              Ends in
            </span>
            <FlashCountdown
              endsAtMs={sale.endsAtMs}
              remainingMs={sale.remainingMs}
            />
          </div>
        </div>

        <ul className="stagger grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {sale.products.map((product) => (
            <li key={product.slug}>
              <ProductCard
                product={{ ...product, rating: ratings.get(product.id) ?? null }}
                wishlisted={wishlistIds.has(product.id)}
              />
            </li>
          ))}
        </ul>

        <div className="mt-6">
          <Link
            href="/sale"
            className="text-on-surface-variant hover:text-primary rounded-sm text-[11px] font-semibold tracking-[0.18em] uppercase transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            All reductions
          </Link>
        </div>
      </div>
    </section>
  );
}
