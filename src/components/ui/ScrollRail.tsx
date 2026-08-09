"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";

/** How much of the visible width one press moves, leaving a little overlap. */
const PAGE_FRACTION = 0.8;

/**
 * A horizontal scroller with buttons for the people who have no way to scroll it.
 *
 * A row with `overflow-x-auto` and a hidden scrollbar is fully navigable with a
 * trackpad, a touchscreen, or shift-and-wheel — and completely stuck for anyone
 * on a plain mouse, because we deliberately removed the one affordance that
 * said it could move. That is the gap this closes: the content past the right
 * edge was reachable in principle and invisible in practice.
 *
 * The buttons are an *addition*, never the mechanism. The scroller is ordinary
 * overflow, so touch and trackpad keep working untouched, tabbing to a link
 * still scrolls it into view, and with JavaScript off the row behaves exactly as
 * it did before — the buttons simply never appear.
 *
 * They also never appear when everything already fits: a control that cannot do
 * anything is worse than no control, because it invites a press that does
 * nothing.
 */
export function ScrollRail({
  children,
  label,
  className,
  contentClassName,
}: {
  children: ReactNode;
  /** Named in the button labels, e.g. "brands" → "Scroll brands right". */
  label: string;
  /** On the outer positioning context. */
  className?: string;
  /** On the scrolling element itself — margins, padding, bleed. */
  contentClassName?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    const { scrollLeft, scrollWidth, clientWidth } = element;
    // A pixel of slack at both ends. Sub-pixel layout means `scrollLeft` often
    // settles a fraction short of its maximum, which would leave the "next"
    // button enabled forever on a row that has visibly reached the end.
    setAtStart(scrollLeft <= 1);
    setAtEnd(scrollLeft >= scrollWidth - clientWidth - 1);
  }, []);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;

    measure();
    element.addEventListener("scroll", measure, { passive: true });

    // Both are needed. The row's own width changes when the window resizes, and
    // its *content* width changes when a filter narrows the brand list — the
    // observer catches the second, which a resize listener alone would miss and
    // leave with buttons describing a row that is no longer there.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);

    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  const page = (direction: -1 | 1) => {
    const element = scroller.current;
    if (!element) return;
    element.scrollBy({
      left: direction * element.clientWidth * PAGE_FRACTION,
      // Asked at the moment of the press rather than read once into state: the
      // setting can change while the page is open, and a smooth scroll is
      // exactly the kind of motion someone turns off mid-session.
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  // Both ends reachable means the content fits, so there is nothing to scroll.
  const fits = atStart && atEnd;

  /**
   * Softens whichever edge still has content behind it.
   *
   * A mask rather than a gradient overlay, for the reason the buttons are
   * raised rather than faded: this drops into pages with different
   * backgrounds, and a gradient has to know the colour behind it. A mask does
   * not — it removes the pixels instead of painting over them, so the same
   * rule works on any surface and in either theme.
   *
   * Only the end that overflows is faded. Fading a reached end would dim the
   * first tab — "All brands" — for no reason, and a permanently half-visible
   * control reads as disabled.
   */
  const mask = fits
    ? undefined
    : `linear-gradient(to right, ${
        atStart ? "#000 0%" : "transparent 0%, #000 72px"
      }, ${atEnd ? "#000 100%" : "#000 calc(100% - 72px), transparent 100%"})`;

  return (
    <div className={cn("group/rail relative", className)}>
      <div
        ref={scroller}
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        className={cn(
          "overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          contentClassName,
        )}
      >
        {children}
      </div>

      {!fits && (
        <>
          <RailButton
            icon="chevron_left"
            label={`Scroll ${label} left`}
            side="left"
            disabled={atStart}
            onClick={() => page(-1)}
          />
          <RailButton
            icon="chevron_right"
            label={`Scroll ${label} right`}
            side="right"
            disabled={atEnd}
            onClick={() => page(1)}
          />
        </>
      )}
    </div>
  );
}

/**
 * The positioning lives on a wrapper, not on the button, and that is a fix
 * rather than a preference.
 *
 * `IconButton` always carries `state-layer`, which sets `position: relative` so
 * its `::after` overlay has something to sit in. `cn` is a plain joiner — not
 * tailwind-merge, deliberately — so an `absolute` passed through `className`
 * does not replace that `relative`; both reach the element and the stylesheet's
 * source order decides. `.state-layer` is hand-written inside `@layer
 * utilities` and is emitted after Tailwind's generated utilities, so `relative`
 * wins and the button stays in normal flow.
 *
 * That is exactly what had happened here: both buttons sat stacked at the left
 * edge, one under the other, forty pixels apart — measurable as two rects at
 * the same x. Giving the wrapper the position sidesteps the cascade entirely
 * instead of trying to out-specify it.
 */
function RailButton({
  icon,
  label,
  side,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <span
      className={cn(
        // Floating over the row rather than beside it, so the tabs keep the
        // full width and the control costs no layout.
        "absolute top-1/2 z-10 -translate-y-1/2",
        "transition-[opacity,transform] duration-[var(--duration-short4)] ease-[var(--ease-emphasized)]",
        // Exactly one `pointer-events` utility, never a base plus an override:
        // `cn` joins rather than merges, so both would reach the element and
        // stylesheet order would decide — which is how this shipped inert the
        // first time, with `none` winning over the `auto` meant to undo it.
        //
        // Scaled down as well as faded at the ends, so it retracts toward the
        // edge rather than simply vanishing. Hidden rather than unmounted, so
        // the other button does not shift when this one becomes unusable.
        disabled
          ? "pointer-events-none scale-75 opacity-0"
          : "pointer-events-auto scale-100 opacity-100",
        side === "left" ? "left-2" : "right-2",
      )}
    >
      <IconButton
        icon={icon}
        label={label}
        size={20}
        onClick={onClick}
        disabled={disabled}
        variant="tonal"
        className={cn(
          // A raised tonal chip rather than a bare glyph: it sits over moving
          // content, and it has to stay legible whichever tab happens to be
          // underneath it.
          "shadow-elevation-2 hover:shadow-elevation-3 ring-outline-variant/60 size-10 ring-1",
          "hover:scale-105",
        )}
      />
    </span>
  );
}
