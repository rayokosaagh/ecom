import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import type { LogoTreatment } from "@/generated/prisma/enums";
import { BrandMark } from "@/components/brands/BrandMark";
import { WishlistButton } from "@/components/wishlist/WishlistButton";
import { CompareToggle } from "@/components/products/CompareToggle";
import { Tilt } from "@/components/ui/Tilt";
import { RatingBadge } from "@/components/reviews/RatingStars";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/products/format";
import { availableStock, priceRange } from "@/lib/products/variants";
import { saleFor } from "@/lib/products/sale";

export interface ProductCardData {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  priceCents: number;
  /**
   * What it used to cost, when it is on sale. Optional like the fields below —
   * a surface that does not select it simply shows no "was" line, rather than
   * quietly claiming there is no sale. See `lib/products/sale`.
   */
  compareAtPriceCents?: number | null;
  stock: number;
  published: boolean;
  colors: { name: string; hex: string }[];
  category: { name: string } | null;
  /**
   * Optional so surfaces that do not select it keep compiling.
   *
   * `slug` is optional within that for the same reason one level down: it is
   * only needed to link the mark through to the brand's listing, and a surface
   * that does not select it gets the mark as plain text rather than a link to
   * `/products?brand=undefined`.
   */
  brand?: {
    name: string;
    slug?: string;
    iconSvg?: string | null;
    logo?: string | null;
    /** How dark mode treats a hosted logo. See `lib/brands/logo-format`. */
    logoTreatment?: LogoTreatment | null;
  } | null;
  /**
   * Price and stock per configuration. Optional for the same reason `brand`
   * is — a surface that does not select them gets the product's own figures,
   * which is exactly right for a product that has no variants anyway.
   */
  variants?: { priceCents: number; stock: number; compareAtPriceCents?: number | null }[];
  /**
   * Top-level category, which is what comparison is locked to. Absent on
   * surfaces that do not offer comparison — the dashboard list, for one.
   */
  compareGroup?: { id: string; name: string } | null;
  /**
   * Average and how many said so. Optional like the fields above: a surface
   * that does not load ratings shows none, which is the honest result rather
   * than an implied zero.
   */
  rating?: { average: number; count: number } | null;
}

