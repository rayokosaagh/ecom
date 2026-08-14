"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/cn";
import { DURATION, EASE_STANDARD, NO_MOTION, PANEL_TRANSITION, SPRING } from "@/lib/motion";
import { Icon } from "@/components/ui/Icon";
import { categoryIcon } from "@/lib/categories/icons";
import { useDismissable } from "@/lib/hooks/useDismissable";
import { NAV_PANEL_VARIANTS, useNavMenu } from "./NavMenuGroup";

export interface MenuCategory {
  name: string;
  slug: string;
  /** Subcategories, revealed under their parent. Nests to any depth. */
  children: MenuCategory[];
}

/**
 * "Products" nav item with a category mega-menu.
 *
 * **Two panels, not one expanding list.** The previous version let each
 * category expand its children inline inside a two-column grid, and that made
 * the lower half of the menu unusable: hovering "Laptops" on the way past grew
 * its cell by four rows, which pushed "Peripherals" 152px down the page — so
 * aiming at Peripherals moved it out from under the pointer, and chasing it
 * left Laptops, which collapsed and snapped everything back up. A rail whose
 * rows never move cannot do that. Nothing here changes size on hover: the rail
 * is fixed-width, and the detail panel has a floor tall enough for the longest
 * category so switching between them does not resize the card either.
 *
 * The rail selects on hover *and* on focus, so the same movement works with a
 * pointer or with Tab, and every row stays a real link — hovering previews a
 * category, clicking goes there.
 *
 * **Every glyph is decorative.** The icons carry no information the adjacent
 * text does not already carry, which is what makes them safe to derive from a
 * name — a wrong guess costs a slightly odd picture, never a wrong link. They
 * are `aria-hidden` throughout, so a screen reader reads the shelf names and
 * nothing else.
 */

/**
 * The tinted square a category glyph sits in.
 *
 * Fixed size at every level so the text beside it starts on the same vertical
 * line down the whole menu — an icon column that wanders is worse than no icon
 * column. `selected` is the rail's own state; `muted` is the quieter treatment
 * the second level uses, so the two levels do not compete for attention.
 */
