"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";

export type FeaturedActionState = { message?: string };

const LIST_PATH = "/admin/featured";

/** The showcase is on the home page; the admin list is what edits it. */
function revalidateFeaturedViews() {
  revalidatePath("/");
  revalidatePath(LIST_PATH);
}

export async function addFeaturedProduct(
  _prev: FeaturedActionState,
  formData: FormData,
): Promise<FeaturedActionState> {
  // Every mutation re-checks the role against the database, not the JWT.
  await requireAdmin();

  const productId = String(formData.get("productId") ?? "").trim();
  if (!productId) return { message: "Choose a product first." };

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, featured: { select: { id: true } } },
  });
  if (!product) return { message: "That product no longer exists." };
  if (product.featured) return { message: "That product is already featured." };

  // New entries go to the end, so an unranked addition never jumps ahead of
  // one that was placed deliberately.
  const last = await prisma.featuredProduct.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.featuredProduct.create({
    data: { productId, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });

  revalidateFeaturedViews();
  return {};
}

export async function removeFeaturedProduct(id: string): Promise<void> {
  await requireAdmin();
  if (!id) return;

  // Tolerate an already-removed row: two admins on the same list should not
  // produce an unhandled error for whoever clicks second.
  await prisma.featuredProduct.deleteMany({ where: { id } });

  revalidateFeaturedViews();
}

/**
 * Persist a new display order.
 *
 * Takes the full list of ids in their new order and rewrites `sortOrder` to
 * match the array index, in one transaction so the storefront can never read a
 * half-applied ordering. Ids that no longer exist are skipped rather than
 * failing the batch — the same rule the banner list follows.
 */
export async function reorderFeaturedProducts(ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;

  const known = await prisma.featuredProduct.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const knownIds = new Set(known.map((row) => row.id));

  await prisma.$transaction(
    ids
      .filter((id) => knownIds.has(id))
      .map((id, index) =>
        prisma.featuredProduct.update({ where: { id }, data: { sortOrder: index } }),
      ),
  );

  revalidateFeaturedViews();
}
