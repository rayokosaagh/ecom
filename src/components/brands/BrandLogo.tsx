"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { resolveLogoTreatment, whiteVariant } from "@/lib/brands/logo-format";
import type { LogoTreatment } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";

/**
 * A brand's hosted logo, with somewhere to fall back to when it does not load.
 *
 * The only reason this is a client component: whether a remote image renders is
 * not knowable on the server. The URL is operator-supplied and points at a host
 * nobody here controls, so it can 404, expire, get hotlink-blocked, or — as the
 * Brandfetch CDN does without a valid client id — answer with a 302 to a
 * documentation page, which the browser then refuses to treat as an image.
 *
 * Server-side that is indistinguishable from a working logo, so a caller that
 * suppresses the brand name whenever a logo *exists* renders nothing at all.
 * `onError` is the only signal that says otherwise, and it needs a client.
 *
 * ## Dark mode
 *
 * Light mode never touches the artwork; dark mode applies whichever treatment
 * the brand asks for. What each one does and why none of them can be the only
 * one is set out in `lib/brands/logo-format` — briefly, repainting a mark white
 * suits a single-colour wordmark and destroys one with internal contrast, so
 * the choice has to come from someone who has looked at it.
 *
 * A `plate` is rendered as a wrapper around the image rather than left to the
 * caller. It travels with the logo that way: the same brand gets the same
 * treatment on the home strip, the catalogue's filter bar and a product card,
 * without three components each having to remember. Getting this wrong was the
 * original bug — the chip existed only on the home tiles, so every other
 * surface still showed a dark logo on a dark background.
 */
export function BrandLogo({
  logo,
  size,
  label,
  className,
  fallback,
  treatment,
}: {
  /** Validated URL from `Brand.logo`. */
  logo: string;
  /** The box, in px — a height cap rather than a square. */
  size: number;
  /** Announced by screen readers; omit where the name is already text nearby. */
  label?: string;
  className?: string;
  /** Rendered instead once the image has failed. Usually the brand's name. */
  fallback?: ReactNode;
  /** From `Brand.logoTreatment`. Omitted behaves as `AUTO`. */
  treatment?: LogoTreatment | null;
}) {
  const [failed, setFailed] = useState(false);
  const [variantFailed, setVariantFailed] = useState(false);

  if (failed) return <>{fallback ?? null}</>;

  const resolved = resolveLogoTreatment(treatment, logo);
  const white = resolved === "variant" ? whiteVariant(logo) : null;

  const image = (
    // Plain <img>, matching how the catalogue treats product images: these URLs
    // are operator-supplied and can point at any host, so they are deliberately
    // not routed through next/image.
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={logo}
      alt={label ?? ""}
      {...(label ? {} : { "aria-hidden": true })}
      loading="lazy"
      onError={() => setFailed(true)}
      /**
       * `height` is set outright rather than capped with `max-height`, and that
       * is load-bearing.
       *
       * An SVG whose root carries only a `viewBox` — no `width`, no `height` —
       * has an intrinsic *ratio* but no intrinsic *size*. Given only maximums,
       * CSS has no definite dimension to resolve `width: auto` against and the
       * image lays out at 0×0: present in the DOM, loaded, reporting a
       * `naturalWidth`, and drawing nothing. Brandfetch serves exactly this
       * shape for some brands and a fully-sized `<svg>` for others, which is
       * why only *some* hosted logos ever appeared.
       *
       * One definite dimension is all the ratio needs. `object-contain` then
       * keeps a very wide wordmark undistorted inside the width cap, which is
       * what stops it pushing the rest of a card's line off the end.
       */
      style={{ height: size, maxWidth: size * 3 }}
      className={cn(
        "w-auto shrink-0 object-contain",
        resolved === "invert" && "brand-logo-invert",
        // Only hidden in dark mode once its white counterpart is known to load.
        white && !variantFailed && "brand-logo-light",
        className,
      )}
    />
  );

  /**
   * The publisher's white artwork, shown in place of the stored one on a dark
   * surface. Both are in the DOM and CSS picks — so the right file is there on
   * first paint, rather than swapped in at hydration.
   *
   * If it 404s, `variantFailed` drops it and the original takes both schemes
   * back. That is the failure this treatment is opt-in to avoid, and the
   * fallback means hitting it costs a logo its dark-mode polish, not its
   * presence.
   */
  if (white && !variantFailed) {
    return (
      <>
        {image}
        {/* Not announced again — the copy above already carries the label. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={white}
          alt=""
          aria-hidden
          loading="lazy"
          onError={() => setVariantFailed(true)}
          style={{ height: size, maxWidth: size * 3 }}
          className={cn(
            // Silhouetted as well as swapped, which sounds redundant and is
            // not. A publisher's "for dark backgrounds" file is not always
            // white — IKEA's keeps its yellow lettering — and the filter is
            // what guarantees the mark comes out monochrome either way.
            //
            // It is safe to apply unconditionally *here* because repainting
            // white artwork white changes nothing: `brightness(0) invert(1)`
            // maps white to white and leaves transparency alone. It only has
            // an effect on a variant that was still coloured, which is the one
            // case it is for. That is not true of the stored file, where the
            // same filter would flatten a filled mark — hence this class is on
            // the variant only.
            "brand-logo-dark brand-logo-invert w-auto shrink-0 object-contain",
            className,
          )}
        />
      </>
    );
  }

  if (resolved !== "plate") return image;

  // The chip is padded relative to the mark, so it stays proportionate whether
  // it is behind a 76px tile logo or a 16px one on a product card.
  return (
    <span
      className="brand-logo-chip inline-flex shrink-0 items-center justify-center rounded-sm"
      style={{ padding: Math.max(2, Math.round(size * 0.08)) }}
    >
      {image}
    </span>
  );
}
