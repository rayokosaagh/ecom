"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";
import { parseBrand } from "@/lib/brands/validation";

export type BrandFormState = {
  errors?: Record<string, string>;
  message?: string;
};

const LIST_PATH = "/admin/brands";

/**
 * Refresh every surface a brand mark appears on.
 *
 * Brand icons ride along with products, so this is deliberately broad: the
 * home page, the catalogue and its facet rail, and every product detail page
 * carrying the brand.
 */
function revalidateBrandViews(productSlugs: string[] = []) {
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/dashboard/products");
  revalidatePath(LIST_PATH);
  for (const slug of productSlugs) revalidatePath(`/products/${slug}`);
}

/** Slugs of every product carrying this brand, for targeted revalidation. */
async function productSlugsForBrand(brandId: string): Promise<string[]> {
  const products = await prisma.product.findMany({
    where: { brandId },
    select: { slug: true },
  });
  return products.map((product) => product.slug);
}

export async function createBrand(
  _prev: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  // Every mutation re-checks the role against the database, not the JWT.
  await requireAdmin();

  const parsed = parseBrand(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  // Name and slug are both unique. Checked up front so the admin gets a field
  // error rather than an unhandled constraint violation.
  const clash = await prisma.brand.findFirst({
    where: { OR: [{ slug: parsed.data.slug }, { name: parsed.data.name }] },
    select: { slug: true },
  });
  if (clash) {
    return {
      errors:
        clash.slug === parsed.data.slug
          ? { slug: "A brand with this slug already exists" }
          : { name: "A brand with this name already exists" },
    };
  }

  await prisma.brand.create({ data: parsed.data });

  revalidateBrandViews();
  redirect(LIST_PATH);
}

export async function updateBrand(
  id: string,
  _prev: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  await requireAdmin();

  const parsed = parseBrand(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const current = await prisma.brand.findUnique({ where: { id }, select: { id: true } });
  if (!current) return { message: "That brand no longer exists." };

  const clash = await prisma.brand.findFirst({
    where: {
      id: { not: id },
      OR: [{ slug: parsed.data.slug }, { name: parsed.data.name }],
    },
    select: { slug: true },
  });
  if (clash) {
    return {
      errors:
        clash.slug === parsed.data.slug
          ? { slug: "A brand with this slug already exists" }
          : { name: "A brand with this name already exists" },
    };
  }

  await prisma.brand.update({ where: { id }, data: parsed.data });

  revalidateBrandViews(await productSlugsForBrand(id));
  redirect(LIST_PATH);
}

/**
 * Delete a brand.
 *
 * Products keep existing — `Product.brandId` is `onDelete: SetNull`, so they
 * simply become unbranded rather than disappearing with the maker.
 */
export async function deleteBrand(id: string): Promise<void> {
  await requireAdmin();
  if (!id) return;

  // Collected before the delete, while the relation still resolves.
  const slugs = await productSlugsForBrand(id);

  // Tolerate an already-deleted row: two admins on the same list should not
  // produce an unhandled error for whoever clicks second.
  await prisma.brand.deleteMany({ where: { id } });

  revalidateBrandViews(slugs);
}

/** Remove just the mark, keeping the brand. Offered from the list. */
export async function clearBrandIcon(id: string): Promise<void> {
  await requireAdmin();
  if (!id) return;

  const brand = await prisma.brand.findUnique({ where: { id }, select: { id: true } });
  if (!brand) return;

  await prisma.brand.update({ where: { id }, data: { iconSvg: null } });

  revalidateBrandViews(await productSlugsForBrand(id));
}
