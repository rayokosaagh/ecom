import { AnnouncementLevel } from "@/generated/prisma/enums";

/**
 * What each level looks like, and how loudly it counts.
 *
 * One record keyed by the enum, so a member added to the schema without an
 * entry here fails the build rather than rendering an unstyled strip. Same
 * arrangement as `lib/social/catalogue` and `lib/payments/methods`, for the
 * same reason: the database stores which, and exactly one module decides what
 * that means.
 *
 * No `server-only` and no Prisma client — the bar is rendered inside the
 * navigation bar, which is a client component, so this has to be importable
 * from both sides. The enum import is a plain generated value, not the client.
 */

export interface AnnouncementLevelStyle {
  /** Shown in the admin form and read out beside the message. */
  label: string;
  /** Material Symbols ligature, drawn ahead of each message. */
  icon: string;
  /**
   * The strip's own colours at this level.
   *
   * Three of the four are `*-container` tints. `CRITICAL` is the solid role
   * instead, and that difference is the point — a container tint is a
   * background the eye files as chrome, which is fine for "we are shut on
   * Tuesday" and useless for "payments are down". Escalating the *saturation*
   * rather than only the hue is what makes the top level register at a glance.
   */
  strip: string;
  /**
   * The same two colours as raw CSS values rather than utility classes.
   *
   * Needed because the strip no longer paints one colour: each notice wears its
   * own, and consecutive notices are joined by a `linear-gradient` from one to
   * the next. A gradient needs *values*, and `bg-primary-container` is a class
   * name — so the tokens are named directly here. They are the same custom
   * properties the utilities compile to, which is what keeps the two in step
   * across a theme change.
   */
  bg: string;
  fg: string;
  /**
   * The chip that stands in for this level in the admin list, where several
   * levels sit together and none of them owns the background.
   */
  chip: string;
}

export const ANNOUNCEMENT_LEVELS: Record<AnnouncementLevel, AnnouncementLevelStyle> = {
  [AnnouncementLevel.INFO]: {
    label: "Info",
    icon: "info",
    strip: "bg-primary-container text-on-primary-container",
    chip: "bg-primary-container text-on-primary-container",
    bg: "var(--color-primary-container)",
    fg: "var(--color-on-primary-container)",
  },
  [AnnouncementLevel.SUCCESS]: {
    label: "Good news",
    icon: "check_circle",
    strip: "bg-tertiary-container text-on-tertiary-container",
    chip: "bg-tertiary-container text-on-tertiary-container",
    bg: "var(--color-tertiary-container)",
    fg: "var(--color-on-tertiary-container)",
  },
  [AnnouncementLevel.WARNING]: {
    label: "Heads up",
    icon: "warning",
    strip: "bg-warning-container text-on-warning-container",
    chip: "bg-warning-container text-on-warning-container",
    bg: "var(--color-warning-container)",
    fg: "var(--color-on-warning-container)",
  },
  [AnnouncementLevel.CRITICAL]: {
    label: "Critical",
    icon: "e911_emergency",
    strip: "bg-error text-on-error",
    chip: "bg-error text-on-error",
    bg: "var(--color-error)",
    fg: "var(--color-on-error)",
  },
};

/**
 * Least to most urgent.
 *
 * The bar is one strip however many notices are running, so when several are
 * live at once something has to decide its colour. It takes the highest rank
 * present: a red strip carrying a routine notice overstates that one line,
 * while a blue strip carrying "payments are down" understates the only line
 * that matters — and only the second of those mistakes costs anybody anything.
 *
 * Each message still carries its own glyph, so the individual levels stay
 * distinguishable inside a strip that can only be one colour.
 */
const RANK: Record<AnnouncementLevel, number> = {
  [AnnouncementLevel.INFO]: 0,
  [AnnouncementLevel.SUCCESS]: 1,
  [AnnouncementLevel.WARNING]: 2,
  [AnnouncementLevel.CRITICAL]: 3,
};

/** The level the strip should wear, given everything currently published. */
export function highestLevel(
  levels: AnnouncementLevel[],
  fallback: AnnouncementLevel = AnnouncementLevel.INFO,
): AnnouncementLevel {
  return levels.reduce(
    (highest, level) => (RANK[level] > RANK[highest] ? level : highest),
    fallback,
  );
}

/** Ordered for the admin form's picker: quietest first, loudest last. */
export const ANNOUNCEMENT_LEVEL_ORDER: AnnouncementLevel[] = [
  AnnouncementLevel.INFO,
  AnnouncementLevel.SUCCESS,
  AnnouncementLevel.WARNING,
  AnnouncementLevel.CRITICAL,
];

export function isAnnouncementLevel(value: string): value is AnnouncementLevel {
  return Object.prototype.hasOwnProperty.call(ANNOUNCEMENT_LEVELS, value);
}
