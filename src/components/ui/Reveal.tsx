"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Reveals its contents as they scroll into view.
 *
 * An IntersectionObserver rather than `animation-timeline: view()`. The CSS
 * version is the nicer mechanism — it runs on the compositor and needs no
 * JavaScript at all — but it is Chromium and very recent Safari only, so on
 * anything else the effect simply never appeared.
 *
 * The important property is kept either way: **the server renders visible
 * markup**. Nothing is hidden until this component has mounted and decided to
 * hide it, so a visitor whose JavaScript is slow, blocked or broken sees the
 * banners rather than an empty page. A `useState`-driven version would have to
 * render `opacity: 0` and wait for hydration to undo it.
 *
 * State lives in a data attribute rather than React state on purpose: this
 * fires once per element and never re-renders anything, so involving the
 * reconciler would be pure overhead.
 */
export function Reveal({
  children,
  className,
  /** Staggers siblings. Milliseconds. */
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Already on screen when we mounted — leave it alone. Hiding something the
    // visitor is looking at so it can fade back in is a flash, not a reveal.
    if (element.getBoundingClientRect().top < window.innerHeight) return;

    element.dataset.reveal = "pending";

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        element.dataset.reveal = "shown";
        // One-shot: re-playing on every pass turns a flourish into a twitch.
        observer.disconnect();
      },
      // Fires a little before the element's edge reaches the fold, so the
      // motion is underway by the time it is properly in frame.
      { rootMargin: "0px 0px -12% 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
