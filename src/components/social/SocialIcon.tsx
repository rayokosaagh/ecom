import type { SocialPlatform } from "@/generated/prisma/enums";
import { BrandIcon } from "@/components/brands/BrandIcon";
import { Icon } from "@/components/ui/Icon";
import { SOCIAL_PLATFORMS } from "@/lib/social/catalogue";
import { cn } from "@/lib/cn";

/**
 * One link's mark.
 *
 * Two sources, and the split matters. A built-in platform's mark comes from the
 * path in `lib/social/catalogue` — fixed in the source, so there is no
 * untrusted markup involved. A CUSTOM link's comes from `SocialLink.iconSvg`,
 * which an admin pasted, and that is rendered through `BrandIcon` rather than
 * inlined here: `BrandIcon` is the one component in the codebase that inlines
 * admin-supplied SVG, and keeping it that way keeps the blast radius one file.
 *
 * `fill="currentColor"` and no colour of its own, so the mark takes the colour
 * of whatever it sits in — which is what lets the hover state recolour it.
 *
 * `aria-hidden`, always. The mark never carries the accessible name — the link
 * around it does, because the name belongs to the destination and not to the
 * glyph, and a shape announced separately from its link reads as two things.
 */
export function SocialIcon({
  platform,
  iconSvg,
  size = 20,
  className,
}: {
  platform: SocialPlatform;
  /** Sanitized markup, for a CUSTOM link. Ignored for the built-ins. */
  iconSvg?: string | null;
  size?: number;
  className?: string;
}) {
  const { path } = SOCIAL_PLATFORMS[platform];

  if (path) {
    return (
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="currentColor"
        className={cn("shrink-0", className)}
      >
        <path d={path} />
      </svg>
    );
  }

  if (iconSvg) return <BrandIcon svg={iconSvg} size={size} className={className} />;

  // A custom link whose mark has not been pasted yet. A generic link glyph is
  // the honest stand-in — inventing a logo would misrepresent whoever it points
  // at, and the row still works while the admin finds the artwork.
  return <Icon name="link" size={size} className={className} />;
}
