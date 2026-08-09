import { z } from "zod";

import { isSafeImageUrl } from "@/lib/products/validation";

/**
 * Validation for promo banners.
 *
 * Zod rather than the hand-rolled parsers the other `validation.ts` modules
 * use: this form has cross-field rules (the schedule window) and value
 * coercion (datetime-local strings to Date), which a schema states directly.
 */

/** Sentinel the CTA link picker uses for "type a URL instead of picking one". */
export const CUSTOM_LINK_VALUE = "__custom__";

/** Sentinel for "create a category and point this banner at it". */
export const NEW_CATEGORY_LINK_VALUE = "__new_category__";

/**
 * Accepts in-app paths and http(s) URLs, and nothing else — so a `javascript:`
 * CTA can never reach an <a href>.
 *
 * The `//` guard matters: `//evil.example` looks root-relative but is
 * protocol-relative and would navigate off-site.
 */
export function isSafeLinkUrl(value: string): boolean {
  if (value.startsWith("/")) return !value.startsWith("//");

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * `datetime-local` submits "YYYY-MM-DDTHH:mm" (or "" when cleared), which
 * `Date` reads as local time — the timezone the admin is actually thinking in.
 */
const optionalDateTime = z
  .string()
  .trim()
  .refine((value) => value === "" || !Number.isNaN(Date.parse(value)), {
    message: "Enter a valid date and time",
  })
  .transform((value) => (value === "" ? null : new Date(value)));

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === "" ? null : value));

export const bannerSchema = z
  .object({
    imageUrl: z
      .string()
      .trim()
      .min(1, "An image is required")
      .refine(isSafeImageUrl, "Image must be an uploaded file or an http(s) URL"),

    heading: z
      .string()
      .trim()
      .min(1, "Heading is required")
      .max(80, "Heading must be 80 characters or fewer"),

    subtext: optionalText(160, "Subtext must be 160 characters or fewer"),

    ctaLabel: z
      .string()
      .trim()
      .min(1, "Button label is required")
      .max(40, "Button label must be 40 characters or fewer"),

    ctaLink: z
      .string()
      .trim()
      .min(1, "A destination is required")
      .refine(isSafeLinkUrl, "Link must start with / or be an http(s) URL"),

    /** Which category section the banner sits under; "" means none. */
    categoryId: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value)),

    isActive: z.boolean(),
    startsAt: optionalDateTime,
    endsAt: optionalDateTime,
  })
  .refine(
    (value) => !value.startsAt || !value.endsAt || value.endsAt > value.startsAt,
    { message: "The end must come after the start", path: ["endsAt"] },
  );

export type BannerInput = z.infer<typeof bannerSchema>;

/** Field-keyed errors, matching the shape the other admin forms already use. */
export type FieldErrors = Record<string, string>;

export type ParseResult =
  | { ok: true; data: BannerInput }
  | { ok: false; errors: FieldErrors };

/**
 * Read a banner out of submitted form data.
 *
 * The CTA link arrives as a category pick or a free-text URL depending on the
 * mode the form was in, so it is resolved here rather than in the schema —
 * the schema only ever sees the final destination.
 */
export function parseBanner(
  formData: FormData,
  /**
   * Destination worked out by the caller. Used when the banner is creating a
   * category to point at: the link depends on that category's slug, which the
   * action derives before anything is written.
   */
  ctaLinkOverride?: string,
): ParseResult {
  const linkMode = String(formData.get("ctaLinkMode") ?? "");
  const ctaLink =
    ctaLinkOverride ??
    (linkMode === CUSTOM_LINK_VALUE
      ? String(formData.get("ctaLinkCustom") ?? "")
      : linkMode);

  const result = bannerSchema.safeParse({
    imageUrl: String(formData.get("imageUrl") ?? ""),
    heading: String(formData.get("heading") ?? ""),
    subtext: String(formData.get("subtext") ?? ""),
    ctaLabel: String(formData.get("ctaLabel") ?? ""),
    ctaLink,
    categoryId: String(formData.get("categoryId") ?? ""),
    // An unchecked checkbox submits nothing at all.
    isActive: formData.get("isActive") === "on",
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
  });

  if (result.success) return { ok: true, data: result.data };

  // First message per field wins — the forms show one line under each input.
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in errors)) errors[key] = issue.message;
  }

  // Both link inputs share one schema field; point the error at whichever the
  // admin can actually see.
  if (errors.ctaLink && linkMode === CUSTOM_LINK_VALUE) {
    errors.ctaLinkCustom = errors.ctaLink;
  }

  return { ok: false, errors };
}
