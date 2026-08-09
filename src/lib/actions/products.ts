"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";
import { parseProduct, type ProductInput } from "@/lib/products/validation";
import { upsertBrandByName, upsertCategoryByName } from "@/lib/categories/resolve";
import {
  canonicalizeSpecValues,
  resolveSpecDefinitions,
} from "@/lib/specs/resolve";

export type ProductFormState = {
  errors?: Record<string, string>;
  message?: string;
};

/**
 * Turn parsed form data into Prisma-ready product data, creating the category
 * and brand on the fly when the form asked for them. Both reuse an existing
 * row with the same slug rather than erroring — "Audio" and "audio" are the
 * same shelf, and "ASUS" and "Asus" are the same maker.
 */
async function resolveProductData(input: ProductInput) {
  // `colors` and `specs` are relations, so they are written separately by the
  // callers.
  const {
    newCategoryName,
    newCategoryParentId,
    newBrandName,
    colors,
    specs,
    variantAxes,
    variants,
    ...data
  } = input;
  void colors;
  void specs;
  void variantAxes;
  void variants;

  if (newCategoryName) {
    const category = await upsertCategoryByName(newCategoryName, newCategoryParentId);
    if (category) data.categoryId = category.id;
  }

  if (newBrandName) {
    const brand = await upsertBrandByName(newBrandName);
    if (brand) data.brandId = brand.id;
  }

  return data;
}

/** Colourway rows in the order the admin arranged them. */
function colorRows(colors: ProductInput["colors"]) {
  return colors.map((color, index) => ({ ...color, sortOrder: index }));
}

/**
 * Spec rows, with each label resolved to a definition.
 *
 * Labels the catalogue has not seen before are created here, so an editor can
 * introduce "Switch type" from the product form rather than declaring it
 * somewhere else first — the same create-or-reuse route categories and brands
 * already take.
 *
 * Note there is no `sortOrder`: specs are ordered by their *definition*, so
 * every product lists RAM above Weight whatever order they were typed in.
 */
async function specRows(specs: ProductInput["specs"]) {
  if (specs.length === 0) return [];

  const definitions = await resolveSpecDefinitions(specs);

  const rows = specs.flatMap((spec) => {
    const definitionId = definitions.get(spec.labelKey);
    // A definition that failed to resolve would mean the label normalized to
    // nothing, which `parseSpecs` already rejects — skip rather than throw.
    return definitionId
      ? [{ definitionId, value: spec.value, valueKey: spec.valueKey }]
      : [];
  });

  return canonicalizeSpecValues(rows);
}

/**
 * Variant rows, with each axis label resolved to a spec definition.
 *
 * Axes go through the same create-or-reuse route fixed specs do, so "RAM" is
 * one label whether it varies on this product or is fixed on the next — which
 * is what lets a shopper filtering by RAM match both.
 */
async function variantRows(
  axes: ProductInput["variantAxes"],
  variants: ProductInput["variants"],
) {
  if (axes.length === 0 || variants.length === 0) return [];

  const definitions = await resolveSpecDefinitions(
    axes.map((axis) => ({
      label: axis.label,
      labelKey: axis.labelKey,
      value: "",
      valueKey: "",
    })),
  );

  const definitionIds = axes.map((axis) => definitions.get(axis.labelKey));
  if (definitionIds.some((id) => !id)) return [];

  return variants.map((variant, index) => ({
    sku: variant.sku,
    priceCents: variant.priceCents,
    compareAtPriceCents: variant.compareAtPriceCents,
    stock: variant.stock,
    sortOrder: index,
    options: {
      create: variant.values.map((value, axisIndex) => ({
        definitionId: definitionIds[axisIndex]!,
        value: value.value,
        valueKey: value.valueKey,
      })),
    },
  }));
}

/** Refresh every surface that renders products. */
function revalidateProductViews(slug?: string) {
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/dashboard/products");
  if (slug) revalidatePath(`/products/${slug}`);
}

export async function createProduct(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  // Every mutation re-checks the role against the database, not the JWT.
  const admin = await requireAdmin();

  const parsed = parseProduct(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const existing = await prisma.product.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true },
  });
  if (existing) {
    return { errors: { slug: "A product with this slug already exists" } };
  }

  const data = await resolveProductData(parsed.data);
  await prisma.product.create({
    data: {
      ...data,
      createdById: admin.id,
      colors: { create: colorRows(parsed.data.colors) },
      specs: { create: await specRows(parsed.data.specs) },
      variants: {
        create: await variantRows(parsed.data.variantAxes, parsed.data.variants),
      },
    },
  });

  revalidateProductViews(parsed.data.slug);
  redirect("/dashboard/products");
}

export async function updateProduct(
  id: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireAdmin();

  const parsed = parseProduct(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const current = await prisma.product.findUnique({
    where: { id },
    select: { slug: true },
  });
  if (!current) return { message: "That product no longer exists." };

  // Slug is unique, so guard against colliding with a different product.
  const clash = await prisma.product.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true },
  });
  if (clash && clash.id !== id) {
    return { errors: { slug: "A product with this slug already exists" } };
  }

  const data = await resolveProductData(parsed.data);

  // Definitions are resolved before the transaction opens: creating a missing
  // spec label is a write of its own, and doing it inside would hold the
  // product's rows for the length of that round trip.
  const nextSpecs = await specRows(parsed.data.specs);
  const nextVariants = await variantRows(
    parsed.data.variantAxes,
    parsed.data.variants,
  );

  // Colourways and specs are replaced wholesale rather than diffed: the form
  // submits the complete list, and one transaction keeps a half-updated set
  // from ever being read. Cart and order lines snapshot their own name and
  // hex, so dropping rows here cannot disturb them.
  // Variants are replaced wholesale like the other child rows. Cart lines
  // snapshot their own label and are re-priced from the variant they name, so
  // a line whose configuration is deleted shows as unavailable rather than
  // silently repricing — see lib/cart/service.
  await prisma.$transaction([
    prisma.productColor.deleteMany({ where: { productId: id } }),
    prisma.productSpec.deleteMany({ where: { productId: id } }),
    prisma.productVariant.deleteMany({ where: { productId: id } }),
    prisma.product.update({
      where: { id },
      data: {
        ...data,
        colors: { create: colorRows(parsed.data.colors) },
        specs: { create: nextSpecs },
        variants: { create: nextVariants },
      },
    }),
  ]);

  revalidateProductViews(parsed.data.slug);
  if (current.slug !== parsed.data.slug) revalidatePath(`/products/${current.slug}`);

  redirect("/dashboard/products");
}

export async function deleteProduct(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const product = await prisma.product.findUnique({
    where: { id },
    select: { slug: true },
  });
  if (!product) return;

  await prisma.product.delete({ where: { id } });
  revalidateProductViews(product.slug);
  redirect("/dashboard/products");
}

/** Quick publish/unpublish from the admin list without opening the form. */
export async function toggleProductPublished(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const product = await prisma.product.findUnique({
    where: { id },
    select: { published: true, slug: true },
  });
  if (!product) return;

  await prisma.product.update({
    where: { id },
    data: { published: !product.published },
  });

  revalidateProductViews(product.slug);
}
