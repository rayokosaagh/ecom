import {
  SIMILAR_TIER,
  priceProximity,
  rankSimilar,
  similarityTier,
  type SimilarCandidate,
  type SimilarSubject,
} from "../src/lib/products/similar-rank";

/**
 * Checks for the "similar products" ranking.
 *
 * The shelf under a product page is a recommendation, and a bad one is worse
 * than none — it fills the bottom of the page with things that have nothing to
 * do with what is being looked at. What is defended here is that the tiers rank
 * the way they are documented to, that absence is never treated as a shared
 * value, and that the order is stable between two renders of the same page.
 *
 *   npm run check:similar
 */

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ok    ${label}`);
    return;
  }
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
}

const LAPTOPS = "cat-laptops";
const ULTRABOOKS = "cat-ultrabooks";
const AUDIO = "cat-audio";
const COMPUTERS = "parent-computers";

const ASUS = "brand-asus";
const DELL = "brand-dell";

/** The product being looked at: an ASUS ultrabook at Rs 2,49,900. */
const BASE: SimilarSubject = {
  id: "base",
  categoryId: ULTRABOOKS,
  categoryParentId: COMPUTERS,
  brandId: ASUS,
  priceCents: 24990000,
};

function candidate(
  id: string,
  over: Partial<SimilarCandidate> = {},
): SimilarCandidate {
  return {
    id,
    slug: id,
    categoryId: ULTRABOOKS,
    categoryParentId: COMPUTERS,
    brandId: DELL,
    priceCents: 24990000,
    ...over,
  };
}

console.log("\nThe tiers rank the way they are documented");

check(
  "same category and brand is the strongest",
  similarityTier(BASE, candidate("a", { brandId: ASUS })) ===
    SIMILAR_TIER.SAME_CATEGORY_AND_BRAND,
);
check(
  "same category alone comes next",
  similarityTier(BASE, candidate("b")) === SIMILAR_TIER.SAME_CATEGORY,
);
check(
  "a sibling category with the same brand is below both",
  similarityTier(
    BASE,
    candidate("c", { categoryId: LAPTOPS, brandId: ASUS }),
  ) === SIMILAR_TIER.SIBLING_CATEGORY_AND_BRAND,
);
check(
  "a sibling category alone is below that",
  similarityTier(BASE, candidate("d", { categoryId: LAPTOPS })) ===
    SIMILAR_TIER.SIBLING_CATEGORY,
);
check(
  "the same brand on an unrelated shelf is weakest",
  similarityTier(
    BASE,
    candidate("e", {
      categoryId: AUDIO,
      categoryParentId: "parent-sound",
      brandId: ASUS,
    }),
  ) === SIMILAR_TIER.SAME_BRAND,
);
check(
  "sharing nothing is not similar at all",
  similarityTier(
    BASE,
    candidate("f", {
      categoryId: AUDIO,
      categoryParentId: "parent-sound",
      brandId: DELL,
    }),
  ) === SIMILAR_TIER.NONE,
);

// The whole reason the tiers are compared before the tiebreak: no reading of
// "similar" puts a same-priced product from another department above a dearer
// one from this shelf.
const shelfBeatsPrice = rankSimilar(
  BASE,
  [
    candidate("audio-exact", {
      categoryId: AUDIO,
      categoryParentId: "parent-sound",
      brandId: ASUS,
      priceCents: 24990000,
    }),
    candidate("shelf-dearer", { priceCents: 41000000 }),
  ],
  2,
);
check(
  "a dearer product on the same shelf outranks an identically priced one off it",
  shelfBeatsPrice[0]?.slug === "shelf-dearer",
  shelfBeatsPrice.map((p) => p.slug).join(" > "),
);

console.log("\nThe product itself is never similar to itself");

check(
  "the base product is refused",
  similarityTier(BASE, {
    ...BASE,
    slug: "base",
  }) === SIMILAR_TIER.NONE,
);
check(
  "and is dropped from a ranking it appears in",
  rankSimilar(BASE, [{ ...BASE, slug: "base" }, candidate("other")], 4).every(
    (p) => p.id !== BASE.id,
  ),
);

console.log("\nAbsence is not a shared value");

// Two uncategorised products are not "in the same category", and two brandless
// ones share no maker. Treating null as a value is how a shelf fills up with
// things that have nothing to do with each other.
const NO_CATEGORY: SimilarSubject = {
  id: "base2",
  categoryId: null,
  categoryParentId: null,
  brandId: null,
  priceCents: 1000,
};
check(
  "two uncategorised, brandless products are not similar",
  similarityTier(
    NO_CATEGORY,
    candidate("g", {
      categoryId: null,
      categoryParentId: null,
      brandId: null,
      priceCents: 1000,
    }),
  ) === SIMILAR_TIER.NONE,
);
check(
  "a null brand does not match another null brand",
  similarityTier(
    { ...BASE, brandId: null },
    candidate("h", { categoryId: AUDIO, categoryParentId: "p", brandId: null }),
  ) === SIMILAR_TIER.NONE,
);
check(
  "two top-level categories are not siblings of each other",
  similarityTier(
    { ...BASE, categoryId: LAPTOPS, categoryParentId: null },
    candidate("i", { categoryId: AUDIO, categoryParentId: null, brandId: DELL }),
  ) === SIMILAR_TIER.NONE,
);

console.log("\nPrice breaks ties within a tier");

check("an identical price is 1", priceProximity(1000, 1000) === 1);
check("double the price is 0", priceProximity(1000, 2000) === 0);
check("more than double does not go negative", priceProximity(1000, 9999) === 0);
check("half the price is 0.5", priceProximity(1000, 500) === 0.5);
check(
  "distance is relative, not absolute — the same gap counts for less on a dearer product",
  priceProximity(100000, 105000) > priceProximity(10000, 15000),
);
check("a zero-priced product has no scale, so nothing is close to it", priceProximity(0, 500) === 0);

const byPrice = rankSimilar(
  BASE,
  [
    candidate("far", { priceCents: 49980000 }),
    candidate("near", { priceCents: 25990000 }),
    candidate("mid", { priceCents: 33000000 }),
  ],
  3,
);
check(
  "within one tier the closest price leads",
  byPrice.map((p) => p.slug).join(",") === "near,mid,far",
  byPrice.map((p) => p.slug).join(","),
);

console.log("\nThe shelf is bounded and stable");

check(
  "no more than the limit comes back",
  rankSimilar(
    BASE,
    Array.from({ length: 20 }, (_, i) => candidate(`p${i}`)),
    4,
  ).length === 4,
);
check(
  "an empty catalogue produces an empty shelf rather than an error",
  rankSimilar(BASE, [], 4).length === 0,
);

// Two products tying on both keys must not swap places between renders, or the
// section reshuffles for no reason a shopper could see.
const tied = [
  candidate("zebra"),
  candidate("apple"),
  candidate("mango"),
];
const first = rankSimilar(BASE, tied, 3).map((p) => p.slug).join(",");
const second = rankSimilar(BASE, [...tied].reverse(), 3).map((p) => p.slug).join(",");
check(
  "a full tie is broken by slug, so two renders agree",
  first === second && first === "apple,mango,zebra",
  `${first} vs ${second}`,
);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
