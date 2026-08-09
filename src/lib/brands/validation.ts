import type { Validated } from "@/lib/auth/validation";
import { LogoTreatment } from "@/generated/prisma/enums";

/** Narrows a form value to the enum without trusting what was posted. */
function isLogoTreatment(value: string): value is LogoTreatment {
  return Object.values(LogoTreatment).includes(value as LogoTreatment);
}
import { sanitizeSvg } from "@/lib/brands/svg";
import { slugify } from "@/lib/products/validation";

/**
 * Brand form rules. Hand-rolled in the style of `products/validation`, since
 * there are no cross-field rules or coercions to justify a schema.
 */

export type BrandInput = {
  name: string;
  slug: string;
  /** Sanitized markup, or null when the brand has no mark. */
  iconSvg: string | null;
  /** Hosted image URL, or null. Used only where there is no `iconSvg`. */
  logo: string | null;
  /** How dark mode treats that image. See `lib/brands/logo-format`. */
  logoTreatment: LogoTreatment;
};

/** Ceiling on the logo URL, which is a column rather than a free-text field. */
const MAX_LOGO_LENGTH = 2048;

/**
 * A logo URL the browser will actually load as an image.
 *
 * Only `http:` and `https:` — the interesting rejection is `javascript:`, which
 * is inert in an `<img src>` but would not be if this value ever reached an
 * `href`, and `data:`, which would let an operator paste an inline SVG document
 * straight past `sanitizeSvg` and back into the page. Both are refused here
 * rather than relying on where the value happens to be rendered today.
 */
function parseLogoUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  if (raw.length > MAX_LOGO_LENGTH) {
    return { ok: false, error: "Image address is too long" };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "Enter a full address, starting with https://" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Only http:// and https:// addresses are allowed" };
  }

  return { ok: true, url: parsed.toString() };
}

export function parseBrand(formData: FormData): Validated<BrandInput> {
  const errors: Record<string, string> = {};

  const name = String(formData.get("name") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const iconRaw = String(formData.get("iconSvg") ?? "").trim();
  const logoRaw = String(formData.get("logo") ?? "").trim();
  const treatmentRaw = String(formData.get("logoTreatment") ?? "").trim();

  const slug = slugify(slugRaw || name);

  if (!name) errors.name = "Name is required";
  else if (name.length > 60) errors.name = "Name must be 60 characters or fewer";

  if (!slug) errors.slug = "Slug is required (letters and numbers)";

  let iconSvg: string | null = null;
  if (iconRaw) {
    const result = sanitizeSvg(iconRaw);
    if (result.ok) iconSvg = result.svg;
    else errors.iconSvg = result.error;
  }

  let logo: string | null = null;
  if (logoRaw) {
    const result = parseLogoUrl(logoRaw);
    if (result.ok) logo = result.url;
    else errors.logo = result.error;
  }

  // An unknown value falls back rather than erroring. This comes from a
  // <select> whose options this file defines, so anything else is a crafted
  // request, and the safe default is the one that decides for itself.
  const logoTreatment = isLogoTreatment(treatmentRaw)
    ? treatmentRaw
    : LogoTreatment.AUTO;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return { ok: true, data: { name, slug, iconSvg, logo, logoTreatment } };
}
