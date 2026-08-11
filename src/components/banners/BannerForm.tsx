"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";
import { Card, CardContent } from "@/components/ui/Card";
import { TintPicker } from "@/components/ui/TintPicker";
import { ImageUploadField } from "@/components/products/ImageUploadField";
import { PromoCard } from "./PromoCard";
import {
  CUSTOM_LINK_VALUE,
  NEW_CATEGORY_LINK_VALUE,
} from "@/lib/banners/validation";
import type { BannerFormState } from "@/lib/actions/banners";

/** One row of the category picker, already flattened depth-first. */
export interface BannerCategoryOption {
  id: string;
  slug: string;
  name: string;
  depth: number;
}

export interface BannerFormValues {
  imageUrl: string;
  heading: string;
  subtext: string;
  ctaLabel: string;
  ctaLink: string;
  isActive: boolean;
  /** Category section it appears under — "" for none. */
  categoryId: string;
  /** Background preset id from `lib/tints` — "" for the automatic choice. */
  tint: string;
  /** Pre-formatted for `datetime-local`, or "" when unset. */
  startsAt: string;
  endsAt: string;
}

export const EMPTY_BANNER: BannerFormValues = {
  imageUrl: "",
  heading: "",
  subtext: "",
  ctaLabel: "Shop now",
  ctaLink: "",
  isActive: true,
  categoryId: "",
  tint: "",
  startsAt: "",
  endsAt: "",
};

const INITIAL_STATE: BannerFormState = {};

