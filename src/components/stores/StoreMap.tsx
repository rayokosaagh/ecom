"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * The map for one branch — as a facade, not an embed.
 *
 * **Nothing is requested from Google until someone asks for the map.** A Maps
 * iframe is roughly a megabyte across a few dozen requests, it sets cookies,
 * and on a page listing four branches it would be four of those before a
 * visitor has decided which branch they care about. Most people on this page
 * want the address and the phone number, both of which are already rendered
 * above as text. So the map starts as a button, and mounting the iframe is
 * something the visitor chooses.
 *
 * `loading="lazy"` alone would not have done this: it defers by *viewport*, and
 * these cards are short enough that scrolling past one loads it anyway.
 *
 * The embed itself is the keyless `output=embed` form. The official Embed API
 * needs a billable key, and a key shipped to the browser is a key anyone can
 * spend — for dropping a pin on a public address, the plain form does the same
 * job with nothing to leak.
 *
 * Directions stay a plain link, always rendered. It costs nothing, it is what
 * most people actually want from a map, and it works on a phone where it opens
 * the Maps app rather than a page.
 */
export function StoreMap({
  query,
  name,
  className,
}: {
  /** Coordinates or an address — whatever `mapQuery` settled on. */
  query: string;
  /** The branch, for the frame's accessible name. */
  name: string;
  className?: string;
}) {
  const [shown, setShown] = useState(false);

  const encoded = encodeURIComponent(query);
  const embedSrc = `https://www.google.com/maps?q=${encoded}&z=16&hl=en&output=embed`;
  // The documented, keyless deep link. `api=1` is what makes it open the
  // installed app on a phone instead of the web page.
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="bg-surface-container-highest relative aspect-[16/10] w-full overflow-hidden rounded-xl sm:aspect-[2/1]">
        {shown ? (
          <iframe
            // Once the visitor has opted in there is no reason to defer
            // further, but the attribute costs nothing and covers the case of
            // a card opened while off-screen.
            loading="lazy"
            src={embedSrc}
            title={`Map showing ${name}`}
            allowFullScreen
            // Google needs the origin to serve the frame; anything more than
            // that is not theirs to have.
            referrerPolicy="no-referrer-when-downgrade"
            className="size-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setShown(true)}
            aria-label={`Show map of ${name}`}
            className={cn(
              "group text-on-surface-variant absolute inset-0 grid place-items-center gap-2",
              "transition-colors duration-200",
              "hover:bg-on-surface/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2",
            )}
          >
            {/* A hint of a street grid, so the panel reads as a map that has
                not loaded rather than as an image that failed to. */}
            <span
              aria-hidden
              className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(var(--color-outline-variant)_1px,transparent_1px),linear-gradient(90deg,var(--color-outline-variant)_1px,transparent_1px)] [background-size:28px_28px]"
            />
            <span className="bg-surface-container-low shadow-elevation-1 relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
              <Icon name="map" size={18} filled />
              Show map
            </span>
            <span className="text-on-surface-variant relative text-xs">
              Loads Google Maps
            </span>
          </button>
        )}
      </div>

      <a
        href={directionsHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary inline-flex items-center gap-1.5 rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Icon name="directions" size={18} />
        Get directions
      </a>
    </div>
  );
}
