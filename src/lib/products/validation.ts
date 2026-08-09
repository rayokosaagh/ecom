import type { Validated } from "@/lib/auth/validation";
import { compareAtError } from "@/lib/products/sale";
import { parseColors, type ColorInput } from "@/lib/products/colors";
import { parseSpecs, type SpecInput } from "@/lib/specs/parse";
import {
  parseVariants,
  type VariantAxisInput,
  type VariantInput,
} from "@/lib/products/variant-parse";

/** Sentinel value the category select uses for "create a new one". */
export const NEW_CATEGORY_VALUE = "__new__";

/** Sentinel value the brand select uses for "create a new one". */
export const NEW_BRAND_VALUE = "__new_brand__";

export type ProductInput = {
  name: string;
  slug: string;
  description: string;
  categoryId: string | null;
  /** When set, the action creates (or reuses) a category with this name. */
  newCategoryName: string | null;
  /** Parent for `newCategoryName`, so a new entry can be a subcategory. */
  newCategoryParentId: string | null;
  brandId: string | null;
  /** When set, the action creates (or reuses) a brand with this name. */
  newBrandName: string | null;
  priceCents: number;
  /** What it used to cost. Null means "not on sale" — see lib/products/sale. */
  compareAtPriceCents: number | null;
  stock: number;
  image: string | null;
  gallery: string[];
  colors: ColorInput[];
  specs: SpecInput[];
  variantAxes: VariantAxisInput[];
  variants: VariantInput[];
  published: boolean;
};

/** Lowercase, hyphenated, ASCII-only. Used in product URLs. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Accepts remote http(s) URLs and locally uploaded files, and nothing else —
 * so a `javascript:` or `data:` src can never reach an <img>.
 *
 * Uploaded images are root-relative (`/uploads/…`). The `//` guard matters:
 * `//evil.example/x.png` is protocol-relative and would load off-site.
 */
export function isSafeImageUrl(value: string): boolean {
  if (value.startsWith("/")) {
    // `..` cannot escape anything here (the value is only ever an <img src>),
    // but rejecting it keeps the stored value equal to what it appears to be.
    if (value.includes("..")) return false;
    return value.startsWith("/uploads/") && !value.startsWith("//");
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Splits a textarea of one-value-per-line into a trimmed, de-duplicated list. */
export function parseLines(raw: string): string[] {
  return [...new Set(raw.split(/[\n,]/).map((line) => line.trim()).filter(Boolean))];
}

export function parseProduct(formData: FormData): Validated<ProductInput> {
  const errors: Record<string, string> = {};

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const newCategoryRaw = String(formData.get("newCategory") ?? "").trim();
  const newCategoryParentRaw = String(formData.get("newCategoryParent") ?? "").trim();
  const brandId = String(formData.get("brandId") ?? "").trim();
  const newBrandRaw = String(formData.get("newBrand") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();
  const compareAtRaw = String(formData.get("compareAtPrice") ?? "").trim();
  const stockRaw = String(formData.get("stock") ?? "0").trim();
  const image = String(formData.get("image") ?? "").trim();
  const galleryRaw = String(formData.get("gallery") ?? "");
  const published = formData.get("published") === "on";

  const slugRaw = String(formData.get("slug") ?? "").trim();
  const slug = slugify(slugRaw || name);

  if (!name) errors.name = "Name is required";
  else if (name.length > 120) errors.name = "Name must be 120 characters or fewer";

  if (!slug) errors.slug = "Slug is required (letters and numbers)";

  if (!description) errors.description = "Description is required";
  else if (description.length > 5000) errors.description = "Description is too long";

  const creatingCategory = categoryId === NEW_CATEGORY_VALUE;
  if (creatingCategory) {
    if (!newCategoryRaw) errors.newCategory = "Enter a name for the new category";
    else if (newCategoryRaw.length > 60) {
      errors.newCategory = "Category name must be 60 characters or fewer";
    } else if (!slugify(newCategoryRaw)) {
      errors.newCategory = "Category name needs at least one letter or number";
    }
  }

  const creatingBrand = brandId === NEW_BRAND_VALUE;
  if (creatingBrand) {
    if (!newBrandRaw) errors.newBrand = "Enter a name for the new brand";
    else if (newBrandRaw.length > 60) {
      errors.newBrand = "Brand name must be 60 characters or fewer";
    } else if (!slugify(newBrandRaw)) {
      errors.newBrand = "Brand name needs at least one letter or number";
    }
  }

  // Money is entered in major units but stored in cents.
  const price = Number(priceRaw);
  if (!priceRaw) errors.price = "Price is required";
  else if (!Number.isFinite(price) || price < 0) errors.price = "Enter a valid price";
  else if (price > 1_000_000) errors.price = "Price is unrealistically high";

  const priceCents = Math.round(price * 100);

  /**
   * Blank is the normal state and the way a sale is ended — it is not an
   * omission to complain about. Anything else is judged by the same rule the
   * storefront renders by, so the form cannot accept a "was" price that would
   * then show no discount.
   */
  const compareAtPriceCents = compareAtRaw
    ? Math.round(Number(compareAtRaw) * 100)
    : null;

  if (compareAtRaw && !Number.isFinite(Number(compareAtRaw))) {
    errors.compareAtPrice = "Enter a valid “was” price";
  } else if (!errors.price) {
    // Only once the price itself is sound — comparing against a price that
    // failed validation would produce a confusing second error about it.
    const compareAtProblem = compareAtError(priceCents, compareAtPriceCents);
    if (compareAtProblem) errors.compareAtPrice = compareAtProblem;
  }

  const stock = Number(stockRaw || "0");
  if (!Number.isInteger(stock) || stock < 0) errors.stock = "Stock must be a whole number";

  if (image && !isSafeImageUrl(image)) {
    errors.image = "Image must be an uploaded file or an http(s) URL";
  }

  const gallery = parseLines(galleryRaw);
  if (gallery.some((url) => !isSafeImageUrl(url))) {
    errors.gallery = "Every gallery image must be an uploaded file or an http(s) URL";
  } else if (gallery.length > 12) {
    errors.gallery = "At most 12 gallery images";
  }

  const parsedColors = parseColors(formData, isSafeImageUrl);
  if (parsedColors.error) errors.colors = parsedColors.error;

  const parsedSpecs = parseSpecs(formData);
  if (parsedSpecs.error) errors.specs = parsedSpecs.error;

  const parsedVariants = parseVariants(formData);
  if (parsedVariants.error) errors.variants = parsedVariants.error;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      name,
      slug,
      description,
      categoryId: creatingCategory || !categoryId ? null : categoryId,
      newCategoryName: creatingCategory ? newCategoryRaw : null,
      newCategoryParentId:
        creatingCategory && newCategoryParentRaw ? newCategoryParentRaw : null,
      brandId: creatingBrand || !brandId ? null : brandId,
      newBrandName: creatingBrand ? newBrandRaw : null,
      priceCents,
      compareAtPriceCents,
      stock,
      image: image || null,
      gallery,
      colors: parsedColors.colors,
      specs: parsedSpecs.specs,
      variantAxes: parsedVariants.axes,
      variants: parsedVariants.variants,
      published,
    },
  };
}