function CategoryGlyph({
  name,
  size = 32,
  selected = false,
  muted = false,
}: {
  name: string;
  size?: 28 | 32 | 36;
  selected?: boolean;
  muted?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-lg transition-colors duration-150",
        size === 36 && "size-9",
        size === 32 && "size-8",
        size === 28 && "size-7",
        selected
          ? "bg-primary text-on-primary"
          : muted
            ? "bg-surface-container-highest text-on-surface-variant group-hover:bg-primary-container group-hover:text-on-primary-container"
            : "bg-surface-container-highest text-on-surface-variant",
      )}
    >
      <Icon name={categoryIcon(name)} size={size === 36 ? 20 : size === 32 ? 18 : 16} />
    </span>
  );
}
export function ProductsMenu({
  categories,
  active,
}: {
  categories: MenuCategory[];
  active: boolean;
}) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  // Shared with the brands menu rather than held here, so that entering one
  // trigger from the other closes the first in the same render instead of
  // leaving both panels open for the length of a close timer. See
  // `NavMenuGroup` for what that looked like.
  const { open, replaced, openNow, closeSoon, close } = useNavMenu("products");

  const ref = useDismissable<HTMLDivElement>(open, close);

  // Falls back to the first category rather than holding null, so the detail
  // panel always has something in it and never opens blank.
  const selected =
    categories.find((category) => category.slug === activeSlug) ?? categories[0];

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
      // Focus moving anywhere inside opens it; leaving the whole group closes.
      onFocus={openNow}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) closeSoon();
      }}
    >
      <Link
        href="/products"
        aria-haspopup="true"
        aria-expanded={open}
        aria-current={active ? "page" : undefined}
        onClick={close}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openNow();
          }
        }}
        className={cn(
          // Matches the Brands trigger: tighter until `lg`, so the bar fits at
          // `md`, where the whole nav is showing but the icon cluster has not
          // yet dropped anything.
          "relative flex items-center gap-1 rounded-full px-2 py-2 text-sm font-medium lg:px-4",
          "transition-colors duration-200 ease-in-out",
          "focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95",
          active
            ? "text-on-secondary-container"
            : "text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.06]",
        )}
      >
        {active && (
          <motion.span
            layoutId="navbar-active-pill"
            className="bg-secondary-container absolute inset-0 rounded-full"
            transition={
              reduceMotion ? NO_MOTION : SPRING.panel
            }
          />
        )}
        <span className="relative z-10">Products</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={
            reduceMotion ? NO_MOTION : { duration: DURATION.short4, ease: EASE_STANDARD }
          }
          className="relative z-10 grid place-items-center"
        >
          <Icon name="expand_more" size={16} />
        </motion.span>
      </Link>

      <AnimatePresence custom={replaced}>
        {open && categories.length > 0 && (
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
            // `pt-2` rather than `mt-2`: the gap between trigger and card has to
            // belong to the hover target. As a margin it was dead space, and a
            // pointer that crossed it slowly enough ran out the close timer and
            // shut the menu on its way in.
            className="absolute top-full left-0 z-50 origin-top-left pt-2"
          >
            <div className="bg-surface-container-high shadow-elevation-2 w-[min(48rem,calc(100vw-2rem))] overflow-hidden rounded-2xl">
              <div className="flex">
                {/* ---------- Rail: fixed width, never reflows ---------- */}
                <div className="border-outline-variant bg-surface-container w-60 shrink-0 border-r p-2">
                  <p className="label-caps text-on-surface-variant px-3 pt-1 pb-2">
                    Categories
                  </p>
                  <ul>
                    {categories.map((category) => {
                      const isSelected = category.slug === selected?.slug;
                      return (
                        <li key={category.slug}>
                          <Link
                            href={`/products?category=${category.slug}`}
                            onClick={close}
                            onMouseEnter={() => setActiveSlug(category.slug)}
                            onFocus={() => setActiveSlug(category.slug)}
                            className={cn(
                              "flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm",
                              "transition-colors duration-150",
                              "focus-visible:outline-2 focus-visible:-outline-offset-2",
                              isSelected
                                ? "bg-secondary-container text-on-secondary-container font-medium"
                                : "text-on-surface hover:bg-on-surface/[0.06]",
                            )}
                          >
                            <CategoryGlyph name={category.name} selected={isSelected} />
                            <span className="min-w-0 flex-1 truncate">{category.name}</span>
                            {category.children.length > 0 && (
                              <Icon
                                name="chevron_right"
                                size={16}
                                className={cn(
                                  "shrink-0 transition-opacity duration-150",
                                  isSelected ? "opacity-100" : "opacity-40",
                                )}
                              />
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* ---------- Detail: floor height stops the card resizing ---------- */}
                <div className="flex min-h-64 min-w-0 flex-1 flex-col p-4">
                  {selected && (
                    <>
                      {/* The heading names what the rail is pointing at, so the
                          panel is readable on its own rather than only as the
                          answer to whichever row happens to be highlighted. */}
                      <div className="border-outline-variant/60 flex items-center gap-3 border-b pb-3">
                        <CategoryGlyph name={selected.name} size={36} />
                        <div className="min-w-0 flex-1">
                          <p className="text-on-surface truncate text-sm font-medium">
                            {selected.name}
                          </p>
                          <p className="text-on-surface-variant text-xs">
                            {selected.children.length > 0
                              ? `${selected.children.length} subcategor${
                                  selected.children.length === 1 ? "y" : "ies"
                                }`
                              : "One shelf"}
                          </p>
                        </div>
                        <Link
                          href={`/products?category=${selected.slug}`}
                          onClick={close}
                          className="text-primary hover:bg-primary/[0.08] group inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          Shop all
                          <Icon
                            name="arrow_forward"
                            size={16}
                            className="transition-transform duration-200 group-hover:translate-x-0.5"
                          />
                        </Link>
                      </div>

                      {selected.children.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
                          <span className="bg-surface-container-highest text-on-surface-variant grid size-10 place-items-center rounded-full">
                            <Icon name="shelves" size={20} />
                          </span>
                          <p className="text-on-surface-variant max-w-[18rem] text-sm">
                            Everything in {selected.name} sits on one shelf.
                          </p>
                        </div>
                      ) : (
                        <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                          {selected.children.map((child) => (
                            <li key={child.slug}>
                              <Link
                                href={`/products?category=${child.slug}`}
                                onClick={close}
                                className="group text-on-surface hover:bg-on-surface/[0.06] flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2"
                              >
                                <CategoryGlyph name={child.name} size={28} muted />
                                <span className="min-w-0 flex-1 truncate">
                                  {child.name}
                                </span>
                              </Link>

                              {/* A third level, listed under its parent rather
                                  than behind another hover: by this depth the
                                  names are the specific thing someone came for
                                  ("Earbuds", "Over-ear"), and hiding them costs
                                  more than the space they take.

                                  Chips rather than another indented list — at
                                  this size they read as "and these", and they
                                  wrap into the space the two-column grid leaves
                                  instead of making each cell taller than the
                                  one beside it. No icons: three levels of glyph
                                  is a texture, not a hierarchy. */}
                              {child.children.length > 0 && (
                                <ul className="mb-1 flex flex-wrap gap-1 pl-[3.125rem]">
                                  {child.children.map((grandchild) => (
                                    <li key={grandchild.slug}>
                                      <Link
                                        href={`/products?category=${grandchild.slug}`}
                                        onClick={close}
                                        className="border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary/[0.06] block rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1"
                                      >
                                        {grandchild.name}
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="border-outline-variant bg-surface-container flex items-center gap-1 border-t p-2">
                <Link
                  href="/products"
                  onClick={close}
                  className="group text-primary hover:bg-primary/[0.08] mr-auto flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2"
                >
                  <Icon name="grid_view" size={18} />
                  Browse all products
                  <Icon
                    name="arrow_forward"
                    size={18}
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </Link>
                {/* The other two shelves worth a shortcut from here. Both are
                    real routes with their own pages; putting them beside the
                    catalogue saves a shopper who came to browse from having to
                    find them in the bar behind the open menu. */}
                <Link
                  href="/sale"
                  onClick={close}
                  className="text-on-surface-variant hover:bg-on-surface/[0.08] hover:text-on-surface flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2"
                >
                  <Icon name="sell" size={18} />
                  Sale
                </Link>
                <Link
                  href="/brands"
                  onClick={close}
                  className="text-on-surface-variant hover:bg-on-surface/[0.08] hover:text-on-surface flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2"
                >
                  <Icon name="storefront" size={18} />
                  Brands
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
