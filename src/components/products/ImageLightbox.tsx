"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * Full-screen image viewer with zoom and pan.
 *
 * Portalled to `document.body` rather than rendered in place: `position: fixed`
 * resolves against the nearest ancestor carrying a transform, and the product
 * page's `<main>` has one from the entrance animation. Left where it sat, a
 * "fullscreen" overlay would be sized to `<main>` instead of the screen.
 *
 * Zoom is applied as a transform on the image rather than by loading a larger
 * file. There is no second, higher-resolution asset to request — the catalogue
 * stores one image per shot — so magnification is limited by the source, and
 * pretending otherwise with a "HD" label would be a lie.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const STEP = 0.5;

export function ImageLightbox({
  images,
  index,
  alt,
  onIndex,
  onClose,
}: {
  images: string[];
  index: number;
  alt: string;
  onIndex: (next: number) => void;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  /** Pan offset in pixels, only meaningful while zoomed in. */
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  /** Drag origin. A ref because it changes on every pointer move and none of
      those need a render. */
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  /** Whether a drag is in progress. This one *is* state: it decides whether the
      image animates, and a ref would never re-render to apply the change. */
  const [panning, setPanning] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  /**
   * Where the pointer went down, and whether it then travelled.
   *
   * Needed because a pan that starts on the empty part of the frame also ends
   * as a `click` on the frame — so click-to-dismiss would fire the moment you
   * finished dragging the image. A gesture that moved is not a click.
   */
  const pressed = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  /** Moving to another image starts it fresh rather than inheriting a pan. */
  const step = useCallback(
    (delta: number) => {
      reset();
      onIndex((index + delta + images.length) % images.length);
    },
    [index, images.length, onIndex, reset],
  );

  // Keys are bound to the document, not the overlay: focus can legitimately be
  // on one of the controls inside, and a handler on the container would then
  // never see the keystroke.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "+" || event.key === "=") {
        setScale((s) => Math.min(s + STEP, MAX_SCALE));
      } else if (event.key === "-") {
        setScale((s) => Math.max(s - STEP, MIN_SCALE));
      } else if (event.key === "0") reset();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, step, reset]);

  // The page behind must not scroll while this is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  /**
   * Wheel to zoom, anchored at the pointer.
   *
   * Registered manually as a non-passive listener: React's onWheel is passive,
   * so `preventDefault` inside it does nothing and the page scrolls underneath.
   */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = frame.getBoundingClientRect();
      // Pointer position relative to the frame's centre, which is what the
      // transform is measured from.
      const px = event.clientX - rect.left - rect.width / 2;
      const py = event.clientY - rect.top - rect.height / 2;

      setScale((current) => {
        const next = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, current - Math.sign(event.deltaY) * STEP),
        );
        if (next === current) return current;

        // Keep whatever is under the cursor under the cursor.
        setOffset((o) =>
          next === MIN_SCALE
            ? { x: 0, y: 0 }
            : {
                x: px - ((px - o.x) * next) / current,
                y: py - ((py - o.y) * next) / current,
              },
        );
        return next;
      });
    };

    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, []);

  if (typeof document === "undefined") return null;

  const zoomed = scale > MIN_SCALE;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
    >
      {/* The frame. Clicking the backdrop closes; clicking the image does not,
          because at 3× the image *is* most of the backdrop. */}
      <div
        ref={frameRef}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          if (pressed.current?.moved) return;
          onClose();
        }}
        onDoubleClick={() => (zoomed ? reset() : setScale(2.5))}
        onPointerDown={(event) => {
          pressed.current = { x: event.clientX, y: event.clientY, moved: false };
          if (!zoomed) return;
          dragFrom.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
          setPanning(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const press = pressed.current;
          if (press && !press.moved) {
            // A few pixels of slop, so an ordinary click with a shaky hand is
            // still a click.
            const travelled =
              Math.abs(event.clientX - press.x) + Math.abs(event.clientY - press.y);
            if (travelled > 5) press.moved = true;
          }

          const from = dragFrom.current;
          if (!from) return;
          setOffset({ x: event.clientX - from.x, y: event.clientY - from.y });
        }}
        onPointerUp={() => {
          dragFrom.current = null;
          setPanning(false);
        }}
        onPointerCancel={() => {
          dragFrom.current = null;
          setPanning(false);
        }}
        className={cn(
          "relative flex flex-1 items-center justify-center overflow-hidden p-4 sm:p-10",
          zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[index]}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
          }}
          className={cn(
            "max-h-full max-w-full origin-center object-contain select-none",
            // Only animate the snap back to 1×; panning must track the pointer
            // exactly, and a transition there feels like lag.
            panning ? "" : "transition-transform duration-200 ease-out",
          )}
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 pb-6 sm:gap-4">
        {images.length > 1 && (
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous image"
            className="grid size-11 place-items-center rounded-full bg-white/15 text-white transition-colors duration-150 hover:bg-white/25 focus-visible:outline-2"
          >
            <Icon name="chevron_left" size={22} />
          </button>
        )}

        <div className="flex items-center gap-1 rounded-full bg-white/15 px-1 py-1">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(s - STEP, MIN_SCALE))}
            disabled={scale <= MIN_SCALE}
            aria-label="Zoom out"
            // The lightbox is the *only* way to look closer on a phone — the
            // hover viewfinder is desktop-only — so its controls are touch
            // controls first.
            className="grid size-9 place-items-center rounded-full text-white transition-colors duration-150 pointer-coarse:size-11 hover:bg-white/20 focus-visible:outline-2 disabled:opacity-40"
          >
            <Icon name="zoom_out" size={20} />
          </button>
          <button
            type="button"
            onClick={reset}
            className="min-w-14 rounded-full px-2 text-sm text-white tabular-nums focus-visible:outline-2"
            aria-label="Reset zoom"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(s + STEP, MAX_SCALE))}
            disabled={scale >= MAX_SCALE}
            aria-label="Zoom in"
            className="grid size-9 place-items-center rounded-full text-white transition-colors duration-150 pointer-coarse:size-11 hover:bg-white/20 focus-visible:outline-2 disabled:opacity-40"
          >
            <Icon name="zoom_in" size={20} />
          </button>
        </div>

        {images.length > 1 && (
          <>
            <span className="text-sm text-white/80 tabular-nums">
              {index + 1} / {images.length}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next image"
              className="grid size-11 place-items-center rounded-full bg-white/15 text-white transition-colors duration-150 hover:bg-white/25 focus-visible:outline-2"
            >
              <Icon name="chevron_right" size={22} />
            </button>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 grid size-11 place-items-center rounded-full bg-white/15 text-white transition-colors duration-150 hover:bg-white/25 focus-visible:outline-2"
      >
        <Icon name="close" size={22} />
      </button>
    </div>,
    document.body,
  );
}
