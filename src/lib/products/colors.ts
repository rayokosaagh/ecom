/**
 * Colourway parsing shared by the admin form and the product actions.
 *
 * A colourway is a name, a swatch, optionally its own photo, and optionally
 * further photos of that same finish — the form submits them as parallel
 * arrays under repeated field names, which is how a native multi-row form
 * posts without any client-side serialisation.
 *
 * The extra photos are the one field that cannot be a plain parallel array: a
 * row holds a *list* of them, and repeated fields carry no row boundaries. They
 * travel as one newline-separated value per row instead, which keeps the arrays
 * index-aligned and stays legible in the textarea the admin actually edits.
 */

export const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Upper bound on colourways per product; the form stops offering more. */
export const MAX_COLORS = 12;

export interface ColorInput {
  name: string;
  hex: string;
  image: string | null;
  gallery: string[];
}

/** How many extra shots one colourway may carry, beyond its primary. */
export const MAX_COLOR_GALLERY = 8;

/** Matches any run of line breaks, however the browser encoded them. */
const NEWLINES = new RegExp("[\r\n]+");

/** Split the newline-separated gallery field into URLs. */
export function parseColorGallery(value: string): string[] {
  return [
    ...new Set(
      value
        .split(NEWLINES)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
}

/** Expand three-digit hex to six so stored values are directly comparable. */
export function normalizeHex(value: string): string {
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

export interface ColorParseResult {
  colors: ColorInput[];
  error?: string;
}

/**
 * Read the colourway rows out of submitted form data.
 *
 * Rows that are entirely blank are dropped rather than rejected — an empty
 * trailing row is how the form offers "add another", so it must not be an
 * error. A row with any content, though, must be complete.
 */
export function parseColors(formData: FormData, isSafeUrl: (v: string) => boolean): ColorParseResult {
  const names = formData.getAll("colorName").map((v) => String(v).trim());
  const hexes = formData.getAll("colorHex").map((v) => String(v).trim());
  const images = formData.getAll("colorImage").map((v) => String(v).trim());
  const galleries = formData.getAll("colorGallery").map((v) => String(v));

  const rows = Math.max(names.length, hexes.length, images.length, galleries.length);
  const colors: ColorInput[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rows; i++) {
    const name = names[i] ?? "";
    const hex = hexes[i] ?? "";
    const image = images[i] ?? "";
    const gallery = parseColorGallery(galleries[i] ?? "");

    if (!name && !hex && !image && gallery.length === 0) continue;

    if (!name) return { colors, error: "Every colour needs a name" };
    if (name.length > 40) {
      return { colors, error: "Colour names must be 40 characters or fewer" };
    }
    if (!HEX_COLOR.test(hex)) {
      return { colors, error: `Enter a hex value for “${name}”, e.g. #1b1b1f` };
    }
    if (image && !isSafeUrl(image)) {
      return { colors, error: `The image for “${name}” must be an upload or an http(s) URL` };
    }
    if (gallery.some((url) => !isSafeUrl(url))) {
      return {
        colors,
        error: `Every extra photo for “${name}” must be an upload or an http(s) URL`,
      };
    }
    if (gallery.length > MAX_COLOR_GALLERY) {
      return {
        colors,
        error: `At most ${MAX_COLOR_GALLERY} extra photos for “${name}”`,
      };
    }

    // The schema has a unique on (productId, name); catching it here gives a
    // field error instead of a database exception.
    const key = name.toLowerCase();
    if (seen.has(key)) return { colors, error: `“${name}” is listed twice` };
    seen.add(key);

    colors.push({ name, hex: normalizeHex(hex), image: image || null, gallery });
  }

  if (colors.length > MAX_COLORS) {
    return { colors, error: `At most ${MAX_COLORS} colours` };
  }

  return { colors };
}
