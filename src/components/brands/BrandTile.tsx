import Link from "next/link";

import { BrandMark } from "@/components/brands/BrandMark";
import { brandInitials } from "@/lib/brands/initials";
import type { BrandSummary } from "@/lib/brands/service";

/**
 * The mark's box, in px.
 *
 * Roughly double what the marks were given when each sat in a bordered tile.
 * The artwork is a 24×24 square whatever the brand, so a wordmark like
 * "LOGITECH" is drawn wide-and-short inside it and renders only about a third
 * of this box in actual lettering — at the old 44px that was a smudge. The
 * plate behind it is what buys the room to go this large without the mark
 * floating in empty space.
 */
export const MARK_BOX = 76;

/** The grid both the home strip and the full listing lay their tiles out on. */
export const BRAND_GRID =
  "grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-6";

/**
 * One brand, as a way into the catalogue.
 *
 * Shared by the home page's strip and the full `/brands` listing so the two
 * cannot drift apart — the second was added later, and a copied tile would
 * have started identical and stopped being so at the first change.
 *
 * The tile is a *plate*, not a card: a filled surface carrying the mark, with
 * the name set beneath it rather than inside it. An outlined card drew a box
 * around every logo and made the section read as a table of components; a plate
 * is a backdrop, so what the eye lands on is the artwork. It also gives the
 * marks a consistent surface to inherit `currentColor` against, which a
 * transparent tile could not — the mark's contrast would otherwise depend on
 * the page behind it rather than on something this component controls.
 */
export function BrandTile({ brand }: { brand: BrandSummary }) {
  return (
    <Link
      href={`/products?brand=${brand.slug}`}
      className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      {/* Wider than tall, because the artwork that needs the room is a
          wordmark. A square plate would spend its height on the empty
          bands above and below the lettering. */}
      <span
        className="bg-surface-container group-hover:bg-secondary-container flex aspect-3/2 items-center justify-center overflow-hidden rounded-2xl px-4 transition-colors duration-200 ease-standard"
      >
        {brand.iconSvg || brand.logo ? (
          /* Dimmed by opacity rather than by a muted text colour:
             these marks are single-colour and inherit `currentColor`,
             so a variant tone would flatten them against the plate
             instead of quieting them. Full strength is reserved for
             hover.

             `max-w-full!` overrides the width allowance `BrandMark`
             gives a hosted logo — that allowance is sized for a card's
             text line, and here the plate is the only bound that
             matters. It has to win over an inline style, hence the
             important. */
          <BrandMark
            svg={brand.iconSvg}
            logo={brand.logo}
            treatment={brand.logoTreatment}
            size={MARK_BOX}
            className="text-on-surface max-w-full! opacity-80 transition-opacity duration-200 group-hover:opacity-100"
          />
        ) : (
          /* Initials get the plate to themselves rather than a chip of
             their own. Set at display size in the same tracked caps as
             the labels, they read as a mark stood in for — where a
             smaller badge inside the plate read as something missing. */
          <span
            aria-hidden
            className="text-on-surface-variant/70 group-hover:text-on-secondary-container/80 text-3xl font-medium tracking-[0.12em] transition-colors duration-200 select-none"
          >
            {brandInitials(brand.name)}
          </span>
        )}
      </span>

      {/* Tracked caps at small size — the label is an identifier, not a
          sentence, and the tracking is what stops six of them in a row
          from reading as a block of text. The name carries the tile:
          the mark above is decorative, and a brand with only initials
          has nothing else to identify it by. */}
      <span className="label-caps text-on-surface group-hover:text-primary mt-3 block truncate text-center font-semibold transition-colors duration-200">
        {brand.name}
      </span>
    </Link>
  );
}
