"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/ui/Icon";

export type ReviewMediaView = {
  id: string;
  url: string;
  kind: "IMAGE" | "VIDEO";
};

/**
 * Attachments on a published review: a row of thumbnails that open full size.
 *
 * Videos are never set to autoplay. A product page that starts playing sound
 * because you scrolled past a review is a page people leave.
 *
 * The full-size view is portalled to `document.body` rather than rendered in
 * place. `position: fixed` resolves against the nearest ancestor carrying a
 * transform, not the viewport — and the product page's `<main>` has one from
 * the entrance animation. Left where it sat, the backdrop was sized to `<main>`
 * and started 900-odd pixels above the top of the screen.
 */
export function ReviewMediaGallery({ media }: { media: ReviewMediaView[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex === null ? null : media[openIndex];

  if (media.length === 0) return null;

  const step = (delta: number) => {
    if (openIndex === null) return;
    setOpenIndex((openIndex + delta + media.length) % media.length);
  };

  return (
    <>
      <ul className="mt-3 flex flex-wrap gap-2">
        {media.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              aria-label={item.kind === "VIDEO" ? "Play clip" : "View photo"}
              className="group/media bg-surface-container-highest relative block size-20 overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {item.kind === "VIDEO" ? (
                <video
                  src={item.url}
                  muted
                  playsInline
                  preload="metadata"
                  className="size-full object-cover"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={item.url}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-300 group-hover/media:scale-105"
                />
              )}

              {item.kind === "VIDEO" && (
                <span
                  aria-hidden
                  className="absolute inset-0 grid place-items-center bg-black/25 text-white"
                >
                  <Icon name="play_circle" size={26} filled />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Attachment"
            // Click-through to close, and Escape for the keyboard. The panel
            // stops propagation so clicking the media itself does not dismiss it.
            onClick={() => setOpenIndex(null)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpenIndex(null);
              if (event.key === "ArrowRight") step(1);
              if (event.key === "ArrowLeft") step(-1);
            }}
            tabIndex={-1}
            ref={(node) => node?.focus()}
            className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
          >
            <div
              onClick={(event) => event.stopPropagation()}
              className="relative max-h-full w-full max-w-3xl"
            >
              {open.kind === "VIDEO" ? (
                // Controls, no autoplay: opening it is the consent to play.
                <video
                  src={open.url}
                  controls
                  playsInline
                  className="max-h-[80vh] w-full rounded-xl bg-black"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={open.url}
                  alt=""
                  className="max-h-[80vh] w-full rounded-xl object-contain"
                />
              )}

              {media.length > 1 && (
                <div className="mt-3 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    aria-label="Previous"
                    className="grid size-10 place-items-center rounded-full bg-white/15 text-white transition-colors duration-150 hover:bg-white/25 focus-visible:outline-2"
                  >
                    <Icon name="chevron_left" size={22} />
                  </button>
                  <span className="text-sm text-white/80 tabular-nums">
                    {(openIndex ?? 0) + 1} / {media.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    aria-label="Next"
                    className="grid size-10 place-items-center rounded-full bg-white/15 text-white transition-colors duration-150 hover:bg-white/25 focus-visible:outline-2"
                  >
                    <Icon name="chevron_right" size={22} />
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setOpenIndex(null)}
              aria-label="Close"
              className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-white/15 text-white transition-colors duration-150 hover:bg-white/25 focus-visible:outline-2"
            >
              <Icon name="close" size={22} />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
