"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { useCompare } from "@/components/products/useCompare";

/**
 * Return to the top of a long page.
 *
 * Mounted once in the root layout, so it is available on every route without
 * each page opting in. Nothing here is page-specific: the window is what
 * scrolls everywhere in this app — no layout puts its content in an inner
 * scroll container — so one listener covers the storefront and the dashboard
 * alike.
 */

/**
 * How far down before it appears.
 *
 * Deliberately more than a screen: offered while the top is still in view it is
 * a button that does nothing, and on a short page it would appear and vanish as
 * the address bar collapses on a phone.
 */
const SHOW_AFTER_PX = 800;

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const { items } = useCompare();

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);

    // Read once on mount as well as on scroll: arriving at an anchor, or the
    // browser restoring a scroll position on back, both start the page part-way
    // down without ever firing a scroll event.
    onScroll();

    // `passive`, because this listener never calls preventDefault and telling
    // the browser so keeps it off the scrolling critical path.
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /**
   * The comparison tray is docked to the same edge.
   *
   * Hidden rather than nudged out of the way: the tray's height depends on how
   * many products are queued and how they wrap, so any offset that cleared it
   * would be a guess that breaks at some width. Two floating controls competing
   * for one corner is worse than one, and the tray is the one the shopper
   * deliberately opened.
   */
  if (!visible || items.length > 0) return null;

  const scrollToTop = () => {
    // Honour the OS setting rather than the CSS one: this is a scripted scroll,
    // so `scroll-behavior` in a stylesheet does not apply to it.
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });

    /**
     * Move focus as well as the viewport.
     *
     * Scrolling alone leaves a keyboard user's focus wherever it was — they
     * press Tab and are thrown back down the page they just left. Focusing
     * `main` puts the next Tab at the start of the content, which is what the
     * scroll implied was going to happen.
     *
     * `preventScroll` so the focus call does not fight the smooth scroll it was
     * issued alongside.
     */
    const main = document.querySelector("main");
    if (main instanceof HTMLElement) {
      // `main` is not focusable by default; -1 makes it programmatically
      // focusable without adding it to the tab order.
      main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: true });
    }
  };

  return (
    /**
     * The wrapper is what is positioned, and that separation is load-bearing.
     *
     * `.state-layer` is declared in `@layer utilities` and sets
     * `position: relative`; being a custom utility it is emitted after
     * Tailwind's, so on one element it wins and silently overrides `fixed`.
     * Both classes on the button put it in normal flow at the end of `<body>`,
     * below the footer — present in the DOM, never on screen.
     */
    <div className="animate-rise fixed right-4 bottom-4 z-40 sm:right-6 sm:bottom-6">
      <button
        type="button"
        onClick={scrollToTop}
        aria-label="Back to top"
        title="Back to top"
        className={cn(
          "bg-surface-container-high text-on-surface-variant shadow-elevation-2",
          "state-layer grid size-12 place-items-center rounded-full",
          "transition-[box-shadow,transform] duration-200 ease-standard",
          "hover:shadow-elevation-3 hover:-translate-y-0.5",
          "focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95",
          "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        )}
      >
        <Icon name="arrow_upward" size={22} />
      </button>
    </div>
  );
}
