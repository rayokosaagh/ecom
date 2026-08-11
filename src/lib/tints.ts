/**
 * The background tints an admin can put behind a product or a banner.
 *
 * ## Why these six and not a colour picker
 *
 * A free colour input would let anyone produce a background that fails contrast
 * against the type on it, ignores the theme, and looks nothing like the rest of
 * the shop — and it would do so most of the time, because picking a colour that
 * sits correctly beside an existing palette is a design job, not a data-entry
 * one. Every option here is built from Material 3 scheme *roles* rather than
 * from hexes, which buys three things a hex cannot:
 *
 *  - it flips with the theme, so a tint chosen in light mode is still the right
 *    tint at night rather than a bright slab on a dark page;
 *  - it can never fall outside the palette, because it *is* the palette; and
 *  - if the shop's source colour is ever regenerated, every tint moves with it.
 *
 * ## Why `error` and `warning` are not offered
 *
 * They would add two more hues, and both are excluded deliberately. In this app
 * red means something is broken and amber means something has been waiting too
 * long — see the note beside `--color-warning` in globals.css. Spending those
 * on decoration is exactly how a warning colour stops being noticed when it
 * matters.
 *
 * ## Why the ids are strings and not a Prisma enum
 *
 * A palette is presentation, and it will change more often than the schema
 * should. Storing the id as text means adding or retiring a preset is a change
 * to this file alone, and an id that no longer exists degrades to the automatic
 * tint rather than failing a query — see `resolveWellTint`.
 */

export interface Tint {
  id: string;
  /** What the admin sees under the swatch. */
  label: string;
  /**
   * The storefront wash: a vertical gradient laid over the neutral surface.
   *
   * Low alphas on purpose. These sit *behind* a product, so at full strength
   * the tint competes with the artwork it is meant to set off. A gradient
   * rather than a flat fill because a solid tone reads as a coloured card
   * containing a photo, where a wash reads as light on the surface the product
   * is standing on.
   */
  well: string;
  /**
   * The admin swatch, at roughly double the storefront's strength.
   *
   * Deliberately not the same class string. A 2rem chip showing a 15%-alpha
   * gradient is indistinguishable from every other 2rem chip, so the picker
   * would be a row of identical grey squares — the swatch has to state the hue
   * clearly enough to be *chosen*, even though the real thing is a whisper.
   */
  swatch: string;
}

/**
 * Ordered, and the order is what the picker shows. Neutral leads because it is
 * the default and the one that opts out.
 */
export const TINTS: Tint[] = [
  {
    id: "neutral",
    label: "Neutral",
    // No gradient at all: the well's own surface shows through unchanged.
    well: "",
    swatch: "bg-surface-container-highest",
  },
  {
    id: "blue",
    label: "Blue",
    well: "bg-gradient-to-b from-primary-container/60 to-primary-container/15",
    swatch: "bg-gradient-to-b from-primary-container to-primary-container/40",
  },
  {
    id: "sky",
    label: "Sky",
    well: "bg-gradient-to-b from-secondary-container/60 to-secondary-container/15",
    swatch: "bg-gradient-to-b from-secondary-container to-secondary-container/40",
  },
  {
    id: "green",
    label: "Green",
    well: "bg-gradient-to-b from-tertiary-container/60 to-tertiary-container/15",
    swatch: "bg-gradient-to-b from-tertiary-container to-tertiary-container/40",
  },
  {
    // Two roles meeting rather than one fading out. Adjacent hues only —
    // primary into secondary is the same move `.accent-word` makes, and for the
    // same reason: neighbouring hues read as a sheen, where distant ones read
    // as two colours arguing across the panel with a muddy midpoint.
    id: "dawn",
    label: "Blue → Sky",
    well: "bg-gradient-to-b from-primary-container/60 to-secondary-container/15",
    swatch: "bg-gradient-to-b from-primary-container to-secondary-container/50",
  },
  {
    id: "meadow",
    label: "Sky → Green",
    well: "bg-gradient-to-b from-secondary-container/60 to-tertiary-container/15",
    swatch: "bg-gradient-to-b from-secondary-container to-tertiary-container/50",
  },
];

