import type { ReactNode } from "react";

import type { LogoTreatment } from "@/generated/prisma/enums";
import { BrandIcon } from "@/components/brands/BrandIcon";
import { BrandLogo } from "@/components/brands/BrandLogo";

/**
 * A brand's mark, from whichever source the brand actually has.
 *
 * Two sources, deliberately ranked rather than offered as equals:
 *
 *  1. `iconSvg` — inlined markup, single-colour, takes `currentColor`. One
 *     asset works on every surface and in both themes.
 *  2. `logo` — a hosted image URL. Whatever the operator pasted, at whatever
 *     colours it was drawn in.
 *
 * The vector wins wherever both exist, because it is the one that adapts. A
 * hosted image cannot: a logo drawn in black is a black logo on a dark
 * background, and nothing here can recolour a raster. That is a real limitation
 * of the image path rather than a bug to be fixed later — an operator using it
 * needs to pick artwork that reads on both themes, or fill in `iconSvg`
 * instead. Brandfetch and similar CDNs expose per-theme variants for exactly
 * this reason.
 */
export function BrandMark({
  svg,
  logo,
  size = 20,
  label,
  className,
  fallback,
  treatment,
}: {
  /** Sanitized markup from `Brand.iconSvg`. */
  svg?: string | null;
  /** Validated URL from `Brand.logo`. */
  logo?: string | null;
  /** The box, in px. Square for the vector; a height cap for the image. */
  size?: number;
  /**
   * Announced by screen readers. Leave unset where the brand name is already
   * rendered as text beside the mark — the default is decorative, so the name
   * is not read out twice.
   */
  label?: string;
  className?: string;
  /** From `Brand.logoTreatment` — how dark mode treats a hosted image. */
  treatment?: LogoTreatment | null;
  /**
   * Shown if the hosted image fails to load — pass the brand's name anywhere
   * the mark stands on its own, or the caller renders an empty space when a
   * URL turns out to be dead. Irrelevant to the `svg` path, which is inlined
   * markup and cannot fail to fetch.
   */
  fallback?: ReactNode;
}) {
  if (svg) {
    return <BrandIcon svg={svg} size={size} label={label} className={className} />;
  }

  if (!logo) return <>{fallback ?? null}</>;

  return (
    <BrandLogo
      logo={logo}
      size={size}
      label={label}
      className={className}
      fallback={fallback}
      treatment={treatment}
    />
  );
}
