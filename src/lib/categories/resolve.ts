import "server-only";

import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/products/validation";

/**
 * Create-or-reuse helpers for the taxonomy.
 *
 * Both forms that can mint a category (product, promo banner) go through here,
 * so "Audio" and "audio" can never become two different shelves. Matching is
 * on slug rather than name for the same reason.
 */

export interface Resolved {
  id: string;
  slug: string;
}

/**
 * Find or create a category by name, optionally beneath a parent.
 *
 * An existing category is reused as-is — it is *not* re-parented. Silently
 * moving a branch because someone typed an existing name into a "new category"
 * box would be a destructive surprise.
 */
export async function upsertCategoryByName(
  name: string,
  parentId: string | null = null,
): Promise<Resolved | null> {
  const trimmed = name.trim();
  const slug = slugify(trimmed);
  if (!slug) return null;

  const existing = await prisma.category.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  });
  if (existing) return existing;

  // The parent must be real; a stale id from a since-deleted category should
  // land the new entry at top level rather than fail the whole save.
  const parent = parentId
    ? await prisma.category.findUnique({ where: { id: parentId }, select: { id: true } })
    : null;

  return prisma.category.create({
    data: { name: trimmed, slug, parentId: parent?.id ?? null },
    select: { id: true, slug: true },
  });
}

/** Find or create a brand by name. Same slug-matching rule as categories. */
export async function upsertBrandByName(name: string): Promise<Resolved | null> {
  const trimmed = name.trim();
  const slug = slugify(trimmed);
  if (!slug) return null;

  const existing = await prisma.brand.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  });
  if (existing) return existing;

  return prisma.brand.create({
    data: { name: trimmed, slug },
    select: { id: true, slug: true },
  });
}
