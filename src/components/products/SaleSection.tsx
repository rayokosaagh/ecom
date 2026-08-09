import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { RatingBadge } from "@/components/reviews/RatingStars";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/products/format";
import { priceRange } from "@/lib/products/variants";
import {
  DiscountBadge,
  SaleCard,
  SALE_CONTENT,
  SALE_SHELL,
  TintLayers,
  TintedMeta,
  tintVars,
} from "./SaleCard";
import {
  GRID_TINT_INDICES,
  LEAD_TINT_INDEX,
  saleTintPair,
  type SaleTintPair,
} from "./sale-tints";
import type { SaleProductView } from "@/lib/sales/service";

/**
 * The sale shelf on the home page.
 *
 * Presentational, like `FeaturedShowcase` — the page owns the query, so the
 * ratings and wishlist lookups it already makes are shared rather than
 * duplicated here.
 *
 * Dressed from `PromoCard`'s tinted-shell treatment with a wider palette and a
 * colour change under the cursor. See `./sale-tints` for why the palette is
 * widened rather than borrowed, and why the hover colour is derived rather than
 * drawn at random.
 *
 * The header stays the site's ordinary section header — heading left, plain
 * link right, as "Featured picks" — so the shelf stays anchored while the cards
 * carry the colour.
 *
 * Renders nothing at all when no product is on sale.
 */
export function SaleSection({
  products,
  wishlistIds,
}: {
  products: SaleProductView[];
  wishlistIds?: Set<string>;
}) {
  if (products.length === 0) return null;

  // Below two there is no hierarchy to express, so the lead is dropped and the
  // remainder falls into the ordinary grid.
  const featureLead = products.length >= 2;
  const [lead, ...rest] = products;
  const grid = featureLead ? rest.slice(0, 3) : products;

  return (
    <section
      aria-labelledby="sale-heading"
      className="mx-auto max-w-7xl px-4 pb-24 sm:px-6"
    >
      <div className="mb-6 flex items-end justify-between gap-4">
        {/* Heavier and a size up on its siblings: the section is the loudest
            thing on the page by design. The two-tone construction is unchanged,
            so it still reads as one of the family — the weight contrast between
            the semibold lead-in and the regular display italic carries it. */}
        <h2
          id="sale-heading"
          className="text-on-surface text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          On <span className="accent-word">sale</span>
        </h2>
        {/* The shelf shows four; this is where the rest of them live. */}
        <Link
          href="/sale"
          className="text-primary rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          View all
        </Link>
      </div>

      {featureLead && (
        <div className="mb-3 sm:mb-4">
          <SaleLeadCard
            product={lead}
            tints={saleTintPair(LEAD_TINT_INDEX, lead.slug)}
          />
        </div>
      )}

      <ul className="stagger grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        {grid.map((product, index) => (
          <li key={product.slug}>
            {/* Resting colour drawn from the palette *minus* the lead's, so
                every card on the shelf — the lead included — is a different
                colour. Hover colour by slug, so it looks arbitrary across the
                row and never moves for a given card. */}
            <SaleCard
              product={product}
              tints={saleTintPair(
                GRID_TINT_INDICES[index % GRID_TINT_INDICES.length],
                product.slug,
              )}
              wishlisted={wishlistIds?.has(product.id) ?? false}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The deepest discount, given the width and the colour.
 *
 * Mirrored against the featured panel — copy left, product right — so two wide
 * cards in a column do not read as the same component twice.
 *
 * Prices come from the same helpers every other surface uses, so the figures
 * here cannot drift from the cards or the product page.
 */
export function SaleLeadCard({
  product,
  tints,
}: {
  product: SaleProductView;
  tints: SaleTintPair;
}) {
  const range = priceRange(product, product.variants ?? []);
  const { sale } = product;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <div className={SALE_SHELL} style={tintVars(tints)}>
        <TintLayers tints={tints} />

        <div className={cn(SALE_CONTENT, "grid md:grid-cols-2")}>
          <div className="flex flex-col justify-center gap-3 p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="bg-tertiary text-on-tertiary rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase">
                Save {formatPrice(sale.savingCents)}
              </span>
              {sale.percentOff >= 1 && (
                <span className="text-sm font-medium opacity-75">
                  {sale.percentOff}% off
                </span>
              )}
            </div>

            <TintedMeta product={product} />

            {/* Same type scale as PromoCard's tinted headings. */}
            <h3 className="text-2xl leading-[1.15] font-semibold tracking-tight text-balance sm:text-[1.75rem]">
              {product.name}
            </h3>

            {/* Nothing at all until someone has rated it — see RatingBadge. */}
            {product.rating && (
              <RatingBadge
                average={product.rating.average}
                count={product.rating.count}
                size={14}
              />
            )}

            <p className="max-w-prose text-sm leading-snug text-pretty opacity-75">
              {product.description}
            </p>

            <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
              {range.varies && <span className="text-sm opacity-75">from</span>}
              <span className="text-3xl font-semibold sm:text-4xl">
                {formatPrice(range.minCents)}
              </span>
              <span className="text-base line-through opacity-60">
                <span className="sr-only">was </span>
                {formatPrice(sale.compareAtCents)}
              </span>
            </p>

            {/* PromoCard's CTA: a label whose underline draws in on hover,
                rather than a button — the whole card is already the link. */}
            <span className="mt-2 inline-flex items-center gap-2 text-sm font-medium">
              <span className="relative">
                View product
                <span
                  aria-hidden
                  className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-current transition-transform duration-300 ease-[var(--ease-emphasized)] group-hover:scale-x-100 motion-reduce:transition-none"
                />
              </span>
              <Icon name="arrow_forward" size={18} className="shrink-0" />
            </span>
          </div>

          <div className="relative aspect-[16/10] overflow-hidden md:aspect-auto md:min-h-[21rem]">
            {product.image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={product.image}
                alt={product.name}
                className="absolute inset-0 size-full object-cover object-center transition-transform duration-300 ease-[var(--ease-emphasized)] group-hover:scale-105 motion-reduce:transition-none"
              />
            ) : (
              <div className="grid size-full place-items-center opacity-60">
                <Icon name="image" size={48} />
              </div>
            )}

            <DiscountBadge percentOff={sale.percentOff} />
          </div>
        </div>
      </div>
    </Link>
  );
}
