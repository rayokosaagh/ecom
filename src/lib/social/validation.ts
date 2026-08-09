import type { Validated } from "@/lib/auth/validation";
import { SocialPlatform } from "@/generated/prisma/enums";
import { sanitizeSvg } from "@/lib/brands/svg";
import { SOCIAL_PLATFORMS, isSocialPlatform } from "@/lib/social/catalogue";
import { normalizeHexColor } from "@/lib/social/color";

/**
 * Admin form rules for one social link.
 *
 * Free of `server-only` and of any database access, like every other `parse*`
 * here — `npm run check:social` exercises it directly. `sanitizeSvg` is
 * imported for the same reason it can be: it is plain TypeScript with no DOM,
 * so the browser previews byte-for-byte what the server will store.
 */

/** Long enough for "@ecomgear · behind the scenes", short enough for a chip. */
export const MAX_LABEL_LENGTH = 40;

export type SocialLinkInput = {
  platform: SocialPlatform;
  /** Always a full, absolute URL — a handle is expanded before it gets here. */
  url: string;
  label: string | null;
  /** Null where the platform's own colour is wanted. See the parser's note. */
  hoverColor: string | null;
  /** Sanitized markup, and only ever for CUSTOM. */
  iconSvg: string | null;
  published: boolean;
};

/**
 * A bare handle: letters, digits, dot, dash, underscore, and an optional
 * leading sigil.
 *
 * The sigil is part of how people write these — a TikTok handle is "@shop" and
 * a subreddit is "r/shop", and an admin who types the form they read everywhere
 * should not be told it is wrong. Each platform's `handleUrl` strips its own.
 *
 * Nothing here matches `:` or a bare `/`, which is what keeps `javascript:` and
 * friends from reaching the fallback below.
 */
const HANDLE_PATTERN = /^(?:@|r\/)?[A-Za-z0-9._-]+$/;

/**
 * Reads the input as a web address, or null if it is not one for this platform.
 *
 * `http://` is upgraded rather than refused: a shop pasting its own profile
 * from an old bookmark means the same page, and every one of these hosts
 * redirects to TLS anyway. Anything else — `javascript:`, `data:`, `ftp:` — is
 * rejected outright, because this string becomes an `href`.
 */
function asAddress(input: string, hosts: readonly string[]): string | null {
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input);

  let parsed: URL;
  try {
    parsed = new URL(hasScheme ? input : `https://${input}`);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  parsed.protocol = "https:";

  // `www.` is stripped so the stored address matches the host list and so two
  // admins entering the same profile two ways store the same string.
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

  /**
   * A single-label host is not an address anyone means.
   *
   * `new URL("https://ecomgear")` parses perfectly happily, so without this a
   * typed handle would be stored as a link to an intranet name that resolves
   * nowhere. Requiring a dot is what sends it to the handle fallback instead.
   */
  if (!host.includes(".")) return null;
  parsed.hostname = host;

  // An empty list means "any host" — that is what WEBSITE is for. Subdomains
  // count: `music.youtube.com` is still YouTube.
  if (hosts.length > 0) {
    const allowed = hosts.some(
      (candidate) => host === candidate || host.endsWith(`.${candidate}`),
    );
    if (!allowed) return null;
  }

  return parsed.toString();
}

/** Every host any platform claims, flattened once. */
const KNOWN_HOSTS: readonly string[] = Object.values(SOCIAL_PLATFORMS).flatMap(
  (info) => info.hosts,
);

/** Whether the input is an address pointing at a network in the catalogue. */
function namesAnotherPlatform(input: string): boolean {
  // `[]` — any host — so this asks "is it an address at all, and whose?"
  // rather than re-running the check that has already failed.
  const anywhere = asAddress(input, []);
  if (!anywhere) return false;

  const host = new URL(anywhere).hostname;
  return KNOWN_HOSTS.some(
    (candidate) => host === candidate || host.endsWith(`.${candidate}`),
  );
}

/**
 * Turns what the admin typed into an absolute URL, or null if it cannot.
 *
 * Address first, handle second — and the fallback matters rather than being
 * tidiness. Neither shape can be recognised by looking at the string: an
 * Instagram handle may contain dots (`ecom.gear`) and a subreddit contains a
 * slash (`r/ecomgear`), so any up-front "does this look like a URL?" test
 * misfiles one or the other. Trying it as an address and expanding it as a
 * handle only when that fails gets both, and costs nothing but a parse.
 */
