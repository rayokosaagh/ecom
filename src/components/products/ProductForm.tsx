"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { TextArea } from "@/components/ui/TextArea";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";
import { Card, CardContent } from "@/components/ui/Card";
import { ImageUploadField } from "./ImageUploadField";
import { GalleryUploadField } from "./GalleryUploadField";
import { ColorField, type ColorRow } from "./ColorField";
import { SpecField, type SpecRow } from "./SpecField";
import { VariantField, type VariantRow } from "./VariantField";
import {
  NEW_BRAND_VALUE,
  NEW_CATEGORY_VALUE,
  slugify,
} from "@/lib/products/validation";
import type { ProductFormState } from "@/lib/actions/products";

/** One row of the category picker, already flattened depth-first. */
export interface CategoryOption {
  id: string;
  name: string;
  depth: number;
}

export interface ProductFormValues {
  id?: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string | null;
  brandId: string | null;
  price: string;
  /** Empty string when not on sale, which is how a sale is ended. */
  compareAtPrice: string;
  stock: number;
  image: string | null;
  gallery: string[];
  colors: ColorRow[];
  specs: SpecRow[];
  variantAxes: string[];
  variants: VariantRow[];
  published: boolean;
}

const EMPTY: ProductFormValues = {
  name: "",
  slug: "",
  description: "",
  categoryId: null,
  brandId: null,
  price: "",
  compareAtPrice: "",
  stock: 0,
  image: null,
  gallery: [],
  colors: [],
  specs: [],
  variantAxes: [],
  variants: [],
  published: false,
};

const INITIAL_STATE: ProductFormState = {};

/** Indent nested categories so the tree is readable in a native <select>. */
function indent(option: CategoryOption): string {
  return option.depth > 0 ? `${"  ".repeat(option.depth)}└ ${option.name}` : option.name;
}

