/**
 * The sale shelf's card colours.
 *
 * `PromoCard` cycles three container tints, and reusing those was the first
 * instinct — but two of the three are blue. In the dark scheme
 * `--primary-container` is `#0842a0` and `--secondary-container` is `#004a77`,
 * which sit close enough that a row wearing both reads as "two similar cards
 * and a green one" rather than as a deliberately varied set.
 *
 * So the palette is widened here rather than borrowed. Every entry is still
 * built from theme tokens — nothing is a hardcoded hex — so the shelf follows
 * the light and dark schemes and any future retheme for free. The fourth is
 * mixed rather than picked because the theme has no fourth decorative hue:
 * `--error-container` is the only remaining container and it means "sold out"
 * and "something went wrong" elsewhere in this app, so it is used only as an
 * ingredient, never on its own.
 *
 * Expressed as CSS colour expressions rather than Tailwind classes because
 * `color-mix` cannot be written as a utility, and because the hover cross-fade
 * needs to hand two of these to the same element at once.
 */

export interface SaleTint {
  /** Base colour the card's gradient is built from. */
  fill: string;
  /** Foreground that reads on it. */
  on: string;
}

export const SALE_TINTS: SaleTint[] = [
  {
    fill: "var(--color-primary-container)",
    on: "var(--color-on-primary-container)",
  },
  {
    fill: "var(--color-tertiary-container)",
    on: "var(--color-on-tertiary-container)",
  },
  {
    // Blue pulled towards red: a violet the palette does not otherwise contain,
    // and far enough from both parents to be its own colour in the row.
    fill: "color-mix(in oklab, var(--color-primary-container) 55%, var(--color-error-container))",
    on: "var(--color-on-primary-container)",
  },
  {
    fill: "var(--color-secondary-container)",
    on: "var(--color-on-secondary-container)",
  },
];

/**
 * The lead card's colour.
 *
 * Green already means "saving" across the catalogue, and the deepest discount
 * is the card where that reading matters most.
 */
export const LEAD_TINT_INDEX = 1;

/**
 * Resting colours for the row under the lead: the palette minus the lead's.
 *
 * Cycling the whole palette from 0 put the lead's green back on the second card
 * in the row, so the shelf showed two mint cards. Removing the lead's entry
 * first is what guarantees every card on the shelf is a different colour —
 * there are exactly as many tints as there are cards, so the row consumes the
 * remainder exactly.
 *
 * If the shelf ever shows more cards than the palette has colours the modulo in
 * `saleTintPair` wraps and a colour repeats. That is the honest failure — a
 * repeat far apart is better than an off-palette colour — but the fix is
 * another tint here, not another modulo.
 */
export const GRID_TINT_INDICES: number[] = SALE_TINTS.map(
  (_tint, index) => index,
).filter((index) => index !== LEAD_TINT_INDEX);

/**
 * The wash a card wears, at `PromoCard`'s stops: strong at the top-left corner,
 * nearly gone at the bottom-right.
 */
export function saleGradient(tint: SaleTint): string {
  return (
    "linear-gradient(to bottom right, " +
    `color-mix(in oklab, ${tint.fill} 70%, transparent), ` +
    `color-mix(in oklab, ${tint.fill} 20%, transparent))`
  );
}

/** FNV-1a with a final xor-shift, the same hash `PromoCard` picks tints with. */
function hashOf(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 15;
  return hash >>> 0;
}

export interface SaleTintPair {
  base: SaleTint;
  hover: SaleTint;
}

/**
 * The colour a card rests at and the one it moves to under the cursor.
 *
 * The hover colour is **derived, not random**, and that is a deliberate
 * decision rather than a shortcut. Three things go wrong with true randomness
 * here: a value drawn during render differs between the server pass and the
 * client's, which is a hydration mismatch; a value redrawn on every hover makes
 * a card flicker through colours while the pointer crosses it; and either one
 * breaks the rule this codebase already states in `PromoCard` — that a card
 * keeps its colour, so the page looks the same on a second visit.
 *
 * Hashing the slug gives the same effect without any of that. Across a row the
 * pairs look arbitrary, because they are unrelated to position; for any one
 * card they are fixed, because they are a function of that card.
 *
 * @param tintIndex Which tint the card rests at. Chosen by the caller from
 *   `LEAD_TINT_INDEX` / `GRID_TINT_INDICES` so that no two cards on the shelf
 *   share a resting colour — picking it from the hash instead would let the
 *   same colour come up twice in a four-card shelf.
 * @param key Stable per-product string — the slug.
 */
export function saleTintPair(tintIndex: number, key: string): SaleTintPair {
  const baseIndex = tintIndex % SALE_TINTS.length;

  // `1 + (hash % (n - 1))` is an offset in 1..n-1, so the hover colour can
  // never land back on the resting one — a card that does not change under the
  // cursor reads as broken rather than subtle.
  const offset = 1 + (hashOf(key) % (SALE_TINTS.length - 1));

  return {
    base: SALE_TINTS[baseIndex],
    hover: SALE_TINTS[(baseIndex + offset) % SALE_TINTS.length],
  };
}
