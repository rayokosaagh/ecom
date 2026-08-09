"use client";

import { useRef, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Tilts its contents toward the pointer.
 *
 * A client shell around server-rendered children, so a card can use this
 * without itself becoming a client component — the children arrive as an
 * already-rendered slot and none of their code ships to the browser.
 *
 * Three things make this cheap enough to put on every card in a grid:
 *
 *  1. **No React state.** The angles are written straight onto the node as CSS
 *     custom properties. State would re-render every card in the grid on every
 *     mouse move, which on a twenty-product page is the whole grid
 *     reconciling at pointer frequency.
 *  2. **One rAF per frame.** `getBoundingClientRect` is a layout read and
 *     setting a style is a write; interleaving them per event forces a
 *     synchronous reflow each time. Deferring the pair into a frame keeps them
 *     batched, and a superseded frame is cancelled rather than queued.
 *  3. **No `will-change`.** Promoting every card in a grid to its own layer
 *     costs more memory than the few degrees of rotation are worth; the
 *     transform promotes itself while it is actually animating.
 *
 * The `.tilt` class in globals.css carries the transform and the guards that
 * neutralise it under reduced motion and on coarse pointers.
 */
export function Tilt({
  children,
  className,
  /**
   * Maximum rotation on each axis.
   *
   * What reads as "too much" scales with the subject. On a grid card — a small
   * rectangle among twenty others — past ~10deg is a gimmick. On the featured
   * stage, where one cut-out product stands alone at four times the size, the
   * same angle is barely perceptible and the showcase runs far higher.
   */
  maxDeg = 8,
  /**
   * How far the subject also slides toward the pointer, in pixels.
   *
   * Rotation alone stops reading as movement once the subject is large: the
   * far edge travels, but the middle — which is where the eye is — barely
   * does. A small translation moves the whole mass and is what actually sells
   * the sway. Off by default, because on a card in a grid it would fight the
   * hover lift the card already has.
   */
  maxShiftPx = 0,
}: {
  children: ReactNode;
  className?: string;
  maxDeg?: number;
  maxShiftPx?: number;
}) {
  const frame = useRef(0);
  // Created lazily on first use: `matchMedia` does not exist during SSR, and a
  // pointer event can only happen on the client. The list stays live, so a
  // preference changed mid-session is respected without re-mounting.
  const reducedMotion = useRef<MediaQueryList | null>(null);

  const write = (
    element: HTMLElement,
    x: string,
    y: string,
    shiftX: string,
    shiftY: string,
  ) => {
    element.style.setProperty("--tilt-x", x);
    element.style.setProperty("--tilt-y", y);
    element.style.setProperty("--tilt-shift-x", shiftX);
    element.style.setProperty("--tilt-shift-y", shiftY);
  };

  return (
    <div
      className={cn("tilt", className)}
      onPointerMove={(event) => {
        // Touch and pen also raise pointer events; only a mouse should tilt.
        if (event.pointerType !== "mouse") return;

        reducedMotion.current ??= window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        );
        if (reducedMotion.current.matches) return;

        // Captured before the frame: React clears `currentTarget` once the
        // handler returns, so reading it inside the callback would be null.
        const element = event.currentTarget;
        const { clientX, clientY } = event;

        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;

          // -0.5 … 0.5 from the centre of the card.
          const px = (clientX - rect.left) / rect.width - 0.5;
          const py = (clientY - rect.top) / rect.height - 0.5;

          // X rotation is inverted: pointer above centre should tip the top
          // edge away, not toward. The slide is *not* inverted — the subject
          // leans into the pointer, which is what the rotation is already
          // doing and what keeps the two reading as one movement.
          write(
            element,
            `${-py * maxDeg}deg`,
            `${px * maxDeg}deg`,
            `${px * maxShiftPx}px`,
            `${py * maxShiftPx}px`,
          );
        });
      }}
      onPointerLeave={(event) => {
        cancelAnimationFrame(frame.current);
        // Zeroes rather than clearing the properties, so the transition has
        // something to ease back to instead of snapping to the default.
        write(event.currentTarget, "0deg", "0deg", "0px", "0px");
      }}
    >
      {children}
    </div>
  );
}
