"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { useDismissable } from "@/lib/hooks/useDismissable";

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
 */
export function ProductsMenu({
  categories,
  active,
}: {
  categories: MenuCategory[];
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ref = useDismissable<HTMLDivElement>(open, () => setOpen(false));

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const openNow = () => {
    cancelClose();
    setOpen(true);
  };

  const closeSoon = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  };

  const close = () => {
    cancelClose();
    setOpen(false);
  };

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
            setOpen(true);
          }
        }}
        className={cn(
          "relative flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium",
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
              reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }
            }
          />
        )}
        <span className="relative z-10">Products</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
          className="relative z-10 grid place-items-center"
        >
          <Icon name="expand_more" size={16} />
        </motion.span>
      </Link>

      <AnimatePresence>
        {open && categories.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={
              reduceMotion ? { duration: 0 } : { duration: 0.15, ease: [0.2, 0, 0, 1] }
            }
            // `pt-2` rather than `mt-2`: the gap between trigger and card has to
            // belong to the hover target. As a margin it was dead space, and a
            // pointer that crossed it slowly enough ran out the close timer and
            // shut the menu on its way in.
            className="absolute top-full left-0 z-50 origin-top-left pt-2"
          >
            <div className="bg-surface-container-high shadow-elevation-2 w-[min(46rem,calc(100vw-2rem))] overflow-hidden rounded-2xl">
              <div className="flex">
                {/* ---------- Rail: fixed width, never reflows ---------- */}
                <ul className="border-outline-variant w-56 shrink-0 border-r p-2">
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
                            "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm",
                            "transition-colors duration-150",
                            "focus-visible:outline-2 focus-visible:-outline-offset-2",
                            isSelected
                              ? "bg-secondary-container text-on-secondary-container font-medium"
                              : "text-on-surface hover:bg-on-surface/[0.06]",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{category.name}</span>
                          {category.children.length > 0 && (
                            <Icon name="chevron_right" size={16} className="shrink-0 opacity-70" />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>

                {/* ---------- Detail: floor height stops the card resizing ---------- */}
                <div className="min-h-56 min-w-0 flex-1 p-4">
                  {selected && (
                    <>
                      <Link
                        href={`/products?category=${selected.slug}`}
                        onClick={close}
                        className="text-primary group inline-flex items-center gap-1.5 rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        All {selected.name}
                        <Icon
                          name="arrow_forward"
                          size={16}
                          className="transition-transform duration-200 group-hover:translate-x-0.5"
                        />
                      </Link>

                      {selected.children.length === 0 ? (
                        <p className="text-on-surface-variant mt-3 text-sm">
                          No subcategories — everything in {selected.name} sits on
                          one shelf.
                        </p>
                      ) : (
                        <ul className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                          {selected.children.map((child) => (
                            <li key={child.slug}>
                              <Link
                                href={`/products?category=${child.slug}`}
                                onClick={close}
                                className="text-on-surface hover:bg-on-surface/[0.06] block truncate rounded-lg px-2.5 py-2 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2"
                              >
                                {child.name}
                              </Link>

                              {/* A third level, listed under its parent rather
                                  than behind another hover: by this depth the
                                  names are the specific thing someone came for
                                  ("Earbuds", "Over-ear"), and hiding them costs
                                  more than the space they take. */}
                              {child.children.length > 0 && (
                                <ul className="border-outline-variant mt-0.5 mb-1 ml-3 space-y-0.5 border-l pl-2">
                                  {child.children.map((grandchild) => (
                                    <li key={grandchild.slug}>
                                      <Link
                                        href={`/products?category=${grandchild.slug}`}
                                        onClick={close}
                                        className="text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.06] block truncate rounded-md px-2 py-1.5 text-[13px] transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2"
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

              <div className="border-outline-variant bg-surface-container border-t p-2">
                <Link
                  href="/products"
                  onClick={close}
                  className="text-primary hover:bg-primary/[0.08] flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2"
                >
                  View all products
                  <Icon name="arrow_forward" size={18} />
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
