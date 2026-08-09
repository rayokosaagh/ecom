"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { ImageLightbox } from "./ImageLightbox";
import { useProductColor } from "./ProductColorContext";

/** How much bigger the crop inside the viewfinder is than the frame shows. */
const LENS_ZOOM = 2.6;
/** Side of the viewfinder, in pixels. */
const LENS_SIZE = 150;

/**
 * Product image viewer: a frame, a thumbnail strip, and two ways to look closer.
 *
 * The colour picker used to live here too, which meant two of them on the page
 * disagreeing with each other. It is now only in the buy box, and this follows
 * whatever that one says — picking a finish swaps the strip to that finish's
 * photos, so the gallery shows one product in one colour rather than a mixed
 * set. A colour with no photos of its own leaves the product's standard set in
 * place: not every colourway gets its own shoot, and the standard set beats an
 * empty frame.
 *
 * Hovering opens a viewfinder that follows the pointer and shows that part of
 * the photo enlarged, leaving the frame itself untouched — so you can compare
 * the detail against the whole rather than losing the whole to see the detail.
 * Clicking opens the full-screen viewer, which is the only one of the two
 * available on a touch screen, where there is no hover to speak of.
 */
export function ProductGallery({
  name,
  image,
  gallery,
}: {
  name: string;
  image: string | null;
  gallery: string[];
}) {
  const colorContext = useProductColor();
  const selected = colorContext?.selected ?? null;

  /** The product's own set, used when the chosen colour has none. */
  const base = [...new Set([image, ...gallery].filter((v): v is string => Boolean(v)))];

  // `?? []` is not paranoia: `prisma db push` adds a scalar list to a table
  // that already has rows as a *nullable* column with no default, so the client
  // types this `string[]` while the database can hand back null. The column has
  // been backfilled and constrained, but a future push could do it again, and
  // the failure mode is a crashed product page.
  const forColor = selected
    ? [
        ...new Set(
          [selected.image, ...(selected.gallery ?? [])].filter(
            (v): v is string => Boolean(v),
          ),
        ),
      ]
    : [];

  const images = forColor.length > 0 ? forColor : base;

  const [active, setActive] = useState(0);
  const [shownFor, setShownFor] = useState(selected?.name ?? "");
  const [lightbox, setLightbox] = useState<number | null>(null);

  if (shownFor !== (selected?.name ?? "")) {
    // Adjusting state during render rather than in an effect — this is the
    // "reset when a prop changes" case, and doing it here means the right
    // image paints on the first frame instead of the second.
    setShownFor(selected?.name ?? "");
    setActive(0);
  }

  const index = Math.min(active, Math.max(images.length - 1, 0));
  const step = (delta: number) =>
    setActive((current) => (current + delta + images.length) % images.length);

  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  /**
   * Swiping the frame, which on a phone is how people expect to change the
   * photo — the arrows exist but they are a desktop idiom, and thumbnails mean
   * aiming at a 64px target to do the most common thing on the page.
   *
   * Deliberately plain touch events rather than a gesture library: it is one
   * axis and one threshold, and nothing here needs to track velocity.
   */
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  /**
   * Whether the gesture that just ended was a swipe.
   *
   * The frame is covered by a full-bleed button that opens the lightbox, and a
   * touch that ends in a swipe still fires that button's click. Without this,
   * every swipe would also throw the viewer open on top of it.
   */
  const wasSwipe = useRef(false);

  /** Far enough that it cannot be a tap with a shaky thumb. */
  const SWIPE_THRESHOLD = 40;

  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
    wasSwipe.current = false;
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || images.length < 2) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    // Must be far enough *and* more horizontal than vertical. A page scroll
    // that drifts sideways is the common case, and treating it as a swipe would
    // change the photo out from under someone who was only scrolling past.
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;

    wasSwipe.current = true;
    // Drag left to advance, matching the direction the content moves.
    step(dx < 0 ? 1 : -1);
  };
  /** Where the viewfinder sits and what it shows, or null when not hovering. */
  const [lens, setLens] = useState<{
    left: number;
    top: number;
    bgX: number;
    bgY: number;
    bgW: number;
    bgH: number;
  } | null>(null);

  /**
   * Work out the crop under the pointer.
   *
   * The frame renders the photo with `object-cover`, so the visible area is a
   * centre crop of a scaled image, not the whole file. The viewfinder has to
   * repeat that same geometry or it would show a different part of the picture
   * than the one being pointed at — which is the failure that makes most
   * magnifiers feel broken.
   */
  const track = (event: React.MouseEvent) => {
    // Over a control, the viewfinder is in the way of the thing you are
    // reaching for — and it would sit on top of the arrow you are about to
    // press. Read from the event target rather than from hover state, so it
    // disappears on the same frame the pointer arrives rather than one later.
    if ((event.target as HTMLElement).closest("[data-hides-lens]")) {
      setLens(null);
      return;
    }

    const frame = frameRef.current;
    const img = imgRef.current;
    if (!frame || !img || !img.naturalWidth) return;

    const rect = frame.getBoundingClientRect();
    const cover = Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
    // Size and offset of the photo as `object-cover` actually lays it out.
    const drawnW = img.naturalWidth * cover;
    const drawnH = img.naturalHeight * cover;
    const offsetX = (rect.width - drawnW) / 2;
    const offsetY = (rect.height - drawnH) / 2;

    // Keep the viewfinder wholly inside the frame, and read the crop from
    // where it ends up rather than from the raw pointer — so what it shows is
    // always what sits under it.
    const half = LENS_SIZE / 2;
    const cx = Math.min(Math.max(event.clientX - rect.left, half), rect.width - half);
    const cy = Math.min(Math.max(event.clientY - rect.top, half), rect.height - half);

    setLens({
      left: cx - half,
      top: cy - half,
      bgW: drawnW * LENS_ZOOM,
      bgH: drawnH * LENS_ZOOM,
      bgX: -((cx - offsetX) * LENS_ZOOM - half),
      bgY: -((cy - offsetY) * LENS_ZOOM - half),
    });
  };

  const current = images[index];

  return (
    <div className="space-y-4">
      {/* Fixed square frame, clipped. object-cover rather than contain: a
          product's own frames rarely share a ratio — the ProArt's colourways
          are 1.78 and 1.41 — and under `contain` each one filled a different
          share of the box, so picking a colour visibly resized the product.
          Cover fills identically, at the cost of a centre crop.

          A div, not a button: the arrows below are buttons, and a button
          cannot contain another one. The clickable surface is the overlay
          button instead. */}
      <div
        ref={frameRef}
        onMouseMove={track}
        onMouseLeave={() => setLens(null)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className={cn(
          "group/frame bg-surface-container-highest relative aspect-square overflow-hidden rounded-xl",
          // Vertical panning and pinch stay with the browser; the horizontal
          // axis is reserved for the swipe above. Without this the gesture
          // competes with the edge-swipe that navigates back.
          "touch-pan-y touch-pinch-zoom",
        )}
      >
        {images.length > 0 ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            ref={imgRef}
            key={current}
            src={current}
            alt={
              selected
                ? `${name} in ${selected.name}`
                : `${name} — image ${index + 1} of ${images.length}`
            }
            draggable={false}
            className="size-full animate-[fade-in_200ms_ease-out] object-cover select-none"
          />
        ) : (
          <div className="text-on-surface-variant grid size-full place-items-center">
            <Icon name="image" size={56} />
          </div>
        )}

        {/* The viewfinder. Hidden on coarse pointers: there is no hover on a
            touch screen, and the emulated one fires on tap — which would leave
            a lens stranded on the image after a tap meant to open the viewer. */}
        {lens && images.length > 0 && (
          <span
            aria-hidden
            style={{
              left: lens.left,
              top: lens.top,
              width: LENS_SIZE,
              height: LENS_SIZE,
              backgroundImage: `url(${JSON.stringify(current)})`,
              backgroundSize: `${lens.bgW}px ${lens.bgH}px`,
              backgroundPosition: `${lens.bgX}px ${lens.bgY}px`,
            }}
            className="border-surface shadow-elevation-3 pointer-events-none absolute z-30 rounded-full border-4 bg-no-repeat pointer-coarse:hidden"
          />
        )}

        {/* Opens the full-screen viewer. Sits above the photo but below the
            arrows, so each control gets the clicks meant for it. */}
        {images.length > 0 && (
          <button
            type="button"
            onClick={() => {
              // The click that follows a swipe is not a request to zoom.
              if (wasSwipe.current) {
                wasSwipe.current = false;
                return;
              }
              setLightbox(index);
            }}
            aria-label={`Open ${name} full screen`}
            className="absolute inset-0 z-10 cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2"
          />
        )}

        {/* Only worth saying when the strip really is this colour's. */}
        {selected && forColor.length > 0 && (
          <span className="bg-surface/85 text-on-surface pointer-events-none absolute bottom-3 left-3 z-20 rounded-full px-3 py-1 text-xs font-medium backdrop-blur-sm">
            {selected.name}
          </span>
        )}

        {images.length > 0 && (
          <span
            aria-hidden
            className="bg-surface/85 text-on-surface pointer-events-none absolute right-3 bottom-3 z-20 grid size-9 place-items-center rounded-full opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover/frame:opacity-100 pointer-coarse:opacity-100"
          >
            <Icon name="zoom_in" size={18} />
          </span>
        )}

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              onMouseEnter={() => setLens(null)}
              data-hides-lens
              aria-label="Previous image"
              className="bg-surface/85 text-on-surface hover:bg-surface absolute top-1/2 left-3 z-20 grid size-10 -translate-y-1/2 place-items-center rounded-full opacity-0 backdrop-blur-sm transition-all duration-200 group-hover/frame:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 active:scale-95 pointer-coarse:opacity-100"
            >
              <Icon name="chevron_left" size={22} />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              onMouseEnter={() => setLens(null)}
              data-hides-lens
              aria-label="Next image"
              className="bg-surface/85 text-on-surface hover:bg-surface absolute top-1/2 right-3 z-20 grid size-10 -translate-y-1/2 place-items-center rounded-full opacity-0 backdrop-blur-sm transition-all duration-200 group-hover/frame:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 active:scale-95 pointer-coarse:opacity-100"
            >
              <Icon name="chevron_right" size={22} />
            </button>

            <span
              aria-hidden
              className="bg-surface/85 text-on-surface-variant pointer-events-none absolute top-3 right-3 z-20 rounded-full px-2.5 py-1 text-xs tabular-nums backdrop-blur-sm"
            >
              {index + 1} / {images.length}
            </span>
          </>
        )}
      </div>

      {images.length > 1 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((url, i) => (
            <li key={url}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show image ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className={cn(
                  "bg-surface-container-highest size-16 overflow-hidden rounded-md border-2 transition-colors duration-200",
                  "focus-visible:outline-2 focus-visible:outline-offset-2",
                  i === index ? "border-primary" : "border-outline-variant",
                )}
              >
                {/* Cover here too, so a thumbnail previews the same framing
                    the main viewer will show. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {lightbox !== null && (
        <ImageLightbox
          images={images}
          index={lightbox}
          alt={selected ? `${name} in ${selected.name}` : name}
          onIndex={(next) => {
            setLightbox(next);
            // Keep the strip in step, so closing leaves you on whatever you
            // were last looking at rather than jumping back.
            setActive(next);
          }}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
