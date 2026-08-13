import Link from "next/link";

import type { LogoTreatment } from "@/generated/prisma/enums";
import { BrandMark } from "@/components/brands/BrandMark";
import { ScrollRail } from "@/components/ui/ScrollRail";
import { brandInitials } from "@/lib/brands/initials";
import { cn } from "@/lib/cn";

export interface BrandBarItem {
  slug: string;
  name: string;
  iconSvg: string | null;
  logo: string | null;
  logoTreatment: LogoTreatment;
  /** Resolved on the server — selecting this brand, keeping every other filter. */
  href: string;
}

/** The plate behind each mark, in px. */
const PLATE = 36;

/**
 * Brands as a bar across the top of the catalogue.
 *
 * Brand is the one facet that is a *destination* rather than a refinement —
 * shoppers arrive knowing they want Apple or they don't — so it reads as a
 * masthead above the results rather than another row in the filter rail.
 *
 * Built as **tabs**, not pills. The two look similar at a glance and behave
 * quite differently: a row of pills is a set of independent toggles, which is
 * what the spec and price filters genuinely are, whereas brand is single-select
 * and every option is mutually exclusive with the rest. A tab sitting on a rule
 * says that — one is always current, choosing another moves you rather than
 * adding to a selection — and it shares the plate treatment with the home
 * page's `BrandStrip` so the same brand looks like itself on both screens.
 *
 * It scrolls horizontally rather than wrapping, at every width. That is not a
 * mobile concession: a wrapped row of seventeen brands pushes the results below
 * the fold, and the underline only reads as a rule the tabs sit on while there
 * is a single row for it to sit on.
 *
 * That scrolling row is wrapped in `ScrollRail` for one reason: the scrollbar
 * is hidden here, and hiding it took away the only sign the row moves. A
 * trackpad, a touchscreen and shift-and-wheel all still worked, so the brands
 * past the right edge were reachable in principle and invisible in practice to
 * anyone on a plain mouse. The buttons are the affordance the hidden scrollbar
 * used to be; they appear only when the row actually overflows.
 */
export function BrandBar({
  brands,
  active,
  allHref,
}: {
  brands: BrandBarItem[];
  /** Slug of the selected brand, or "" for all. */
  active: string;
  allHref: string;
}) {
  if (brands.length === 0) return null;

  return (
    <nav aria-label="Brands" className="border-outline-variant mt-6 border-y">
      {/* `-mb-px` pulls the tabs' own bottom border down over the nav's, so the
          selected underline replaces that rule rather than stacking a second
          line beneath it. Negative side margins let the strip bleed to the
          viewport edge, so a scrolled row does not appear to stop short. Both
          now sit on the scrolling element inside `ScrollRail` rather than on
          the list, because that element is the one that overflows. */}
      <ScrollRail
        label="brands"
        contentClassName="-mx-4 -mb-px px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
      >
        <ul className="flex gap-1">
        <li>
          <Link
            href={allHref}
            aria-current={active ? undefined : "true"}
            className={cn(
              "label-caps flex h-16 shrink-0 items-center border-b-2 px-3 font-semibold whitespace-nowrap transition-colors duration-200",
              "focus-visible:outline-2 focus-visible:outline-offset-2",
              active
                ? "text-on-surface-variant hover:text-on-surface border-transparent hover:border-outline-variant"
                : "border-primary text-on-surface",
            )}
          >
            All brands
          </Link>
        </li>

        {brands.map((brand) => {
          const selected = active === brand.slug;
          return (
            <li key={brand.slug}>
              <Link
                href={brand.href}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "group flex h-16 shrink-0 items-center gap-2.5 border-b-2 px-3 transition-colors duration-200",
                  "focus-visible:outline-2 focus-visible:outline-offset-2",
                  selected
                    ? "border-primary"
                    : "hover:border-outline-variant border-transparent",
                )}
              >
                {/* The plate is what carries the selected state, alongside the
                    underline. Two signals rather than one because the rail
                    scrolls: the underline of the current tab can be off-screen,
                    and a tinted plate is still recognisable in peripheral
                    vision on the way back to it. */}
                <span
                  className={cn(
                    "grid shrink-0 place-items-center overflow-hidden rounded-lg transition-colors duration-200",
                    selected
                      ? "bg-primary-container text-on-primary-container"
                      : "bg-surface-container text-on-surface group-hover:bg-secondary-container group-hover:text-on-secondary-container",
                  )}
                  style={{ width: PLATE, height: PLATE }}
                >
                  {brand.iconSvg || brand.logo ? (
                    /* `max-w-full!` caps a hosted logo to the plate — its own
                       width allowance is sized for a card's text line and would
                       spill straight out of this box. It has to beat an inline
                       style, hence the important. */
                    <BrandMark
                      svg={brand.iconSvg}
                      logo={brand.logo}
                      treatment={brand.logoTreatment}
                      size={20}
                      className="max-w-full!"
                    />
                  ) : (
                    /* Initials rather than an empty plate — the same stand-in
                       the home page uses, so a brand with no artwork is
                       recognisably the same brand on both screens. */
                    <span
                      aria-hidden
                      className="text-label-sm font-semibold tracking-[0.06em] opacity-70 select-none"
                    >
                      {brandInitials(brand.name)}
                    </span>
                  )}
                </span>

                <span
                  className={cn(
                    "label-caps font-semibold whitespace-nowrap transition-colors duration-200",
                    selected
                      ? "text-on-surface"
                      : "text-on-surface-variant group-hover:text-on-surface",
                  )}
                >
                  {brand.name}
                </span>
              </Link>
            </li>
          );
        })}
        </ul>
      </ScrollRail>
    </nav>
  );
}
