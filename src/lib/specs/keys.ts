/**
 * Normalization for spec labels and values.
 *
 * Filtering lives or dies on this. A shopper who ticks "16GB" expects every
 * 16-gigabyte machine back, including the ones whose editor typed "16 GB" — so
 * both have to collapse to one key. Display always uses the value as typed;
 * only matching and grouping use the key.
 */

/** Upper bound on specs per product; the form stops offering more rows. */
export const MAX_SPECS = 24;

export const MAX_SPEC_LABEL_LENGTH = 40;
export const MAX_SPEC_VALUE_LENGTH = 80;

/**
 * Key for a spec *label*, e.g. "Switch type" → "switch-type".
 *
 * Hyphenated rather than stripped, because this one appears in query strings
 * where it has to stay readable: `?spec=switch-type:brown`.
 */
export function specLabelKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Key for a spec *value*, e.g. "16 GB" → "16gb".
 *
 * Whitespace is removed rather than hyphenated, which is the whole point:
 * "16GB" and "16 GB" are the same answer and must produce the same key. Dots
 * and pluses survive so "2.5" stays distinct from "25", and "USB-C" keeps its
 * hyphen.
 */
export function specValueKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9.+/-]/g, "");
}

/** How a value reads once its label's unit is applied. */
export function formatSpecValue(value: string, unit: string | null): string {
  if (!unit) return value;
  // A value that already carries the unit is left alone: an editor who typed
  // "16GB" into a field labelled GB meant one unit, not two.
  return value.toLowerCase().endsWith(unit.toLowerCase()) ? value : `${value} ${unit}`;
}
