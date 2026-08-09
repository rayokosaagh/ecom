"use client";

import { useRef, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Where the lamp sits when nobody is pointing at it — behind the product's
    mass, since it lights from behind. Matches the registered `@property`
    initial values in globals.css — change both or neither. */
const REST_X = 50;
const REST_Y = 46;

/** How far the product's halo slides toward the pointer. See `.product-glow`. */
const GLOW_OFFSET_PX = 14;

/**
 * Aims the featured spotlight at the pointer.
 *
 * A client shell around server-rendered children, exactly like `Tilt`, and for
 * the same reason: the panel it wraps stays a server component and none of its
 * code ships to the browser.
 *
 * It also uses the same three tricks that make `Tilt` cheap enough to leave on
 * — no React state, one rAF per frame, no `will-change`. See the note there;
 * the reasoning is identical and is not repeated here.
 *
 * Why it moves at all: a fixed pool of light is a painted highlight, and the
 * eye reads it as part of the photograph rather than as lighting. Tied to the
 * pointer it becomes a lamp in a room, and — because the product tilts toward
 * the same point — the highlight and the subject agree about where the light
 * is coming from. That agreement is what the whole effect rests on; when the
 * light was static and only the product moved, the two quietly contradicted
 * each other.
 *
 * The travel is deliberately damped rather than one-to-one. A lamp that tracks
 * the cursor exactly reads as a cursor, not as lighting, and swinging the light
 * to the very corner of the panel leaves the product standing in the dark.
 */
export function Spotlight({
  children,
  className,
  /**
   * How far from rest the light may swing, as a fraction of the panel. 0.5
   * would let it reach the edges; a quarter of that keeps the product lit at
   * every pointer position while still clearly following.
   */
  travel = 0.13,
}: {
  children: ReactNode;
  className?: string;
  travel?: number;
}) {
  const frame = useRef(0);
  const reducedMotion = useRef<MediaQueryList | null>(null);

  const write = (
    element: HTMLElement,
    x: string,
    y: string,
    ease: string,
    glowX: string,
    glowY: string,
  ) => {
    // The duration is written before the position so the style recalc that
    // follows reads the new one — a transition takes its duration from the
    // after-change style, which is what lets the same handler do both a fast
    // follow and a slow return.
    element.style.setProperty("--spot-ease", ease);
    element.style.setProperty("--spot-x", x);
    element.style.setProperty("--spot-y", y);
    // Inherited down to the image, where `.product-glow` offsets its halo by
    // them. The panel carries no light of its own any more — see the note on
    // `.spotlight::before` — so this is what the pointer actually moves.
    element.style.setProperty("--glow-dx", glowX);
    element.style.setProperty("--glow-dy", glowY);
  };

  return (
    <div
      className={cn("spotlight", className)}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse") return;

        reducedMotion.current ??= window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        );
        if (reducedMotion.current.matches) return;

        const element = event.currentTarget;
        const { clientX, clientY } = event;

        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;

          // -0.5 … 0.5 from the centre of the panel, damped by `travel` and
          // offset from the resting point rather than from the middle — the
          // light should swing *around* where it sits, not jump to centre the
          // moment a pointer arrives.
          const px = (clientX - rect.left) / rect.width - 0.5;
          const py = (clientY - rect.top) / rect.height - 0.5;

          write(
            element,
            `${REST_X + px * travel * 100}%`,
            `${REST_Y + py * travel * 100}%`,
            "120ms",
            `${px * GLOW_OFFSET_PX}px`,
            `${py * GLOW_OFFSET_PX}px`,
          );
        });
      }}
      onPointerLeave={(event) => {
        cancelAnimationFrame(frame.current);
        // Long enough to read as a lamp settling rather than a light switch.
        write(event.currentTarget, `${REST_X}%`, `${REST_Y}%`, "640ms", "0px", "0px");
      }}
    >
      {children}
    </div>
  );
}
