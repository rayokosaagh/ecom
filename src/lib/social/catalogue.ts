import { SocialPlatform } from "@/generated/prisma/enums";

/**
 * What each social platform is, in one place.
 *
 * Free of `server-only` and of any database access on purpose: the admin form
 * needs the names to build its dropdown, the storefront needs the marks to draw
 * the bar, the parser needs the host rules to check a submission, and
 * `npm run check:social` exercises the last of those directly. One table, so
 * those four can never disagree about what "Instagram" means.
 *
 * The marks are Simple Icons paths, copied in rather than fetched. That is the
 * same source `scripts/import-brand-icons` pulls brand logos from and the same
 * shape — one monochrome path on a 24×24 viewBox with no fill of its own, so it
 * inherits `currentColor` and works in both themes from a single definition.
 *
 * The list is short by design. It holds the networks this shop actually posts
 * to; everything else is a `CUSTOM` link, which carries its own name, its own
 * pasted mark and its own colour. A built-in member per network was worse than
 * that in both directions — it could not cover the long tail without a
 * migration, and it filled the dropdown with logos for accounts nobody had.
 */

export interface SocialPlatformInfo {
  /** The network's own name, as it writes it. */
  name: string;

  /**
   * Hosts a link for this platform may point at, without `www.`.
   *
   * Checked rather than trusted because the icon is a claim about where the
   * link goes. A YouTube mark on an address that is not YouTube is the one
   * failure a shopper cannot check before clicking, and it is as likely to be
   * a paste into the wrong row as anything malicious.
   *
   * Empty means "any host" — see CUSTOM.
   */
  hosts: readonly string[];

  /**
   * Turns a bare handle into a profile URL, where the platform has a stable
   * shape for one. Null where it does not: a Facebook page and a YouTube
   * channel id are differently shaped, so those want the whole address pasted
   * rather than a guess built from a fragment.
   */
  handleUrl: ((handle: string) => string) | null;

  /** Shown under the field as the shape being asked for. */
  hint: string;

  /**
   * What the icon lights up to on hover, when the link has not overridden it.
   *
   * The network's own colour, so the bar is recognisable at a glance rather
   * than a row of identical grey discs. Stored as the *default* only —
   * `SocialLink.hoverColor` overrides it, and the admin picker starts here.
   */
  brandColor: string;

  /**
   * The mark, as a 24×24 path. Null for CUSTOM, whose mark is pasted by the
   * admin into `SocialLink.iconSvg`.
   */
  path: string | null;
}

export const SOCIAL_PLATFORMS: Record<SocialPlatform, SocialPlatformInfo> = {
  [SocialPlatform.INSTAGRAM]: {
    name: "Instagram",
    hosts: ["instagram.com"],
    handleUrl: (handle) => `https://instagram.com/${handle}`,
    hint: "instagram.com/yourshop, or just the handle",
    // The middle of the gradient. A single hex cannot be the gradient, and the
    // pink is the part people name when they name the colour.
    brandColor: "#e4405f",
    path: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
  },
  [SocialPlatform.FACEBOOK]: {
    name: "Facebook",
    hosts: ["facebook.com", "fb.com", "fb.me", "m.facebook.com"],
    // A page can be /yourshop, /pages/…, or a numeric id, so the whole address
    // is asked for rather than guessed at from a fragment.
    handleUrl: null,
    hint: "facebook.com/yourshop",
    brandColor: "#0866ff",
    path: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  },
  [SocialPlatform.X]: {
    name: "X",
    // twitter.com still resolves and is still what most shops have on file.
    hosts: ["x.com", "twitter.com"],
    handleUrl: (handle) => `https://x.com/${handle}`,
    hint: "x.com/yourshop, or just the handle",
    // Black really is the brand, and on a dark surface the filled chip reads as
    // a darker disc rather than a coloured one. That is correct and legible —
    // the glyph on it is contrast-picked — and any shop that dislikes it has
    // the picker.
    brandColor: "#000000",
    path: "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
  },
  [SocialPlatform.TIKTOK]: {
    name: "TikTok",
    hosts: ["tiktok.com"],
    handleUrl: (handle) => `https://tiktok.com/@${handle.replace(/^@/, "")}`,
    hint: "tiktok.com/@yourshop, or just the handle",
    // The accent from the logo rather than the black it is drawn in. Two black
    // chips beside each other say nothing about which is which, and this red is
    // the half of TikTok's palette people recognise.
    brandColor: "#fe2c55",
    path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  },
  [SocialPlatform.YOUTUBE]: {
    name: "YouTube",
    hosts: ["youtube.com", "youtu.be"],
    // Channels come as /@handle, /c/…, /channel/UC…; only the first is
    // guessable, and guessing wrong sends people to somebody else's channel.
    handleUrl: null,
    hint: "youtube.com/@yourshop",
    brandColor: "#ff0000",
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
  [SocialPlatform.CUSTOM]: {
    name: "Custom",
    // Any host: this member exists precisely for the networks not listed above.
    hosts: [],
    handleUrl: null,
    hint: "The full https:// address",
    // The app's own primary, so a custom link with no colour chosen still looks
    // deliberate rather than unfinished.
    brandColor: "#0b57d0",
    path: null,
  },
};

/** Every platform, in the order the admin dropdown offers them. */
export const SOCIAL_PLATFORM_ORDER = Object.keys(
  SOCIAL_PLATFORMS,
) as SocialPlatform[];

/** Narrows an arbitrary string — a form value — to a known platform. */
export function isSocialPlatform(value: string): value is SocialPlatform {
  return Object.hasOwn(SOCIAL_PLATFORMS, value);
}

/**
 * What to call one link.
 *
 * The admin's own label wins where there is one; otherwise the network's name.
 * Used for the accessible name and the tooltip both, so the two never drift.
 *
 * A CUSTOM link with no label would fall back to the literal word "Custom",
 * which is why the parser requires one — this is the safety net, not the plan.
 */
export function socialLinkName(
  platform: SocialPlatform,
  label: string | null,
): string {
  return label?.trim() || SOCIAL_PLATFORMS[platform].name;
}
