"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";
import { parseProduct, type ProductInput } from "@/lib/products/validation";
import { planVariantSync, type VariantRow } from "@/lib/products/variant-sync";
import { syncProductPriceFromVariants } from "@/lib/products/price-sync";
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
): Promise<VariantRow[]> {
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
    id: variant.id,
    sku: variant.sku,
    priceCents: variant.priceCents,
    compareAtPriceCents: variant.compareAtPriceCents,
    stock: variant.stock,
    sortOrder: index,
    options: variant.values.map((value, axisIndex) => ({
      definitionId: definitionIds[axisIndex]!,
      value: value.value,
      valueKey: value.valueKey,
    })),
  }));
}

/** The nested-create shape for a variant that does not exist yet. */
function variantCreate(row: VariantRow) {
  return {
    sku: row.sku,
    priceCents: row.priceCents,
    compareAtPriceCents: row.compareAtPriceCents,
    stock: row.stock,
    sortOrder: row.sortOrder,
    options: { create: row.options },
  };
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
  const created = await prisma.product.create({
    data: {
      ...data,
      createdById: admin.id,
      colors: { create: colorRows(parsed.data.colors) },
      specs: { create: await specRows(parsed.data.specs) },
      variants: {
        create: (await variantRows(parsed.data.variantAxes, parsed.data.variants)).map(
          variantCreate,
        ),
      },
    },
    select: { id: true },
  });
  // A configurable product's own price is its cheapest configuration's,
  // whatever was typed in the product-level field — see price-sync.
  await syncProductPriceFromVariants(created.id);

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

  // Price, regular price and stock are deliberately not written here. Each is
  // changed from Inventory, which checks the figure against the live one and
  // records the change; a value from this form would be whatever the page
  // rendered, written over whatever has sold or been repriced since, and
  // would appear in no ledger. New variants are the one exception — see below
  // — because nothing has sold from them yet.
  const {
    stock: _stock,
    priceCents: _priceCents,
    compareAtPriceCents: _compareAtPriceCents,
    ...data
  } = await resolveProductData(parsed.data);
  void _stock;
  void _priceCents;
  void _compareAtPriceCents;

  // Definitions are resolved before the transaction opens: creating a missing
  // spec label is a write of its own, and doing it inside would hold the
  // product's rows for the length of that round trip.
  const nextSpecs = await specRows(parsed.data.specs);
  const nextVariants = await variantRows(
    parsed.data.variantAxes,
    parsed.data.variants,
  );

  // Variants are diffed, not replaced — see lib/products/variant-sync for
  // why. Only this product's rows are candidates, so an id from a stale or
  // tampered form cannot reach into another product's variants.
  const existingVariants = await prisma.productVariant.findMany({
    where: { productId: id },
    select: { id: true, options: { select: { definitionId: true, valueKey: true } } },
  });
  const { updated, created, removed } = planVariantSync(existingVariants, nextVariants);

  // Colourways and specs are replaced wholesale rather than diffed: the form
  // submits the complete list, and one transaction keeps a half-updated set
  // from ever being read. Cart and order lines snapshot their own name and
  // hex, so dropping rows here cannot disturb them.
  await prisma.$transaction([
    prisma.productColor.deleteMany({ where: { productId: id } }),
    prisma.productSpec.deleteMany({ where: { productId: id } }),
    // Configurations no longer sold. Cart lines naming one re-price from the
    // variant they name and show as unavailable when it is gone — see
    // lib/cart/service.
    ...(removed.length > 0
      ? [prisma.productVariant.deleteMany({ where: { id: { in: removed } } })]
      : []),
    // SKUs are unique across the shop, and two rows swapping theirs would
    // collide mid-way through the updates below. Cleared first, within the
    // same transaction, so no reader ever sees the gap.
    ...(updated.length > 0
      ? [
          prisma.productVariant.updateMany({
            where: { id: { in: updated.map((entry) => entry.id) } },
            data: { sku: null },
          }),
        ]
      : []),
    ...updated.flatMap(({ id: variantId, row }) => [
      // Options are replaced as a set: the unique on (variant, definition)
      // means a create before the delete would collide, and a nested write
      // does not promise the order.
      prisma.productVariantOption.deleteMany({ where: { variantId } }),
      prisma.productVariant.update({
        where: { id: variantId },
        data: {
          sku: row.sku,
          sortOrder: row.sortOrder,
          // Not price, "was" price or stock: see the note on `data` above.
          options: { create: row.options },
        },
      }),
    ]),
    prisma.product.update({
      where: { id },
      data: {
        ...data,
        colors: { create: colorRows(parsed.data.colors) },
        specs: { create: nextSpecs },
        // New configurations carry the initial stock typed for them — there
        // is no live level yet for a number to conflict with.
        variants: { create: created.map(variantCreate) },
      },
    }),
  ]);

  // Variants may have been added or removed; the product's own price follows
  // the cheapest one that remains. (Their prices themselves are not written
  // here — see the note on `data` above.)
  await syncProductPriceFromVariants(id);

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
