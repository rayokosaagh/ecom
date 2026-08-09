import { LogoTreatment } from "@/generated/prisma/enums";

/**
 * How a hosted brand logo is made legible on a dark surface.
 *
 * There is no treatment that is right for every logo, which is the whole reason
 * this module exists rather than a single CSS rule:
 *
 *  - **Repainting it white** (`brightness(0) invert(1)`) suits a single-colour
 *    wordmark and ruins anything with internal contrast. IKEA's blue lettering
 *    on a yellow field and JBL's type on a filled square each flatten into one
 *    solid blob, because the filter cannot know that the figure and its ground
 *    were different colours.
 *  - **A light chip behind it** keeps every colour and never destroys a mark,
 *    but puts a pale card in a dark interface — and hides artwork that was
 *    already light.
 *  - **Nothing at all** is right more often than it sounds: a colourful mark
 *    usually reads perfectly well on a dark plate, and any treatment is damage.
 *
 * Which one a logo needs depends on how it is drawn, and nothing here can see
 * that — the URL says nothing, and the pixels are on someone else's server. So
 * the choice is stored per brand and the default only guesses the part that is
 * genuinely knowable: whether the file can hold transparency at all.
 */

/** Extensions that cannot carry an alpha channel. */
const OPAQUE = [".jpg", ".jpeg"];

/**
 * True when the image has transparency to preserve, and can therefore be turned
 * white by a filter rather than propped up by a chip.
 *
 * Read from the extension, which is a heuristic worth being plain about: it is
 * the file's own claim, not an inspection of its pixels. Its failure mode is
 * mild — a transparent image mislabelled `.jpg` gets a chip it did not need,
 * rather than a white block where a logo should be.
 */
export function canSilhouette(logo: string): boolean {
  // The path only. A query string routinely carries its own dots, and a CDN
  // token ending in `.jpg` would otherwise decide the answer.
  const path = logo.split(/[?#]/)[0].toLowerCase();
  return !OPAQUE.some((extension) => path.endsWith(extension));
}

const DARK_SEGMENT = "/theme/dark/";
const LIGHT_SEGMENT = "/theme/light/";

/**
 * The publisher's white artwork for this logo, where the URL names its theme.
 *
 * Brandfetch encodes which variant an asset is in the path, and the name is the
 * **colour of the artwork**, not the background it belongs on: `/theme/dark/`
 * is the dark-inked logo — the one for a light page — and `/theme/light/` is
 * the white knockout. So the swap below is crossed, and getting that backwards
 * turns every logo white on the white page, which is how it was found.
 *
 * Null when the URL names no theme, which is the honest answer for an uploaded
 * file or another CDN: there is no counterpart to point at.
 */
export function whiteVariant(logo: string): string | null {
  if (logo.includes(DARK_SEGMENT)) return logo.replace(DARK_SEGMENT, LIGHT_SEGMENT);
  if (logo.includes(LIGHT_SEGMENT)) return logo;
  return null;
}

export type ResolvedTreatment = "invert" | "plate" | "none" | "variant";

/**
 * The treatment to actually apply.
 *
 * `AUTO` is the only value that decides anything: silhouette what can be
 * silhouetted, chip what cannot. Every other value is an operator who has
 * looked at the logo, and is taken at its word.
 */
export function resolveLogoTreatment(
  treatment: LogoTreatment | null | undefined,
  logo: string,
): ResolvedTreatment {
  switch (treatment) {
    case LogoTreatment.INVERT:
      return "invert";
    case LogoTreatment.PLATE:
      return "plate";
    case LogoTreatment.NONE:
      return "none";
    case LogoTreatment.VARIANT:
      // Asking for artwork that cannot be addressed leaves the logo untouched
      // rather than pointing an <img> at a URL built from a guess.
      return whiteVariant(logo) ? "variant" : "none";
    default:
      return canSilhouette(logo) ? "invert" : "plate";
  }
}
