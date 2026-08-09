"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";
import { NEW_CATEGORY_LINK_VALUE, parseBanner } from "@/lib/banners/validation";
import { upsertCategoryByName } from "@/lib/categories/resolve";
import { slugify } from "@/lib/products/validation";

export type BannerFormState = {
  errors?: Record<string, string>;
  message?: string;
};

const LIST_PATH = "/admin/banners";

/**
 * Refresh every surface a banner appears on.
 *
 * The storefront reads banners per request, so this is belt-and-braces rather
 * than load-bearing — but it also covers the admin list, which is what the
 * redirect lands on.
 */
function revalidateBannerViews() {
  revalidatePath("/");
  revalidatePath(LIST_PATH);
}

type PendingCategory = { name: string; parentId: string | null };

type LinkResolution =
  | { ok: true; ctaLink?: string; pendingCategory: PendingCategory | null }
  | { ok: false; errors: Record<string, string> };

/**
 * Work out the CTA destination before anything is written.
 *
 * When the banner is creating a category, its link depends on that category's
 * slug — so the slug is derived up front with the same `slugify` the create
 * path uses, and the category itself is only written once the whole form has
 * validated. A rejected save therefore leaves no orphan category behind.
 */
function resolveLink(formData: FormData): LinkResolution {
  const mode = String(formData.get("ctaLinkMode") ?? "");
  if (mode !== NEW_CATEGORY_LINK_VALUE) {
    return { ok: true, pendingCategory: null };
  }

  const name = String(formData.get("newCategoryName") ?? "").trim();
  if (!name) {
    return { ok: false, errors: { newCategoryName: "Enter a name for the new category" } };
  }
  if (name.length > 60) {
    return {
      ok: false,
      errors: { newCategoryName: "Category name must be 60 characters or fewer" },
    };
  }

  const slug = slugify(name);
  if (!slug) {
    return {
      ok: false,
      errors: { newCategoryName: "Category name needs at least one letter or number" },
    };
  }

  const parentRaw = String(formData.get("newCategoryParent") ?? "").trim();

  return {
    ok: true,
    ctaLink: `/products?category=${slug}`,
    pendingCategory: { name, parentId: parentRaw || null },
  };
}

/**
 * Keep only a category that still exists.
 *
 * One deleted between loading the form and submitting it would otherwise fail
 * the whole save on a foreign key violation; falling back to ungrouped is the
 * harmless reading.
 */
async function resolveGroup(categoryId: string | null): Promise<string | null> {
  if (!categoryId) return null;
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  return category?.id ?? null;
}

/** New banners go to the end of the list. */
async function nextSortOrder(): Promise<number> {
  const last = await prisma.promoBanner.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? -1) + 1;
}

export async function createBanner(
  _prev: BannerFormState,
  formData: FormData,
): Promise<BannerFormState> {
  // Every mutation re-checks the role against the database, not the JWT.
  await requireAdmin();

  const link = resolveLink(formData);
  if (!link.ok) return { errors: link.errors };

  const parsed = parseBanner(formData, link.ctaLink);
  if (!parsed.ok) return { errors: parsed.errors };

  if (link.pendingCategory) {
    await upsertCategoryByName(link.pendingCategory.name, link.pendingCategory.parentId);
  }

  await prisma.promoBanner.create({
    data: {
      ...parsed.data,
      categoryId: await resolveGroup(parsed.data.categoryId),
      sortOrder: await nextSortOrder(),
    },
  });

  revalidateBannerViews();
  redirect(LIST_PATH);
}

export async function updateBanner(
  id: string,
  _prev: BannerFormState,
  formData: FormData,
): Promise<BannerFormState> {
  await requireAdmin();

  const link = resolveLink(formData);
  if (!link.ok) return { errors: link.errors };

  const parsed = parseBanner(formData, link.ctaLink);
  if (!parsed.ok) return { errors: parsed.errors };

  const exists = await prisma.promoBanner.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) return { message: "That banner no longer exists." };

  if (link.pendingCategory) {
    await upsertCategoryByName(link.pendingCategory.name, link.pendingCategory.parentId);
  }

  // sortOrder is owned by the list's drag-and-drop, so it is left alone here.
  await prisma.promoBanner.update({
    where: { id },
    data: { ...parsed.data, categoryId: await resolveGroup(parsed.data.categoryId) },
  });

  revalidateBannerViews();
  redirect(LIST_PATH);
}

export async function deleteBanner(id: string): Promise<void> {
  await requireAdmin();
  if (!id) return;

  // Tolerate an already-deleted row: two admins on the same list should not
  // produce an unhandled error for whoever clicks second.
  await prisma.promoBanner.deleteMany({ where: { id } });

  revalidateBannerViews();
}

/** Flip a banner on or off straight from the list. */
export async function toggleBannerActive(id: string): Promise<void> {
  await requireAdmin();

  const banner = await prisma.promoBanner.findUnique({
    where: { id },
    select: { isActive: true },
  });
  if (!banner) return;

  await prisma.promoBanner.update({
    where: { id },
    data: { isActive: !banner.isActive },
  });

  revalidateBannerViews();
}

/**
 * Persist a new display order.
 *
 * Takes the full list of ids in their new order and rewrites `sortOrder` to
 * match the array index, in one transaction so the storefront can never read a
 * half-applied ordering. Ids that no longer exist are skipped rather than
 * failing the batch.
 */
export async function reorderBanners(ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;

  const known = await prisma.promoBanner.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const knownIds = new Set(known.map((banner) => banner.id));

  await prisma.$transaction(
    ids
      .filter((id) => knownIds.has(id))
      .map((id, index) =>
        prisma.promoBanner.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
  );

  revalidateBannerViews();
}
