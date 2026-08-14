"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/cn";
import { DURATION, EASE_STANDARD, NO_MOTION, PANEL_TRANSITION, SPRING } from "@/lib/motion";
import { Icon } from "@/components/ui/Icon";
import { BrandMark } from "@/components/brands/BrandMark";
import { brandInitials } from "@/lib/brands/initials";
import { useDismissable } from "@/lib/hooks/useDismissable";
import { NAV_PANEL_VARIANTS, useNavMenu } from "./NavMenuGroup";
import type { BrandSummary } from "@/lib/brands/service";

/**
 * "Brands" nav item with a mark grid hanging off it.
 *
 * The counterpart to `ProductsMenu`, and deliberately not the same shape. That
 * menu is a rail and a detail panel because categories nest; brands are a flat
 * list, so there is no second level for a rail to point at. What a brand list
 * has instead is *artwork* — and a shopper who came for Logitech is looking for
 * the mark, not scanning a column of words for it. So this is a grid of plates,
 * the same plate the home strip and `/brands` use, at menu size.
 *
 * Only the brands the shop actually carries reach here, ordered by how deep the
 * catalogue is behind each one, and capped — see `MENU_BRAND_LIMIT` in
 * `lib/nav/data`. "All brands" in the footer is what makes the cap safe: the
 * thirteenth brand is one click away rather than unreachable.
 *
 * The trigger is a real link to `/brands` at every width, so the menu is an
 * accelerator over that page rather than the only way to it. Hover opens it,
 * focus opens it, and Escape or a click outside closes it — all of which is
 * `useDismissable` plus the same close-timer dance `ProductsMenu` uses, so the
 * two menus in one bar cannot behave differently.
 */

/** One brand, as a plate with its name under it. */
function BrandCell({ brand, onNavigate }: { brand: BrandSummary; onNavigate: () => void }) {
  return (
    <Link
      href={`/products?brand=${brand.slug}`}
      onClick={onNavigate}
      className="group block rounded-xl p-1.5 transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2"
    >
      {/* Wider than tall for the same reason the full-size tile is: the artwork
          that needs the room is a wordmark, and a square plate would spend its
          height on the empty bands above and below the lettering. */}
      <span className="bg-surface-container group-hover:bg-secondary-container flex h-12 items-center justify-center overflow-hidden rounded-lg px-3 transition-colors duration-200">
        {/* `fallback` covers both brands with no artwork at all and a hosted
            logo that fails to load — the initials are what stop either from
            leaving a blank plate in the middle of the grid. */}
        <BrandMark
          svg={brand.iconSvg}
          logo={brand.logo}
          treatment={brand.logoTreatment}
          size={28}
          className="text-on-surface max-w-full! opacity-80 transition-opacity duration-200 group-hover:opacity-100"
          fallback={
            <span
              aria-hidden
              className="text-on-surface-variant/70 group-hover:text-on-secondary-container/80 text-sm font-medium tracking-[0.12em] transition-colors duration-200 select-none"
            >
              {brandInitials(brand.name)}
            </span>
          }
        />
      </span>

      {/* Tracked caps, as everywhere else a brand name is set — the label is an
          identifier rather than a sentence, and the tracking is what stops a
          grid of them reading as a paragraph. The name carries the cell: a
          brand showing only initials has nothing else to identify it by. */}
      <span className="label-caps text-on-surface group-hover:text-primary mt-2 block truncate text-center font-semibold transition-colors duration-200">
        {brand.name}
      </span>
    </Link>
  );
}