export function BannerForm({
  action,
  categories,
  values = EMPTY_BANNER,
  submitLabel = "Save banner",
}: {
  action: (state: BannerFormState, formData: FormData) => Promise<BannerFormState>;
  /** Destinations offered in the link picker, depth-first. */
  categories: BannerCategoryOption[];
  values?: BannerFormValues;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  const categoryLinks = categories.map((category) => ({
    value: `/products?category=${category.slug}`,
    label:
      category.depth > 0
        ? `${"  ".repeat(category.depth)}└ ${category.name}`
        : `Category — ${category.name}`,
  }));

  const PRESET_LINKS = [
    { value: "/products", label: "All products" },
    ...categoryLinks,
  ];

  // An existing link that is not one of the presets must have been typed by
  // hand, so reopen the form in custom mode rather than silently losing it.
  const matchesPreset = PRESET_LINKS.some((link) => link.value === values.ctaLink);
  const [linkMode, setLinkMode] = useState(
    values.ctaLink && !matchesPreset ? CUSTOM_LINK_VALUE : values.ctaLink,
  );
  const [customLink, setCustomLink] = useState(matchesPreset ? "" : values.ctaLink);

  // Mirrored so the live preview updates as you type.
  const [imageUrl, setImageUrl] = useState(values.imageUrl);
  const [heading, setHeading] = useState(values.heading);
  const [subtext, setSubtext] = useState(values.subtext);
  const [ctaLabel, setCtaLabel] = useState(values.ctaLabel);
  // Mirrored like the copy fields above so the preview recolours as it is
  // picked, rather than only after a save.
  const [tint, setTint] = useState(values.tint);

  const isCustom = linkMode === CUSTOM_LINK_VALUE;
  const isNewCategory = linkMode === NEW_CATEGORY_LINK_VALUE;

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
          <h3 className="text-on-surface text-sm font-medium">Content</h3>

          <ImageUploadField
            name="imageUrl"
            label="Banner image"
            value={imageUrl}
            onChange={setImageUrl}
            error={state.errors?.imageUrl}
            supportingText="Shown alongside the heading on the storefront"
          />

          <TextField
            label="Heading"
            name="heading"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            error={state.errors?.heading}
            maxLength={80}
            required
          />

          <TextField
            label="Subtext"
            name="subtext"
            value={subtext}
            onChange={(e) => setSubtext(e.target.value)}
            error={state.errors?.subtext}
            maxLength={160}
            supportingText="Optional — one supporting line under the heading"
          />
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <h3 className="text-on-surface text-sm font-medium">Call to action</h3>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Button label"
              name="ctaLabel"
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              error={state.errors?.ctaLabel}
              maxLength={40}
              required
            />

            <Select
              label="Links to"
              name="ctaLinkMode"
              value={linkMode}
              onChange={(e) => setLinkMode(e.target.value)}
              placeholder="Choose a destination"
              options={[
                ...PRESET_LINKS,
                { value: NEW_CATEGORY_LINK_VALUE, label: "+ New category…" },
                { value: CUSTOM_LINK_VALUE, label: "Custom URL…" },
              ]}
              error={state.errors?.ctaLink}
            />
          </div>

          {isNewCategory && (
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="New category name"
                name="newCategoryName"
                leadingIcon="new_label"
                autoFocus
                supportingText="Created on save, then this banner points at it"
                error={state.errors?.newCategoryName}
                required
              />

              <Select
                label="Nest under"
                name="newCategoryParent"
                placeholder="Top level"
                options={categories.map((c) => ({
                  value: c.id,
                  label:
                    c.depth > 0 ? `${"  ".repeat(c.depth)}└ ${c.name}` : c.name,
                }))}
                supportingText="Optional — makes it a subcategory"
              />
            </div>
          )}

          {isCustom && (
            <TextField
              label="Custom URL"
              name="ctaLinkCustom"
              value={customLink}
              onChange={(e) => setCustomLink(e.target.value)}
              leadingIcon="link"
              autoFocus
              placeholder="/products?sort=price-asc"
              supportingText="An in-app path starting with / or a full https:// URL"
              error={state.errors?.ctaLinkCustom}
              required
            />
          )}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <h3 className="text-on-surface text-sm font-medium">Appearance</h3>

          {/* In its own card rather than under "Visibility": a colour is not a
              question about when the banner shows, and grouping it there would
              file it where nobody looking for it would think to check. */}
          <TintPicker
            name="tint"
            value={tint === "" ? null : tint}
            onChange={setTint}
            legend="Background"
          />
          <p className="text-on-surface-variant text-xs">
            Sits behind the card on the home page. Every option is built from the
            shop&rsquo;s own palette, so it follows the light and dark themes
            rather than fixing one colour. Leave it unset to let the card take a
            colour from its heading.
          </p>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent className="space-y-5">
          <h3 className="text-on-surface text-sm font-medium">Visibility</h3>

          {/* Grouping only — which category headline this banner appears
              under on the home page. The CTA above is a separate question. */}
          <Select
            label="Group under"
            name="categoryId"
            defaultValue={values.categoryId}
            placeholder="No category (shown last, without a heading)"
            options={categories.map((c) => ({
              value: c.id,
              label: c.depth > 0 ? `${"  ".repeat(c.depth)}└ ${c.name}` : c.name,
            }))}
            supportingText="The home page groups banners into a section per category"
            error={state.errors?.categoryId}
          />

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={values.isActive}
              className="accent-primary size-5 rounded"
            />
            <span>
              <span className="text-on-surface block text-sm font-medium">Active</span>
              <span className="text-on-surface-variant block text-xs">
                Inactive banners never appear, whatever the schedule says
              </span>
            </span>
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Starts at"
              name="startsAt"
              type="datetime-local"
              defaultValue={values.startsAt}
              error={state.errors?.startsAt}
              supportingText="Optional — leave empty to start immediately"
            />

            <TextField
              label="Ends at"
              name="endsAt"
              type="datetime-local"
              defaultValue={values.endsAt}
              error={state.errors?.endsAt}
              supportingText="Optional — leave empty to run indefinitely"
            />
          </div>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent className="space-y-4">
          <h3 className="text-on-surface text-sm font-medium">Preview</h3>
          {imageUrl && heading ? (
            // The real storefront component, so what is previewed is exactly
            // what ships — no second implementation to keep in step.
            <div className="max-w-md">
              <PromoCard
                imageUrl={imageUrl}
                heading={heading}
                subtext={subtext}
                ctaLabel={ctaLabel || "Shop now"}
                ctaLink="/products"
              />
            </div>
          ) : (
            <p className="text-on-surface-variant text-sm">
              Add an image and a heading to see the card.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending} icon="save">
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link
          href="/admin/banners"
          className="text-on-surface-variant state-layer inline-flex h-10 items-center rounded-full px-6 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