export function toSocialUrl(
  platform: SocialPlatform,
  raw: string,
): string | null {
  const input = raw.trim();
  if (!input) return null;

  const info = SOCIAL_PLATFORMS[platform];

  const address = asAddress(input, info.hosts);
  if (address) return address;

  /**
   * An address belonging to a *different* platform is a mistake, not a handle.
   *
   * Without this the fallback quietly rescues the exact error the host check
   * exists to catch: "facebook.com" typed into the Instagram row parses as an
   * address, fails Instagram's host list, and then matches the handle pattern —
   * because a dot is legal in an Instagram handle — and is stored as
   * `instagram.com/facebook.com`. No error, a live-looking link, and a profile
   * that does not exist.
   *
   * Checking against every platform's hosts rather than guessing at what "looks
   * like a domain" is what keeps a genuine handle with a dot in it (`ecom.gear`)
   * working: it is only refused if it names somewhere this app knows to be
   * somebody else's network.
   */
  if (namesAnotherPlatform(input)) return null;

  // Not an address at all, then. Anything still carrying a scheme or a path is
  // rejected by the pattern below rather than expanded.
  if (!info.handleUrl || !HANDLE_PATTERN.test(input)) return null;

  // The `@` is stripped centrally because most platforms do not want it in the
  // path; the ones that do put it back. `r/` belongs to Reddit alone, so Reddit
  // strips that itself.
  return info.handleUrl(input.replace(/^@/, ""));
}

export function parseSocialLink(
  formData: FormData,
): Validated<SocialLinkInput> {
  const errors: Record<string, string> = {};

  const platformValue = String(formData.get("platform") ?? "").trim();
  const rawUrl = String(formData.get("url") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const rawColor = String(formData.get("hoverColor") ?? "").trim();
  const rawSvg = String(formData.get("iconSvg") ?? "").trim();
  // An unchecked checkbox submits nothing at all.
  const published = formData.get("published") === "on";

  const isCustom = platformValue === SocialPlatform.CUSTOM;

  if (!platformValue) {
    errors.platform = "Choose a platform";
  } else if (!isSocialPlatform(platformValue)) {
    errors.platform = "That is not a platform this shop knows about";
  }

  let url: string | null = null;

  if (!rawUrl) {
    errors.url = "A link is required";
  } else if (isSocialPlatform(platformValue)) {
    url = toSocialUrl(platformValue, rawUrl);
    if (url === null) {
      const info = SOCIAL_PLATFORMS[platformValue];
      /**
       * Two different failures, said differently.
       *
       * "Not a valid address" is unhelpful when the real problem is that a
       * LinkedIn URL was pasted into the Instagram row — which is the mistake
       * this check exists to catch, and the one that would otherwise ship a
       * logo pointing somewhere it does not belong.
       */
      errors.url =
        info.hosts.length > 0
          ? `That link does not point at ${info.name}. Expected ${info.hint}`
          : `That does not look like a web address. Expected ${info.hint}`;
    }
  }

  if (label.length > MAX_LABEL_LENGTH) {
    errors.label = `Keep this under ${MAX_LABEL_LENGTH} characters`;
  } else if (isCustom && !label) {
    /**
     * Optional everywhere else, required here.
     *
     * A custom link has no network name to fall back on, so an empty label
     * leaves the bar announcing the literal word "Custom" to a screen reader —
     * and showing it on hover. The name *is* the link, when nothing else
     * identifies it.
     */
    errors.label = "A custom link needs a name — it is what the icon announces";
  }

  /**
   * The colour is stored as an override, so matching the default stores null.
   *
   * The picker always submits a colour, because `<input type="color">` has no
   * empty state — so without this, opening the form and saving it unchanged
   * would silently freeze that link's colour at whatever the platform's default
   * happened to be that day. Comparing against the default is what keeps
   * "never touched it" distinct from "chose this exact colour".
   */
  let hoverColor: string | null = null;
  if (rawColor) {
    const normalized = normalizeHexColor(rawColor);
    if (!normalized) {
      errors.hoverColor = "Enter a colour as #rrggbb";
    } else if (
      isSocialPlatform(platformValue) &&
      normalized !== SOCIAL_PLATFORMS[platformValue].brandColor
    ) {
      hoverColor = normalized;
    }
  }

  /**
   * The mark, and only for CUSTOM.
   *
   * Sanitized here rather than in the action, so the browser's preview runs the
   * identical function — `lib/brands/svg` rebuilds markup from an allowlist
   * instead of stripping, and this is the only path to `SocialLink.iconSvg`.
   *
   * Silently dropped rather than rejected for the built-in platforms: their
   * mark comes from the catalogue, so markup left in the field by someone who
   * switched the dropdown after pasting is stale, not an error to argue with.
   */
  let iconSvg: string | null = null;
  if (isCustom && rawSvg) {
    const result = sanitizeSvg(rawSvg);
    if (!result.ok) errors.iconSvg = result.error;
    else iconSvg = result.svg;
  }

  // Every problem at once — reporting one at a time makes an admin submit
  // repeatedly to discover them all.
  if (Object.keys(errors).length > 0 || url === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      platform: platformValue as SocialPlatform,
      url,
      label: label || null,
      hoverColor,
      iconSvg,
      published,
    },
  };
}
