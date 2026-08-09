import { prisma } from "@/lib/prisma";
import {
  MAX_QUERY_LENGTH,
  fuzzyMatch,
  normalize,
  tokenize,
  type ProductSuggestion,
} from "@/lib/products/search-text";

/**
 * Catalogue search with typo tolerance.
 *
 * Two passes, cheapest first:
 *
 *  1. **Substring** — one Prisma query that requires every token to appear in
 *     the name, brand or category. This covers the common case (real prefixes,
 *     whole words) and lets Postgres do the work.
 *
 *     Description is deliberately *not* a match surface. An unanchored
 *     substring against prose is far too loose: "mac" hit four unrelated
 *     products through the word "machined", which is not what anyone typing
 *     three letters into a product search is asking for.
 *  2. **Fuzzy** — only when pass 1 comes up short. Pulls a bounded index of
 *     published products and scores each one by edit distance, so "kaybord"
 *     still reaches "Keyboard".
 *
 * Pass 2 scans in memory rather than in the database because neither
 * `pg_trgm` nor a tsvector column is part of the schema. That is fine at this
 * catalogue's size — see SCAN_LIMIT — and the seam is here if it ever needs to
 * move into Postgres.
 */

/**
 * Upper bound on how many products the fuzzy pass will pull into memory.
 * Rows are tiny (no description), so this is well under a megabyte; raise it
 * only alongside a real full-text index.
 */
const SCAN_LIMIT = 500;

const LIST_SELECT = {
  id: true,
  slug: true,
  name: true,
  image: true,
  priceCents: true,
  stock: true,
  category: { select: { name: true } },
  brand: { select: { name: true } },
} as const;

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  priceCents: number;
  stock: number;
  category: { name: string } | null;
  brand: { name: string } | null;
};

/**
 * Relevance weights. The ordering between them is the part that matters: an
 * exact name beats a prefix, a prefix beats a substring, and any literal match
 * beats a fuzzy one, so a real match is never buried under a guess.
 */
const SCORE = {
  phraseExact: 1000,
  phrasePrefix: 600,
  phraseContains: 300,
  phraseCategory: 150,

  nameWordExact: 500,
  nameWordPrefix: 400,
  nameContains: 300,
  categoryWordExact: 220,
  categoryContains: 180,

  fuzzyNameBase: 260,
  fuzzyCategoryBase: 140,
  fuzzyPenalty: 80,
  /** Reaching the whole word, not just a prefix of it, is the better match. */
  fuzzyWholeWord: 40,
} as const;

/** Score one token against a product's name and category. 0 means no match. */
function scoreToken(
  token: string,
  name: string,
  nameWords: string[],
  category: string,
  categoryWords: string[],
): number {
  if (nameWords.includes(token)) return SCORE.nameWordExact;
  if (nameWords.some((word) => word.startsWith(token))) return SCORE.nameWordPrefix;
  if (name.includes(token)) return SCORE.nameContains;
  if (categoryWords.includes(token)) return SCORE.categoryWordExact;
  if (category.includes(token)) return SCORE.categoryContains;

  let best = 0;

  const fuzzy = (words: string[], base: number) => {
    for (const word of words) {
      const match = fuzzyMatch(token, word);
      if (!match) continue;
      const score =
        base -
        match.distance * SCORE.fuzzyPenalty +
        (match.whole ? SCORE.fuzzyWholeWord : 0);
      if (score > best) best = score;
    }
  };

  fuzzy(nameWords, SCORE.fuzzyNameBase);
  fuzzy(categoryWords, SCORE.fuzzyCategoryBase);

  return Math.max(best, 0);
}

/**
 * Total relevance for a product, or `null` when it should not appear at all.
 *
 * Tokens are AND-ed: searching "wireless keyboard" must not surface every
 * keyboard. Every token must land on the name, brand or category — description
 * is deliberately not a match surface, see `rankProducts`.
 */
