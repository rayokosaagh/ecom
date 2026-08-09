/**
 * Text primitives behind catalogue search — normalisation, tokenising and
 * bounded edit distance.
 *
 * Deliberately free of any database import so the client bundle can reuse
 * `tokenize` for match highlighting without pulling Prisma in behind it.
 * The scoring and querying that build on these live in `./search`.
 */

/** Shape returned to the typeahead. */
export interface ProductSuggestion {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  priceCents: number;
  stock: number;
  categoryName: string | null;
}

/** Payload of `GET /api/search`. */
export interface SearchResponse {
  query: string;
  results: ProductSuggestion[];
}

/** Longest query we will act on — anything beyond this is noise or abuse. */
export const MAX_QUERY_LENGTH = 80;

/** Lowercase and strip diacritics, so "Café" and "cafe" are the same word. */
export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Normalised text → the individual words we match on. */
export function tokenize(value: string): string[] {
  return normalize(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * How many typos to forgive in a word of `length` characters.
 *
 * One notch stricter than Elasticsearch's AUTO fuzziness, because matching
 * here runs against *prefixes* (see `editDistance`'s prefixMode) and that
 * makes a short token far more permissive than it looks: with one edit
 * allowed, "mac" reaches the two-letter prefix "ac" and so matches
 * "Accessories" — and by extension acorn, acme, maple and bacon.
 *
 * Three characters therefore get no slack at all; they still match literally
 * by prefix, which is what autocomplete actually needs.
 */
function maxEdits(length: number): number {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  return 2;
}

/**
 * Damerau–Levenshtein distance (optimal string alignment), bounded by `max`.
 *
 * Returns `max + 1` as soon as the answer is known to exceed the bound — every
 * row minimum in the matrix is non-decreasing, so once a row bottoms out above
 * `max` no later row can come back under it.
 *
 * With `prefixMode`, the result is the distance from `a` to the *closest
 * prefix* of `b` rather than to all of `b`. That is what keeps autocomplete
 * usable: a half-typed "kaybo" should not be charged for the "ard" the user
 * has not reached yet.
 */
export function editDistance(
  a: string,
  b: string,
  max: number,
  prefixMode = false,
): number {
  if (a === b) return 0;

  const al = a.length;
  const bl = b.length;
  if (al === 0) return prefixMode ? 0 : bl;
  if (bl === 0) return al;
  // In prefix mode `b` may legitimately be much longer than `a`.
  if (!prefixMode && Math.abs(al - bl) > max) return max + 1;

  let prev2 = new Array<number>(bl + 1).fill(0);
  let prev = new Array<number>(bl + 1);
  let curr = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = i;

    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let value = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );

      // Transposition — "recieve" is one mistake away from "receive", not two.
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        value = Math.min(value, prev2[j - 2] + 1);
      }

      curr[j] = value;
      if (value < rowMin) rowMin = value;
    }

    if (rowMin > max) return max + 1;

    // Rotate the three rows: the old prev2 becomes the next scratch buffer.
    [prev2, prev, curr] = [prev, curr, prev2];
  }

  if (!prefixMode) return prev[bl];

  let best = prev[0];
  for (let j = 1; j <= bl; j++) if (prev[j] < best) best = prev[j];
  return best;
}

export interface FuzzyMatch {
  /** Edits needed to reach the closest prefix of the word. */
  distance: number;
  /**
   * Whether the token is within budget of the *entire* word rather than just a
   * prefix of it. "lmap" reaches all of "lamp" but only the "lap" of "laptop",
   * and the former is the better match even though both cost one edit.
   */
  whole: boolean;
}

/**
 * Match a typed token against a catalogue word, or `null` when they are
 * further apart than the typo budget allows.
 */
export function fuzzyMatch(token: string, word: string): FuzzyMatch | null {
  const budget = maxEdits(token.length);
  if (budget === 0) return token === word ? { distance: 0, whole: true } : null;

  const distance = editDistance(token, word, budget, true);
  if (distance > budget) return null;

  return { distance, whole: editDistance(token, word, budget) <= budget };
}