export function ProductCard({
  product,
  showStatus = false,
  wishlisted = false,
  comparable = false,
}: {
  product: ProductCardData;
  showStatus?: boolean;
  /** Whether the current user has this product on their wishlist. */
  wishlisted?: boolean;
  /** Offer the compare control. Needs `product.compareGroup` to do anything. */
  comparable?: boolean;
}) {
  const variants = product.variants ?? [];
  const range = priceRange(product, variants);
  const soldOut = availableStock(product, variants) === 0;
  // Reads the same row `priceRange` took `minCents` from, so the "was" and the
  // "now" always describe the same thing you can actually buy.
  const sale = saleFor(product, variants);
  const showDraft = showStatus && !product.published;

  return (
    <Tilt className="h-full">
      {/*
        A plain element rather than the anchor this used to be.

        The card needs a second link inside it — the brand mark, through to that
        brand's listing — and an <a> inside an <a> is not something the HTML
        parser tolerates: it closes the outer one, so the server's markup and
        the client's tree disagree and hydration breaks. The buttons already in
        here are fine nested (the parser keeps those), which is why only now
        does this have to change.

        So the product link becomes an overlay pinned across the card, below,
        and everything that needs to be clickable in its own right sits above
        it. `block h-full` stays load-bearing for the same reason it was on the
        anchor: the Card's `h-full` resolves against this, and without a
        definite height cards in a row never stretch to a common one. The hover
        lift stays here too, so it composes with the Card's own elevation
        change rather than competing with it.
      */}
      <div className="group block h-full rounded-xl transition-transform duration-200 ease-[var(--ease-standard)] hover:-translate-y-0.5">
        <Card variant="outlined" className="h-full overflow-hidden" interactive>
          {/* No background on the frame itself. Plenty of catalogue images are
              transparent PNGs, and a tint here showed straight through them as
              a grey block behind the product while opaque photos covered it —
              so the same shelf rendered two different looking cards. Left
              bare, transparency falls through to the card's own surface and
              reads as intentional. The placeholder below keeps a tint, because
              an empty frame does need to look like one. */}
          <div className="relative aspect-square overflow-hidden">
            {product.image ? (
              // Plain <img>: these URLs are operator-supplied and can point at any
              // host, so they are deliberately not routed through next/image.
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={product.image}
                alt={product.name}
                loading="lazy"
                // object-cover in a fixed square: the photo fills the frame,
                // every card the same, with no empty space and nothing laid
                // behind it.
                //
                // The cost is a centre crop, and it is a real one — catalogue
                // photos arrive at every ratio, this set spanning 0.67
                // (800x1200 portrait) to 1.78 (800x450 landscape), and cutting
                // each to a square averages ~32% off the long edge. `contain`
                // is the alternative and was tried: it keeps every product
                // whole and leaves the difference as empty space, which makes a
                // wide photo a thin strip floating in a square and sizes it
                // visibly differently from the portrait next to it.
                //
                // Filling won. The way to fill *and* keep the whole product is
                // not an `object-fit` value at all — it is squaring the images
                // on the way in, at upload, so there is nothing left to crop.
                //
                // No padding: with `cover` it would only inset the fill and
                // reintroduce an uneven frame.
                className="size-full object-cover transition-transform duration-300 ease-[var(--ease-standard)] group-hover:scale-105"
              />
            ) : (
              <div className="bg-surface-container-highest text-on-surface-variant grid size-full place-items-center">
                <Icon name="image" size={40} />
              </div>
            )}

            {/* Draft and the discount share this corner, so they stack rather
                than overlap — a draft product can be on sale, and on the
                dashboard both facts matter. */}
            {showDraft && (
              <span className="bg-surface-container-highest text-on-surface-variant absolute top-2 left-2 rounded-full px-2 py-0.5 text-[11px] sm:px-3 sm:py-1 sm:text-xs">
                Draft
              </span>
            )}
            {/* One badge in this corner, and sold out wins it. A discount on
                something nobody can buy is not the useful half. A saving under
                half a percent rounds to 0 and shows no badge — the "was" line
                below still tells the truth without claiming a percentage that
                was not given.

                Solid rather than a container tint, and it says "off" rather
                than a bare "−25%": at card size in a grid this is the thing a
                shopper scans for, and it has to win against the photograph
                behind it. */}
            {soldOut ? (
              <span className="bg-error-container text-on-error-container absolute top-2 right-2 rounded-full px-2 py-0.5 text-[11px] sm:px-3 sm:py-1 sm:text-xs">
                Sold out
              </span>
            ) : (
              sale &&
              sale.percentOff >= 1 && (
                <span
                  className={cn(
                    "bg-tertiary text-on-tertiary shadow-elevation-1 absolute left-2 rounded-full px-2.5 py-1",
                    "text-[11px] font-semibold tracking-wide uppercase sm:text-xs",
                    showDraft ? "top-10" : "top-2",
                  )}
                >
                  {sale.percentOff}% off
                </span>
              )
            )}

            {/* z-20 puts these above the product-link overlay below, which
                would otherwise be painted across them and swallow the tap.
                They sit in `.aspect-square`, which is positioned but sets no
                z-index and so creates no stacking context of its own — the
                comparison is against the overlay directly. */}
            <WishlistButton
              productId={product.id}
              wishlisted={wishlisted}
              className="absolute right-2 bottom-2 z-20"
            />

            {/* Uncategorised products cannot be locked to anything, so they are
                simply not comparable. */}
            {comparable && product.compareGroup && (
              <CompareToggle
                entry={{
                  slug: product.slug,
                  name: product.name,
                  image: product.image,
                  groupId: product.compareGroup.id,
                  groupName: product.compareGroup.name,
                }}
                className="absolute bottom-2 left-2 z-20"
              />
            )}
          </div>

          <div className="space-y-1 p-3 sm:p-4">
            {/* Brand and category together are what separate a workstation from
                an ultrabook at a glance. */}
            {(product.brand || product.category) && (
              <p className="text-on-surface-variant flex items-center gap-1.5 truncate text-xs tracking-wide uppercase">
                {/* The mark alone where there is one — it is the faster read at
                    card size, and it inherits currentColor from this line. It
                    carries the brand name as its accessible label, since the
                    name is no longer beside it. Brands without a mark fall back
                    to the name rather than showing nothing. */}
                {product.brand &&
                  (() => {
                    const mark = product.brand.iconSvg || product.brand.logo ? (
                      <BrandMark
                        svg={product.brand.iconSvg}
                        logo={product.brand.logo}
                        treatment={product.brand.logoTreatment}
                        size={16}
                        label={product.brand.name}
                      />
                    ) : (
                      <span className="text-on-surface font-medium">
                        {product.brand.name}
                      </span>
                    );

                    // Not a link where the surface did not select a slug —
                    // better plain text than an address built from undefined.
                    if (!product.brand.slug) return mark;

                    return (
                      /* Above the product-link overlay, so this wins the click
                         within its own bounds. Deliberately no bigger than the
                         mark: it overlaps a card that is otherwise one large
                         target, and a generous hit area here would mean taps
                         meant for the product landing on the brand instead. */
                      <Link
                        href={`/products?brand=${product.brand.slug}`}
                        aria-label={`Shop all ${product.brand.name}`}
                        className="hover:text-primary relative z-20 flex shrink-0 items-center rounded-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {mark}
                      </Link>
                    );
                  })()}
                {product.brand && product.category && (
                  <span aria-hidden className="bg-outline-variant h-3 w-px shrink-0" />
                )}
                {product.category?.name}
              </p>
            )}
            <h3 className="text-on-surface truncate text-sm font-medium">{product.name}</h3>

            {/* Nothing at all until someone has rated it — see RatingBadge. */}
            {product.rating && (
              <RatingBadge
                average={product.rating.average}
                count={product.rating.count}
                size={13}
              />
            )}
            <p className="text-on-surface flex flex-wrap items-baseline gap-x-1.5 text-sm sm:text-base">
              {/* "From" only when configurations actually differ in price —
                  saying it on a product sold at one price would be noise. */}
              {range.varies && (
                <span className="text-on-surface-variant text-xs">from </span>
              )}
              <span className={sale ? "text-tertiary font-medium" : undefined}>
                {formatPrice(range.minCents)}
              </span>
              {sale && (
                <span className="text-on-surface-variant text-xs line-through">
                  {/* Spelled out for a screen reader, which announces a
                      strikethrough as nothing at all. */}
                  <span className="sr-only">was </span>
                  {formatPrice(sale.compareAtCents)}
                </span>
              )}
            </p>

            {product.colors.length > 0 && (
              <div className="flex items-center gap-1.5 pt-1">
                {product.colors.slice(0, 4).map((color) => (
                  <span
                    key={color.name}
                    // The name is the label a shopper recognises; the hex is only
                    // ever the fill.
                    title={color.name}
                    className="border-outline-variant size-3.5 shrink-0 rounded-full border sm:size-4"
                    style={{ backgroundColor: color.hex }}
                  />
                ))}
                <span className="text-on-surface-variant hidden truncate text-xs sm:inline">
                  {product.colors.length > 4
                    ? `+${product.colors.length - 4}`
                    : product.colors.length === 1
                      ? product.colors[0].name
                      : `${product.colors.length} colours`}
                </span>
              </div>
            )}
          </div>

          {/*
            The product link, stretched across the whole card.

            Inside the Card rather than around it, which is forced: `Card`
            carries `state-layer`, and that sets `isolation: isolate` — a
            stacking context the wishlist and compare buttons cannot escape.
            An overlay outside the Card would paint over them however they were
            layered, and both would stop taking clicks.

            Last in the DOM so it does not take the tab stop before the
            controls it covers, and the focus ring is drawn *inward*
            (`-outline-offset-2`): the Card clips to its own rounded corners,
            so an outward ring on a box pinned to those exact bounds would be
            clipped away and keyboard focus would land invisibly.
          */}
          <Link
            href={`/products/${product.slug}`}
            className="absolute inset-0 z-10 rounded-xl focus-visible:outline-2 focus-visible:-outline-offset-2"
          >
            {/* The card's own heading is what a sighted user reads; this gives
                the link an accessible name without repeating it on screen. */}
            <span className="sr-only">{product.name}</span>
          </Link>
        </Card>
      </div>
    </Tilt>
  );
}
