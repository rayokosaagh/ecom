import type { CSSProperties } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { BrandMark } from "@/components/brands/BrandMark";
import { WishlistButton } from "@/components/wishlist/WishlistButton";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/products/format";
import { priceRange } from "@/lib/products/variants";
import { saleGradient, type SaleTintPair } from "./sale-tints";
import type { SaleProductView } from "@/lib/sales/service";

/**
 * The tinted sale card, and the pieces the lead card shares with it.
 *
 * Its own module because two surfaces render it — the home shelf and the sale
 * listing — and because `SaleSection` was becoming the file where everything
 * about sales lived.
 */

/**
 * The tinted shell, lifted from `PromoCard` minus its background.
 *
 * The gradient lives on two stacked layers inside instead, so the resting and
 * hover colours can cross-fade. Painting it on the shell itself would mean
 * animating gradient stops, which needs every stop registered with `@property`
 * to be interpolable at all — opacity on two layers simply works everywhere.
 */
export const SALE_SHELL = cn(
  "relative h-full overflow-hidden rounded-3xl ring-1 ring-inset ring-on-surface/[0.06]",
  "transition-[box-shadow,transform] duration-300 ease-emphasized",
  "group-hover:shadow-elevation-3 group-hover:-translate-y-1",
  "motion-reduce:transition-none motion-reduce:group-hover:translate-y-0",
);

/** Foreground follows the wash, so the copy stays legible through the change. */
export const SALE_CONTENT = cn(
  "relative text-[var(--sale-on)] transition-[color] duration-500 ease-emphasized",
  "group-hover:text-[var(--sale-on-hover)]",
  "motion-reduce:transition-none",
);

/**
 * The two washes, stacked.
 *
 * `aria-hidden` and pointer-transparent: decoration that must not appear in the
 * accessibility tree or intercept the click on the card behind it.
 */
export function TintLayers({ tints }: { tints: SaleTintPair }) {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: saleGradient(tints.base) }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 ease-emphasized group-hover:opacity-100 motion-reduce:transition-none"
        style={{ background: saleGradient(tints.hover) }}
      />
    </>
  );
}

/** Custom properties the shell hands down to `SALE_CONTENT`. */
export function tintVars(tints: SaleTintPair): CSSProperties {
  return {
    "--sale-on": tints.base.on,
    "--sale-on-hover": tints.hover.on,
  } as CSSProperties;
}

/**
 * The discount badge.
 *
 * Green on every tint rather than one that follows the card — and it stays put
 * when the card changes colour underneath it. It is the same badge the
 * catalogue cards carry, and "a discount is green" is a convention worth more
 * than colour-matching each shell; solid tertiary reads clearly against every
 * tint in both schemes.
 */
export function DiscountBadge({ percentOff }: { percentOff: number }) {
  if (percentOff < 1) return null;
  return (
    <span className="bg-tertiary text-on-tertiary shadow-elevation-1 absolute top-3 left-3 z-10 rounded-full px-2.5 py-1 text-label-sm font-semibold tracking-wide uppercase sm:text-xs">
      {percentOff}% off
    </span>
  );
}

/** Brand mark and category, on a tinted surface. */
export function TintedMeta({ product }: { product: SaleProductView }) {
  if (!product.brand && !product.category) return null;
  return (
    <p className="label-caps flex items-center gap-1.5 truncate opacity-75">
      {product.brand &&
        (product.brand.iconSvg || product.brand.logo ? (
          <BrandMark
            svg={product.brand.iconSvg}
            logo={product.brand.logo}
            treatment={product.brand.logoTreatment}
            size={16}
            label={product.brand.name}
          />
        ) : (
          <span className="font-medium">{product.brand.name}</span>
        ))}
      {product.brand && product.category && (
        <span aria-hidden className="h-3 w-px shrink-0 bg-current opacity-40" />
      )}
      {product.category?.name}
    </p>
  );
}

/**
 * A product on sale, wearing one of the shelf's colours.
 *
 * Its own component rather than `ProductCard` with a tint prop: `ProductCard`
 * sets its own text colours throughout — `text-on-surface`, `text-tertiary` for
 * the price — and those would have to become conditional to sit on a container
 * tint, which is a lot of risk carried into the catalogue and the wishlist for
 * a change only the sale surfaces want. Here the shell owns the colour and
 * everything inside inherits it.
 */
export function SaleCard({
  product,
  tints,
  wishlisted,
}: {
  product: SaleProductView;
  tints: SaleTintPair;
  wishlisted: boolean;
}) {
  const range = priceRange(product, product.variants ?? []);
  const { sale } = product;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block h-full rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <div className={cn(SALE_SHELL, "flex flex-col")} style={tintVars(tints)}>
        <TintLayers tints={tints} />

        {/* No fill behind the image: a transparent PNG falls through to the
            card's own wash — including the one it changes to — rather than the
            grey block a neutral frame produces. */}
        <div className="relative aspect-square shrink-0 overflow-hidden">
          {product.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={product.image}
              alt={product.name}
              loading="lazy"
              className="size-full object-cover object-center transition-transform duration-300 ease-emphasized group-hover:scale-105 motion-reduce:transition-none"
            />
          ) : (
            <div className="grid size-full place-items-center opacity-60">
              <Icon name="image" size={40} />
            </div>
          )}

          <DiscountBadge percentOff={sale.percentOff} />

          <WishlistButton
            productId={product.id}
            wishlisted={wishlisted}
            className="absolute right-2 bottom-2"
          />
        </div>

        <div className={cn(SALE_CONTENT, "flex flex-1 flex-col gap-1 p-3 sm:p-4")}>
          <TintedMeta product={product} />

          <h3 className="text-title-sm truncate font-semibold">
            {product.name}
          </h3>

          <p className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-1">
            {range.varies && <span className="text-xs opacity-75">from</span>}
            <span className="text-title-md font-semibold">
              {formatPrice(range.minCents)}
            </span>
            <span className="text-xs line-through opacity-60">
              {/* Spelled out for a screen reader, which announces a
                  strikethrough as nothing at all. */}
              <span className="sr-only">was </span>
              {formatPrice(sale.compareAtCents)}
            </span>
          </p>
        </div>
      </div>
    </Link>
  );
}
