import Link from "next/link";
import type { CSSProperties } from "react";

import { BrandTile } from "@/components/brands/BrandTile";
import type { BrandSummary } from "@/lib/brands/service";

/**
 * How fast a tile travels, in pixels per second.
 *
 * A *speed* rather than a duration per row, and that is the whole point of
 * driving it this way. The rows are dealt alternately, so an odd number of
 * brands leaves one row a tile shorter than the other — and two rows given the
 * same duration but different track widths finish together while visibly moving
 * at different rates, which is the opposite of travelling in step. Fixing the
 * speed and deriving each row's duration from its own width keeps them level
 * whatever the catalogue does.
 *
 * Slow on purpose: this is a background rhythm, and a rail that hurries is one
 * nobody can read. 24px/s puts a full pass at roughly 72 seconds, between the
 * 64s and 82s the two rows used to run at separately.
 */
const SPEED_PX_PER_SECOND = 24;

/** One tile's laid-out width including its gutter, at the `sm` size and up. */
const TILE_WIDTH = 192;

/** The widest the rail is ever drawn — the section's own `max-w-7xl`. */
const RAIL_MAX_WIDTH = 1280;

/**
 * One row of the rail.
 *
 * The track holds two identical halves and slides by exactly one of them, which
 * is what makes the loop seamless — see `.brand-rail`. That only works while a
 * half is at least as wide as the viewport; a half narrower than the screen
 * runs out before the animation comes round and opens a gap at the tail. A shop
 * with four brands is exactly the case that would hit it, so each half repeats
 * the list as many times as it takes to cover the widest the rail can be drawn.
 *
 * The second half is a duplicate in the literal sense, so it is taken out of the
 * accessibility tree with `aria-hidden` and out of the tab order with `inert`.
 * Without both, every brand would be announced twice and tabbing through the
 * section would visit eighteen links to nine brands.
 */
function BrandRail({ brands }: { brands: BrandSummary[] }) {
  const repeats = Math.max(
    1,
    Math.ceil(RAIL_MAX_WIDTH / Math.max(1, brands.length * TILE_WIDTH)),
  );

  // The animation slides by exactly one half, so a half's width is the distance
  // covered in one pass — divide it by the speed and both rows keep step.
  const halfWidth = repeats * brands.length * TILE_WIDTH;
  const duration = `${(halfWidth / SPEED_PX_PER_SECOND).toFixed(1)}s`;

  const half = Array.from({ length: repeats }, (_, copy) =>
    brands.map((brand) => (
      <li key={`${brand.slug}-${copy}`} className="w-36 shrink-0 px-1.5 sm:w-44 sm:px-2">
        <BrandTile brand={brand} />
      </li>
    )),
  ).flat();

  return (
    <div className="brand-rail-viewport">
      <div
        className="brand-rail"
        style={{ "--brand-rail-duration": duration } as CSSProperties}
      >
        <ul className="flex">{half}</ul>
        <ul className="flex" aria-hidden inert>
          {half}
        </ul>
      </div>
    </div>
  );
}

/**
 * Brands as a way *in* to the catalogue, for the home page.
 *
 * The catalogue already filters by brand, and `products/BrandBar` is the
 * control that does it — but that rail only exists once you are on
 * `/products`, which means a shopper who arrived knowing they want Sony had no
 * path to Sony from the front door. This is that path: every tile lands on the
 * same filtered listing the rail would have produced.
 *
 * Two rows that carry themselves right to left. The section keeps the footprint
 * of two rows however many brands there are, and the movement is what makes the
 * rest reachable without the grid growing down the page — a brand that is not
 * on screen now will be shortly. It stops on hover and on focus, because a link
 * that slides away from the cursor is a link nobody can click.
 *
 * "All brands" is still there, and still matters: it is the way to see them all
 * at once rather than waiting for one to come round, and the way anyone who
 * cannot use the motion gets the full list.
 */
export function BrandStrip({
  brands,
  /** Where "All brands" goes. */
  allHref = "/brands",
}: {
  brands: BrandSummary[];
  allHref?: string;
}) {
  // A shop with no brands set up gets no empty section, matching how the
  // featured showcase and the sale shelf handle having nothing to say.
  if (brands.length === 0) return null;

  // Dealt alternately rather than split down the middle. `getShoppableBrands`
  // orders by how much the shop carries, so halving it would put every
  // well-known name in the top row and the thin end of the catalogue in the
  // bottom one. Alternating gives both rows a mix.
  const rows = [
    brands.filter((_, index) => index % 2 === 0),
    brands.filter((_, index) => index % 2 === 1),
  ].filter((row) => row.length > 0);

  return (
    <section className="mx-auto max-w-7xl pb-24">
      {/* The rule running from the heading to the link is the section's own
          typographic device. It does the work a second line of copy would
          otherwise do — tying the two ends of the row together so they read as
          one masthead — without the heading having to grow and out-shout the
          sections either side of it.

          Padding sits on the header rather than the section, so the rail below
          can run the full width and its tiles travel off the edge of the page
          instead of stopping short of a margin. */}
      <div className="mb-7 flex items-baseline gap-4 px-4 sm:px-6">
        <h2 className="text-on-surface text-headline-md shrink-0">
          Shop by <span className="accent-word">brand</span>
        </h2>

        <span aria-hidden className="bg-outline-variant hidden h-px flex-1 sm:block" />

        <Link
          href={allHref}
          className="label-caps text-on-surface-variant hover:text-primary shrink-0 rounded-sm font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          All brands
        </Link>
      </div>

      {/* `brand-rails` is what makes a hover on either row stop both. The pause
          used to hang off each row's own viewport, so the untouched row carried
          on — and reaching for a tile on the still-moving row while the other
          sat frozen read as one of them having broken. */}
      <div className="brand-rails space-y-4">
        {rows.map((row, index) => (
          <BrandRail key={index} brands={row} />
        ))}
      </div>
    </section>
  );
}
