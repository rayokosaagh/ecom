import type { SocialPlatform } from "@/generated/prisma/enums";
import { SOCIAL_PLATFORMS } from "@/lib/social/catalogue";

/**
 * Colour arithmetic for the follow bar's hover state.
 *
 * Free of `server-only` and of any DOM, like the rest of `lib/social` — the
 * admin picker previews the exact pair the storefront will render, and
 * `npm run check:social` exercises both functions directly.
 */

/** `#rgb` or `#rrggbb`, with or without the hash, any case. */
const HEX_PATTERN = /^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Canonicalize a colour to lowercase `#rrggbb`, or null if it is not one.
 *
 * One stored spelling per colour, so `#FFF`, `fff` and `#ffffff` do not read as
 * three different overrides — and, more to the point, so a value that equals
 * the platform's default is *recognised* as equalling it and stored as null.
 */
export function normalizeHexColor(input: string): string | null {
  const trimmed = input.trim();
  if (!HEX_PATTERN.test(trimmed)) return null;

  const hex = trimmed.replace(/^#/, "").toLowerCase();

  // `#abc` is shorthand for `#aabbcc` — expanded rather than accepted as-is,
  // because `<input type="color">` only ever emits the long form and the two
  // spellings of one colour must not compare unequal.
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex}`;
}

/** One channel of sRGB, linearized. The gamma curve from WCAG 2.x. */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const value = normalizeHexColor(hex) ?? "#000000";
  const r = Number.parseInt(value.slice(1, 3), 16);
  const g = Number.parseInt(value.slice(3, 5), 16);
  const b = Number.parseInt(value.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Near-black rather than pure black: the app's own darkest surface tone. */
const ON_LIGHT = "#111318";
const ON_DARK = "#ffffff";

/**
 * The mark's colour once the chip is filled with `background`.
 *
 * Computed rather than stored, and that is the point of letting the admin pick
 * any colour at all: a picker with a free-form hex behind it will eventually be
 * given `#ffff00`, and a white glyph on yellow is unreadable. Whichever of
 * white or near-black contrasts better with the chosen colour wins, so no
 * choice can produce an invisible icon.
 *
 * The 0.5 threshold is luminance, not lightness — which is why yellow (0.93)
 * takes the dark glyph and a mid blue (0.07) takes the light one, matching what
 * the eye expects rather than what the hex looks like.
 */
export function readableOn(background: string): string {
  return relativeLuminance(background) > 0.5 ? ON_LIGHT : ON_DARK;
}

/** The colour this link hovers to: its own override, else the platform's. */
export function resolveHoverColor(
  platform: SocialPlatform,
  override: string | null,
): string {
  return (
    (override && normalizeHexColor(override)) ??
    SOCIAL_PLATFORMS[platform].brandColor
  );
}
