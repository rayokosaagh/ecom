/**
 * The rule behind "similar products" — what counts as similar, and in what
 * order.
 *
 * Deliberately free of any database import, the same way `./search-text` is:
 * what counts as similar is a judgement worth exercising directly, and
 * `npm run check:similar` does exactly that without a database. The query that
 * feeds it lives in `./similar`.
 */

/** How many to show. Four fills one row of the catalogue grid at every width. */
export const SIMILAR_LIMIT = 4;

/**
 * The tiers, strongest first.
 *
 * Ordered by tier *before* anything else rather than summed into one score.
 * Weighted sums invite exactly one bug — a big enough tiebreak quietly
 * outranking a whole tier — and there is no reading of "similar" where a
 * same-priced product from another department beats a dearer one from this
 * shelf.
 */
export const SIMILAR_TIER = {
  /** Same shelf and same maker. Nothing is more like a Sony TV than a Sony TV. */
  SAME_CATEGORY_AND_BRAND: 4,
  /** Same shelf. The strongest single signal: a laptop is like a laptop. */
  SAME_CATEGORY: 3,
  /** A neighbouring shelf under the same parent, same maker. */
  SIBLING_CATEGORY_AND_BRAND: 2,
  /** A neighbouring shelf — "Gaming laptops" beside "Student laptops". */
  SIBLING_CATEGORY: 1,
  /**
   * Same maker, unrelated shelf. Weakest, and last: headphones are only
   * loosely "like" a laptop, however much they share a logo.
   */
  SAME_BRAND: 0,
  /** Not similar at all. Dropped rather than ranked. */
  NONE: -1,
} as const;

export type SimilarSubject = {
  id: string;
  categoryId: string | null;
  /** The category's own parent, for the sibling tiers. Null at top level. */
  categoryParentId: string | null;
  brandId: string | null;
  priceCents: number;
};

export type SimilarCandidate = SimilarSubject & { slug: string };

/**
 * Which tier a candidate falls in.
 *
 * Two nulls are never a match. An uncategorised product is not "in the same
 * category" as every other uncategorised product, and a product with no brand
 * shares no maker with anything — treating absence as a shared value is how a
 * shelf fills up with things that have nothing to do with each other.
 */
export function similarityTier(
  base: SimilarSubject,
  candidate: SimilarCandidate,
): number {
  if (candidate.id === base.id) return SIMILAR_TIER.NONE;

  const sameCategory =
    base.categoryId !== null && candidate.categoryId === base.categoryId;
  const sameBrand = base.brandId !== null && candidate.brandId === base.brandId;
  // A sibling shares a parent without being the same shelf. Both parents have
  // to exist: two top-level categories are not siblings of each other, they are
  // simply unrelated.
  const sibling =
    !sameCategory &&
    base.categoryParentId !== null &&
    candidate.categoryParentId === base.categoryParentId;

  if (sameCategory) {
    return sameBrand
      ? SIMILAR_TIER.SAME_CATEGORY_AND_BRAND
      : SIMILAR_TIER.SAME_CATEGORY;
  }
  if (sibling) {
    return sameBrand
      ? SIMILAR_TIER.SIBLING_CATEGORY_AND_BRAND
      : SIMILAR_TIER.SIBLING_CATEGORY;
  }
  if (sameBrand) return SIMILAR_TIER.SAME_BRAND;

  return SIMILAR_TIER.NONE;
}

/**
 * How close two prices are, from 1 (identical) down to 0.
 *
 * The tiebreak within a tier, because price is what a shopper is actually
 * holding constant when they ask for something similar — shown a Rs 2,49,900
 * laptop, the useful neighbours are the other Rs 2,49,900 laptops, not the
 * cheapest thing on the shelf. Relative rather than absolute: Rs 5,000 apart
 * means something different at Rs 10,000 than at Rs 5,00,000.
 */
export function priceProximity(baseCents: number, candidateCents: number): number {
  // A free or zero-priced product has no scale to measure distance against, so
  // proximity says nothing and every candidate ties — the tier still orders them.
  if (baseCents <= 0) return 0;
  const distance = Math.abs(candidateCents - baseCents) / baseCents;
  return Math.max(0, 1 - Math.min(1, distance));
}

/**
 * Rank candidates and keep the best `limit`.
 *
 * Sorted by tier, then price proximity, then slug — the last purely so a page
 * that renders twice renders the same shelf twice. Without it, two products
 * that tie on both keys would come back in whatever order Postgres happened to
 * return them, and the section would reshuffle between visits for no reason a
 * shopper could see.
 */
export function rankSimilar<T extends SimilarCandidate>(
  base: SimilarSubject,
  candidates: T[],
  limit: number = SIMILAR_LIMIT,
): T[] {
  return candidates
    .map((candidate) => ({
      candidate,
      tier: similarityTier(base, candidate),
      proximity: priceProximity(base.priceCents, candidate.priceCents),
    }))
    .filter((scored) => scored.tier !== SIMILAR_TIER.NONE)
    .sort(
      (a, b) =>
        b.tier - a.tier ||
        b.proximity - a.proximity ||
        a.candidate.slug.localeCompare(b.candidate.slug),
    )
    .slice(0, limit)
    .map((scored) => scored.candidate);
}