export function BrandsMenu({
  brands,
  active,
}: {
  brands: BrandSummary[];
  active: boolean;
}) {
  const reduceMotion = useReducedMotion();

  // Shared with the catalogue menu rather than held here, so that entering one
  // trigger from the other closes the first in the same render instead of
  // leaving both panels open for the length of a close timer. See
  // `NavMenuGroup` for what that looked like.
  const { open, replaced, openNow, closeSoon, close } = useNavMenu("brands");

  const ref = useDismissable<HTMLDivElement>(open, close);

  // A shop with no shoppable brands gets the plain link it had before rather
  // than a chevron that opens an empty card.
  const hasMenu = brands.length > 0;

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={hasMenu ? openNow : undefined}
      onMouseLeave={hasMenu ? closeSoon : undefined}
      onFocus={hasMenu ? openNow : undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) closeSoon();
      }}
    >
      <Link
        href="/brands"
        aria-haspopup={hasMenu ? "true" : undefined}
        aria-expanded={hasMenu ? open : undefined}
        aria-current={active ? "page" : undefined}
        onClick={close}
        onKeyDown={(event) => {
          if (hasMenu && event.key === "ArrowDown") {
            event.preventDefault();
            openNow();
          }
        }}
        className={cn(
          // Matches the Products trigger: tighter until `lg`, so the bar fits
          // at `md`, where the whole nav is showing but the icon cluster has
          // not yet dropped anything.
          "relative flex items-center gap-1 rounded-full px-2 py-2 text-sm font-medium lg:px-4",
          "transition-colors duration-200 ease-in-out",
          "focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95",
          active
            ? "text-on-secondary-container"
            : "text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.06]",
        )}
      >
        {active && (
          // The same shared id the other bar links use, so the pill slides
          // between them on navigation instead of cross-fading.
          <motion.span
            layoutId="navbar-active-pill"
            className="bg-secondary-container absolute inset-0 rounded-full"
            transition={
              reduceMotion ? NO_MOTION : SPRING.panel
            }
          />
        )}
        <span className="relative z-10">Brands</span>
        {hasMenu && (
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={
              reduceMotion ? NO_MOTION : { duration: DURATION.short4, ease: EASE_STANDARD }
            }
            className="relative z-10 grid place-items-center"
          >
            <Icon name="expand_more" size={16} />
          </motion.span>
        )}
      </Link>

      <AnimatePresence custom={replaced}>
        {open && hasMenu && (
          <motion.div
            // Variants rather than literal states, and `custom` rather than a
            // computed `exit` — a menu being *replaced* by its neighbour leaves
            // at once instead of fading behind it. See `NAV_PANEL_VARIANTS`.
            custom={replaced}
            variants={NAV_PANEL_VARIANTS}
            initial="hidden"
            animate="shown"
            exit="hidden"
            transition={
              reduceMotion ? NO_MOTION : PANEL_TRANSITION
            }
            // `pt-2` rather than `mt-2`, for the reason set out in
            // `ProductsMenu`: the gap between trigger and card has to belong to
            // the hover target, or a pointer crossing it slowly runs out the
            // close timer and shuts the menu on its way in.
            className="absolute top-full left-0 z-50 origin-top-left pt-2"
          >
            <div className="bg-surface-container-high shadow-elevation-2 w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-2xl">
              <div className="p-3">
                <p className="label-caps text-on-surface-variant px-1.5 pt-1 pb-2">
                  Shop by brand
                </p>

                <ul className="grid grid-cols-3 gap-x-1 gap-y-2">
                  {brands.map((brand) => (
                    <li key={brand.slug}>
                      <BrandCell brand={brand} onNavigate={close} />
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-outline-variant bg-surface-container flex items-center gap-1 border-t p-2">
                <Link
                  href="/brands"
                  onClick={close}
                  className="group text-primary hover:bg-primary/[0.08] mr-auto flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2"
                >
                  <Icon name="storefront" size={18} />
                  All brands
                  <Icon
                    name="arrow_forward"
                    size={18}
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </Link>
                {/* The catalogue, from here — a shopper who opened this menu and
                    found nothing they recognised should not have to close it
                    again to get back to browsing. */}
                <Link
                  href="/products"
                  onClick={close}
                  className="text-on-surface-variant hover:bg-on-surface/[0.08] hover:text-on-surface flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2"
                >
                  <Icon name="grid_view" size={18} />
                  All products
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
