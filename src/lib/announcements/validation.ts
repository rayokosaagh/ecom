import type { Validated } from "@/lib/auth/validation";
import { isAnnouncementLevel } from "@/lib/announcements/levels";
import { AnnouncementLevel } from "@/generated/prisma/enums";

/**
 * Admin form rules for one announcement.
 *
 * Deliberately free of `server-only` and of any database access, like every
 * other `parse*` in this codebase — `npm run check:announcements` exercises it
 * directly, and the `href` rules below are exactly the kind of thing that
 * deserves to be exercised.
 */

/** Long enough for a real notice, short enough to read as it scrolls past. */
export const MAX_MESSAGE_LENGTH = 160;

export const MAX_HREF_LENGTH = 500;

export type AnnouncementInput = {
  message: string;
  level: AnnouncementLevel;
  href: string | null;
  published: boolean;
};

/**
 * Whether a link is one this bar may point at.
 *
 * **This is a security boundary, not a tidiness check.** The value goes
 * straight into an `href` on a strip that renders inside the navigation bar —
 * which is to say on every page of the site — so `javascript:` here would be
 * script execution everywhere, authored by anyone who can reach the admin form.
 *
 * Allowed: a same-site path, or an absolute `http(s)` URL. Everything else is
 * refused rather than sanitized, because there is no useful third case and
 * "fixing" a hostile string quietly is how a bypass gets shipped.
 *
 * Three specific traps, each of which looks harmless in a form field:
 *
 *  - **Control characters.** The URL parser strips tabs and newlines *before*
 *    reading the scheme, so `java&Tab;script:alert(1)` parses as `javascript:`.
 *    Anything below a space is rejected before parsing rather than after.
 *  - **Protocol-relative.** `//evil.example` is not a path; it is an absolute
 *    URL borrowing the current scheme, and it passes any test that only asks
 *    whether the string starts with a slash.
 *  - **Backslashes.** Browsers normalise `\` to `/` in the authority, so
 *    `/\evil.example` reaches the same place `//evil.example` does.
 */
export function isSafeHref(raw: string): boolean {
  // Escapes rather than literal characters: a raw tab inside a character
  // class is invisible in the source and one reformat away from being deleted
  // by a tool that thinks it is tidying whitespace.
  if (/[\u0000-\u0020\u007F]/.test(raw)) return false;

  if (raw.startsWith("//") || raw.startsWith("/\\") || raw.startsWith("\\")) {
    return false;
  }

  if (raw.startsWith("/")) return true;

  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function parseAnnouncement(formData: FormData): Validated<AnnouncementInput> {
  const errors: Record<string, string> = {};

  const message = String(formData.get("message") ?? "").trim();
  const levelRaw = String(formData.get("level") ?? "").trim();
  const href = String(formData.get("href") ?? "").trim();
  // An unchecked checkbox submits nothing at all.
  const published = formData.get("published") === "on";

  if (!message) errors.message = "Message is required";
  else if (message.length > MAX_MESSAGE_LENGTH) {
    errors.message = `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`;
  }

  // Checked rather than cast. The select offers only valid members, but a
  // server action is a public POST endpoint — the form being well behaved is
  // not what makes the value well formed.
  if (!levelRaw) errors.level = "Choose a level";
  else if (!isAnnouncementLevel(levelRaw)) errors.level = "That is not a level";

  if (href) {
    if (href.length > MAX_HREF_LENGTH) {
      errors.href = `Link must be ${MAX_HREF_LENGTH} characters or fewer`;
    } else if (!isSafeHref(href)) {
      errors.href = "Use a path like /sale, or a full https:// address";
    }
  }

  // Every problem at once — reporting one at a time makes an admin submit
  // repeatedly to discover them all.
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      message,
      level: levelRaw as AnnouncementLevel,
      href: href || null,
      published,
    },
  };
}