export const DEFAULT_TINT_ID = "neutral";

/**
 * A custom colour, stored in the same column as a preset id.
 *
 * One field holds both because they answer the same question, and the two are
 * told apart by shape: a preset is a word, a custom colour is `#rrggbb`. That
 * keeps the storefront's fallback logic identical for both — anything the
 * palette does not recognise *and* is not a valid colour degrades to the
 * automatic cycle, so a malformed value can never reach the page.
 *
 * Strict six-digit hex only. Not because three-digit or `rgb()` forms are
 * wrong, but because this string is written into a `style` attribute, and the
 * narrowest grammar that does the job is the one with no room for anything
 * else in it. `<input type="color">` emits exactly this form.
 */
const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/** Either half of what the picker can produce. */
export function isTintValue(value: unknown): value is string {
  return isTintId(value) || isHexColor(value);
}

/**
 * The alphas a custom colour is painted at, as hex suffixes.
 *
 * The same 60% and 15% the presets use, and they are what makes an arbitrary
 * colour safe here. At those strengths the surface underneath still dominates
 * the result, so a custom tint lightens a light theme and darkens a dark one
 * instead of punching a fixed slab of colour through both — which is the whole
 * objection to a free colour input, answered by never letting the colour be
 * opaque. It is also why type over a custom tint can keep `on-surface` and stay
 * readable: the effective background never travels far from the surface it is
 * laid on.
 */
const CUSTOM_TOP = "99"; // 60%
const CUSTOM_BOTTOM = "26"; // 15%

/** What a component needs to paint a well: utilities, and maybe a style. */
export interface WellPaint {
  className: string;
  /**
   * Present only for custom colours. An inline style rather than a class
   * because the value is unbounded — Tailwind can only generate utilities it
   * can see in the source, and a colour chosen at runtime is by definition not
   * in the source.
   */
  style?: { backgroundImage: string };
}

function customPaint(hex: string): WellPaint {
  return {
    className: "",
    style: {
      backgroundImage: `linear-gradient(to bottom, ${hex}${CUSTOM_TOP}, ${hex}${CUSTOM_BOTTOM})`,
    },
  };
}

const BY_ID = new Map(TINTS.map((tint) => [tint.id, tint]));

export function isTintId(value: unknown): value is string {
  return typeof value === "string" && BY_ID.has(value);
}

/** The admin swatch for an id, or the neutral one for anything unrecognised. */
export function tintById(id: string | null | undefined): Tint {
  return (id && BY_ID.get(id)) || BY_ID.get(DEFAULT_TINT_ID)!;
}

/**
 * The wash to paint behind item `index` of a row.
 *
 * Two behaviours in one function, and the fallback is the interesting half.
 * With a tint chosen, that is simply what shows. With none — which is every
 * item until someone opens the admin and picks — the row still has to look
 * deliberate, so it steps through the three single-hue presets by position.
 *
 * Cycled by index rather than hashed from the product: a hash is free to hand
 * two adjacent panels the same tone, and then a row of four looks like a
 * mistake rather than a set. Stepping cannot.
 */
const AUTO_CYCLE = ["blue", "sky", "green"];

export function resolveWellTint(
  id: string | null | undefined,
  index: number,
): string {
  if (isTintId(id)) return tintById(id).well;
  return tintById(AUTO_CYCLE[index % AUTO_CYCLE.length]).well;
}

/**
 * The same decision as `resolveWellTint`, but able to answer with a colour.
 *
 * Prefer this at call sites that can spread a `style`; it is the only form that
 * can express a custom tint. The class-only version stays for callers that
 * cannot, and simply treats a custom colour as "not a preset" — which lands on
 * the automatic cycle rather than on nothing.
 */
export function resolveWell(
  tint: string | null | undefined,
  index: number,
): WellPaint {
  if (isHexColor(tint)) return customPaint(tint);
  return { className: resolveWellTint(tint, index) };
}