export function ProductForm({
  action,
  categories,
  brands,
  specLabels,
  values = EMPTY,
  submitLabel = "Save product",
}: {
  action: (state: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  /** Depth-first, so indentation reads as a tree. */
  categories: CategoryOption[];
  brands: { id: string; name: string }[];
  /** Spec labels already in use, offered as autocomplete in the spec editor. */
  specLabels: string[];
  values?: ProductFormValues;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  // Mirrored locally so the previews update as you type.
  const [name, setName] = useState(values.name);
  const [slug, setSlug] = useState(values.slug);
  // A slug that is exactly the name slugified is one this form generated, so it
  // stays in step with the name — renaming a product renames its URL too.
  // Only a slug deliberately made to differ counts as hand-edited and is left
  // alone, which is what an editor who typed their own slug expects.
  const [slugTouched, setSlugTouched] = useState(
    Boolean(values.slug) && values.slug !== slugify(values.name),
  );
  const [image, setImage] = useState(values.image ?? "");
  const [gallery, setGallery] = useState<string[]>(values.gallery);
  const [colors, setColors] = useState<ColorRow[]>(values.colors);
  const [specs, setSpecs] = useState<SpecRow[]>(values.specs);
  const [variantAxes, setVariantAxes] = useState<string[]>(values.variantAxes);
  const [variants, setVariants] = useState<VariantRow[]>(values.variants);
  const [categoryId, setCategoryId] = useState(values.categoryId ?? "");
  const [brandId, setBrandId] = useState(values.brandId ?? "");
  const creatingCategory = categoryId === NEW_CATEGORY_VALUE;
  const creatingBrand = brandId === NEW_BRAND_VALUE;

  // Until the slug is edited by hand, keep it in step with the name.
  const effectiveSlug = slugTouched ? slug : slugify(name);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.message && (
        <div
          role="alert"
          className="bg-error-container text-on-error-container flex items-start gap-3 rounded-md px-4 py-3 text-sm"
        >
          <Icon name="error" size={20} />
          <span>{state.message}</span>
        </div>
      )}

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <h3 className="text-on-surface text-sm font-medium">Details</h3>

          <TextField
            label="Product name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={state.errors?.name}
            required
          />

          <TextField
            label="Slug"
            name="slug"
            value={effectiveSlug}
            onChange={(e) => {
              const next = slugify(e.target.value);
              // Clearing the field hands the slug back to the name, which is
              // the only way to undo a hand-edit without reloading the form.
              setSlugTouched(next !== "");
              setSlug(next);
            }}
            supportingText={`URL: /products/${effectiveSlug || "…"}`}
            error={state.errors?.slug}
          />

          <TextArea
            label="Description"
            name="description"
            defaultValue={values.description}
            rows={5}
            error={state.errors?.description}
            required
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Select
              label="Category"
              name="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              placeholder="Uncategorised"
              options={[
                ...categories.map((c) => ({ value: c.id, label: indent(c) })),
                { value: NEW_CATEGORY_VALUE, label: "+ New category…" },
              ]}
              supportingText="Pick the most specific one — a product on a subcategory still shows under its parent"
              error={state.errors?.categoryId}
            />

            <Select
              label="Brand"
              name="brandId"
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              placeholder="No brand"
              options={[
                ...brands.map((b) => ({ value: b.id, label: b.name })),
                { value: NEW_BRAND_VALUE, label: "+ New brand…" },
              ]}
              error={state.errors?.brandId}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Price"
              name="price"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              defaultValue={values.price}
              leadingIcon="attach_money"
              error={state.errors?.price}
              required
            />

            <TextField
              label="Stock"
              name="stock"
              type="number"
              min="0"
              step="1"
              defaultValue={String(values.stock)}
              error={state.errors?.stock}
            />

            {/* Putting something on sale means lowering Price and recording
                what it was here — Price stays the figure customers are
                charged, so nothing downstream has to know a sale is on. */}
            <TextField
              label="Was (price before the sale)"
              name="compareAtPrice"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              defaultValue={values.compareAtPrice}
              leadingIcon="sell"
              supportingText="Empty = not on sale. To start one, lower Price to the new figure and put the old, higher one here."
              error={state.errors?.compareAtPrice}
            />
          </div>

          {creatingCategory && (
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="New category name"
                name="newCategory"
                leadingIcon="new_label"
                autoFocus
                supportingText="Created when you save — reused if it already exists"
                error={state.errors?.newCategory}
                required
              />

              {/* Nesting is what makes "Laptops → Workstations" possible
                  without a second model. */}
              <Select
                label="Nest under"
                name="newCategoryParent"
                placeholder="Top level"
                options={categories.map((c) => ({ value: c.id, label: indent(c) }))}
                supportingText="Optional — leave as top level for a main category"
              />
            </div>
          )}

          {creatingBrand && (
            <TextField
              label="New brand name"
              name="newBrand"
              leadingIcon="sell"
              autoFocus
              supportingText="Created when you save — reused if it already exists"
              error={state.errors?.newBrand}
              required
            />
          )}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <h3 className="text-on-surface text-sm font-medium">Media</h3>

          <ImageUploadField
            name="image"
            label="Main image"
            value={image}
            onChange={setImage}
            error={state.errors?.image}
            supportingText="Shown in listings and as the first gallery frame"
          />

          <GalleryUploadField
            name="gallery"
            urls={gallery}
            onChange={setGallery}
            error={state.errors?.gallery}
          />

          <ColorField
            value={colors}
            onChange={setColors}
            error={state.errors?.colors}
          />
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <VariantField
            axes={variantAxes}
            rows={variants}
            onAxesChange={setVariantAxes}
            onRowsChange={setVariants}
            knownLabels={specLabels}
            error={state.errors?.variants}
          />
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <SpecField
            value={specs}
            onChange={setSpecs}
            knownLabels={specLabels}
            error={state.errors?.specs}
          />
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              name="published"
              defaultChecked={values.published}
              className="accent-primary size-5 rounded"
            />
            <span>
              <span className="text-on-surface block text-sm font-medium">Published</span>
              <span className="text-on-surface-variant block text-xs">
                Unpublished products are visible to admins only
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending} icon="save">
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link
          href="/dashboard/products"
          className="text-on-surface-variant state-layer inline-flex h-10 items-center rounded-full px-6 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