function scoreProduct(
  product: ProductRow,
  tokens: string[],
  phrase: string,
): number | null {
  const name = normalize(product.name);
  const nameWords = tokenize(product.name);

  // Brand and category share the secondary tier: "asus workstation" should
  // match on both halves, and neither should outrank the product name.
  const facetSource = [product.brand?.name, product.category?.name]
    .filter(Boolean)
    .join(" ");
  const category = normalize(facetSource);
  const categoryWords = tokenize(facetSource);

  let total = 0;

  for (const token of tokens) {
    const score = scoreToken(token, name, nameWords, category, categoryWords);
    if (score === 0) return null;
    total += score;
  }

  // Whole-phrase bonuses, so "desk lamp" ranks the product actually called
  // "Desk Lamp" above one that merely mentions both words.
  if (name === phrase) total += SCORE.phraseExact;
  else if (name.startsWith(phrase)) total += SCORE.phrasePrefix;
  else if (name.includes(phrase)) total += SCORE.phraseContains;
  else if (category && category.includes(phrase)) total += SCORE.phraseCategory;

  return total;
}

/**
 * Rank every published product against `rawQuery`, best first.
 *
 * `wanted` is how many results the caller intends to show; the fuzzy pass only
 * runs when the literal pass falls short of it.
 */
async function rankProducts(rawQuery: string, wanted: number): Promise<ProductRow[]> {
  const phrase = normalize(rawQuery.slice(0, MAX_QUERY_LENGTH));
  const tokens = tokenize(phrase);
  if (tokens.length === 0) return [];

  // Pass 1 — every token must appear somewhere, matched literally.
  const substringMatches = await prisma.product.findMany({
    where: {
      published: true,
      AND: tokens.map((token) => ({
        OR: [
          { name: { contains: token, mode: "insensitive" as const } },
          { category: { name: { contains: token, mode: "insensitive" as const } } },
          { brand: { name: { contains: token, mode: "insensitive" as const } } },
        ],
      })),
    },
    orderBy: { createdAt: "desc" },
    take: SCAN_LIMIT,
    select: LIST_SELECT,
  });

  const literalIds = new Set(substringMatches.map((product) => product.id));
  const pool: ProductRow[] = [...substringMatches];

  // Pass 2 — only pay for the fuzzy scan when the literal pass was thin.
  if (pool.length < wanted) {
    const candidates = await prisma.product.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
      take: SCAN_LIMIT,
      select: LIST_SELECT,
    });

    for (const candidate of candidates) {
      if (!literalIds.has(candidate.id)) pool.push(candidate);
    }
  }

  const ranked: Array<{ product: ProductRow; score: number }> = [];

  for (const product of pool) {
    const score = scoreProduct(product, tokens, phrase);
    if (score !== null) ranked.push({ product, score });
  }

  // Name breaks ties so the order is stable between identical requests.
  ranked.sort(
    (a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name),
  );

  return ranked.map((entry) => entry.product);
}

/** Top matches for the search-bar dropdown. */
export async function searchProductSuggestions(
  rawQuery: string,
  limit = 6,
): Promise<ProductSuggestion[]> {
  const take = Math.min(Math.max(Math.trunc(limit) || 6, 1), 10);
  const ranked = await rankProducts(rawQuery, take);

  return ranked.slice(0, take).map((product) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    image: product.image,
    priceCents: product.priceCents,
    stock: product.stock,
    categoryName: product.category?.name ?? null,
  }));
}

/**
 * Relevance-ordered ids for the catalogue page, which still has to apply its
 * own price/stock/category filters and sorting on top.
 *
 * An empty array is a real answer — "nothing matched" — so callers should only
 * call this when there is a query to run.
 */
export async function searchProductIds(rawQuery: string): Promise<string[]> {
  const ranked = await rankProducts(rawQuery, SCAN_LIMIT);
  return ranked.map((product) => product.id);
}
