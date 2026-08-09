import { prisma } from "@/lib/prisma";
import {
  SIMILAR_LIMIT,
  rankSimilar,
  type SimilarSubject,
} from "@/lib/products/similar-rank";
import type { ProductCardData } from "@/components/products/ProductCard";

/**
 * "More like this" for a product page.
 *
 * Only the fetching lives here; what counts as similar is `./similar-rank`,
 * which is free of any database import so the rule can be exercised directly.
 * Same split as `./search` and `./search-text`, and for the same reason.
 */

/**
 * How many rows are considered before ranking.
 *
 * The `where` below already narrows to the same category, a sibling category or
 * the same brand, so this is a backstop against a pathologically large category
 * rather than a real filter — the same bounded-slice-then-rank-in-memory shape
 * `lib/sales/service` uses, and for the same reason: the ordering wanted here
 * is a comparison Postgres will not sort on without an index this schema does
 * not carry.
 */
const CANDIDATE_LIMIT = 60;

const CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  image: true,
  priceCents: true,
  compareAtPriceCents: true,
  stock: true,
  published: true,
  categoryId: true,
  brandId: true,
  colors: { orderBy: { sortOrder: "asc" as const }, select: { name: true, hex: true } },
  category: { select: { name: true, parentId: true } },
  // `slug` so the card's mark links through to the brand's listing.
  brand: { select: { name: true, slug: true, iconSvg: true, logo: true, logoTreatment: true } },
  variants: {
    select: { priceCents: true, compareAtPriceCents: true, stock: true },
  },
} as const;

export type SimilarProduct = ProductCardData & { categoryId: string | null };

/**
 * Products to put under this one.
 *
 * Drafts are excluded even for an admin previewing a draft: this shelf is a
 * suggestion to buy something, and pointing at a page nobody else can reach is
 * not a useful suggestion. Returns an empty list when the product has neither a
 * category nor a brand, because then there is nothing to be similar *to* — the
 * section renders nothing rather than showing four arbitrary products.
 */
export async function getSimilarProducts(
  product: {
    id: string;
    categoryId: string | null;
    brandId: string | null;
    priceCents: number;
  },
  limit: number = SIMILAR_LIMIT,
): Promise<SimilarProduct[]> {
  if (!product.categoryId && !product.brandId) return [];

  // The parent is read separately rather than joined onto the product page's
  // own query: this is the only thing that needs it, and threading it through
  // `getProduct` would make every other caller pay for it.
  const category = product.categoryId
    ? await prisma.category.findUnique({
        where: { id: product.categoryId },
        select: { parentId: true },
      })
    : null;

  const base: SimilarSubject = {
    id: product.id,
    categoryId: product.categoryId,
    categoryParentId: category?.parentId ?? null,
    brandId: product.brandId,
    priceCents: product.priceCents,
  };

  // Only clauses with a value to match. `{ categoryId: null }` would read as
  // "every uncategorised product", which is the opposite of narrowing.
  const or = [
    ...(base.categoryId ? [{ categoryId: base.categoryId }] : []),
    ...(base.categoryParentId
      ? [{ category: { parentId: base.categoryParentId } }]
      : []),
    ...(base.brandId ? [{ brandId: base.brandId }] : []),
  ];

  const rows = await prisma.product.findMany({
    where: { published: true, id: { not: product.id }, OR: or },
    // Newest first only decides which rows survive the cap; `rankSimilar`
    // decides which of those are actually shown.
    orderBy: { createdAt: "desc" },
    take: CANDIDATE_LIMIT,
    select: CARD_SELECT,
  });

  const candidates = rows.map((row) => ({
    ...row,
    categoryParentId: row.category?.parentId ?? null,
  }));

  return rankSimilar(base, candidates, limit);
}
