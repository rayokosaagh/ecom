import { formatSpecValue } from "@/lib/specs/keys";

/**
 * Variant helpers shared by the storefront, the cart and the admin form.
 *
 * The rule the whole feature rests on: **a product with no variants keeps
 * using its own price and stock.** Variants are optional, so a lamp behaves
 * exactly as it did before they existed, and every reader here takes the
 * product as a fallback rather than assuming a variant is present.
 *
 * Pure functions with no Prisma import, so the admin form can use the same
 * axis-derivation the product page does.
 */

/** Upper bound on variants per product; the form stops offering more rows. */
export const MAX_VARIANTS = 24;

export interface VariantOptionView {
  definitionId: string;
  label: string;
  unit: string | null;
  /** Position of the *definition*, so axes order the same way specs do. */
  sortOrder: number;
  value: string;
  valueKey: string;
}

export interface VariantView {
  id: string;
  sku: string | null;
  priceCents: number;
  stock: number;
  image: string | null;
  options: VariantOptionView[];
}

/** One configurable dimension, with the distinct values offered for it. */
export interface VariantAxis {
  definitionId: string;
  label: string;
  unit: string | null;
  values: { value: string; valueKey: string; display: string }[];
}

/**
 * The axes a product is configurable along.
 *
 * Derived from the options its variants actually carry rather than declared
 * anywhere. Which labels vary is a property of the product — RAM varies on a
 * laptop and is fixed on a desktop — and deriving it means the two can never
 * disagree: an axis exists exactly when something varies along it.
 */
export function variantAxes(variants: VariantView[]): VariantAxis[] {
  const byDefinition = new Map<string, VariantAxis & { sortOrder: number }>();

  for (const variant of variants) {
    for (const option of variant.options) {
      const existing = byDefinition.get(option.definitionId);
      const display = formatSpecValue(option.value, option.unit);

      if (!existing) {
        byDefinition.set(option.definitionId, {
          definitionId: option.definitionId,
          label: option.label,
          unit: option.unit,
          sortOrder: option.sortOrder,
          values: [{ value: option.value, valueKey: option.valueKey, display }],
        });
        continue;
      }

      if (!existing.values.some((value) => value.valueKey === option.valueKey)) {
        existing.values.push({ value: option.value, valueKey: option.valueKey, display });
      }
    }
  }

  const axes = [...byDefinition.values()].sort((a, b) => a.sortOrder - b.sortOrder);

  // Numeric-aware within an axis, so 8 GB precedes 16 GB rather than following
  // it. Same comparison the spec facets use, for the same reason.
  for (const axis of axes) {
    axis.values.sort((a, b) => {
      const numberA = Number.parseFloat(a.value);
      const numberB = Number.parseFloat(b.value);
      const aNumeric = !Number.isNaN(numberA);
      const bNumeric = !Number.isNaN(numberB);
      if (aNumeric && bNumeric && numberA !== numberB) return numberA - numberB;
      if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
      return a.value.localeCompare(b.value, undefined, { numeric: true });
    });
  }

  return axes.map(({ sortOrder: _sortOrder, ...axis }) => axis);
}

/** "16 GB / 512 GB" — how a configuration reads in a cart line or an order. */
export function describeVariant(variant: VariantView): string {
  return [...variant.options]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((option) => formatSpecValue(option.value, option.unit))
    .join(" / ");
}

/**
 * Find the variant matching one value per axis.
 *
 * Returns null when the combination is not one that is sold — not every
 * cartesian product exists, and offering 16 GB with 256 GB because both appear
 * somewhere would be inventing a configuration.
 */
export function findVariant(
  variants: VariantView[],
  selection: Record<string, string>,
): VariantView | null {
  const wanted = Object.entries(selection);
  if (wanted.length === 0) return null;

  return (
    variants.find(
      (variant) =>
        variant.options.length === wanted.length &&
        wanted.every(([definitionId, valueKey]) =>
          variant.options.some(
            (option) =>
              option.definitionId === definitionId && option.valueKey === valueKey,
          ),
        ),
    ) ?? null
  );
}

/**
 * Whether any sellable variant exists for a value, given the rest of the
 * selection.
 *
 * Used to grey out a choice that leads nowhere — picking 64 GB when no 64 GB
 * machine is sold in the currently selected storage size. The axis being
 * tested is excluded from the comparison, so changing your mind about it
 * always stays possible.
 */
export function isValueAvailable(
  variants: VariantView[],
  selection: Record<string, string>,
  definitionId: string,
  valueKey: string,
): boolean {
  return variants.some((variant) => {
    const matchesThis = variant.options.some(
      (option) => option.definitionId === definitionId && option.valueKey === valueKey,
    );
    if (!matchesThis) return false;

    return Object.entries(selection).every(
      ([otherId, otherKey]) =>
        otherId === definitionId ||
        variant.options.some(
          (option) => option.definitionId === otherId && option.valueKey === otherKey,
        ),
    );
  });
}

/**
 * The configuration a product page should open on.
 *
 * The cheapest one that can actually be bought, falling back to the cheapest
 * overall when nothing is in stock — arriving on a sold-out default would read
 * as the whole product being unavailable.
 *
 * Shared rather than inlined in the buy box, because the stock pill above the
 * description and the picker below it have to agree about what is selected
 * from the very first frame. Two copies of "cheapest in stock" would be two
 * chances to disagree.
 */
export function openingSelection(variants: VariantView[]): Record<string, string> {
  if (variants.length === 0) return {};

  const candidates = variants.filter((variant) => variant.stock > 0);
  const opening = [...(candidates.length > 0 ? candidates : variants)].sort(
    (a, b) => a.priceCents - b.priceCents,
  )[0];

  return Object.fromEntries(
    opening.options.map((option) => [option.definitionId, option.valueKey]),
  );
}

export interface PriceRange {
  minCents: number;
  maxCents: number;
  /** True when variants disagree, so the catalogue should say "from". */
  varies: boolean;
}

/** What a product costs, across whatever it is sold as. */
export function priceRange(
  product: { priceCents: number },
  variants: Pick<VariantView, "priceCents">[],
): PriceRange {
  if (variants.length === 0) {
    return {
      minCents: product.priceCents,
      maxCents: product.priceCents,
      varies: false,
    };
  }

  const prices = variants.map((variant) => variant.priceCents);
  const minCents = Math.min(...prices);
  const maxCents = Math.max(...prices);
  return { minCents, maxCents, varies: minCents !== maxCents };
}

/**
 * Units available to sell, across the whole listing.
 *
 * Summed across variants, because "in stock" for a configurable *product* means
 * *some* configuration can be bought — which is the right question for a
 * catalogue card, where no choice has been made yet. It is the wrong question
 * on the detail page once a configuration is selected: see `SelectedStockPill`.
 * The per-variant number is what gates the actual add to cart.
 */
export function availableStock(
  product: { stock: number },
  variants: Pick<VariantView, "stock">[],
): number {
  if (variants.length === 0) return product.stock;
  return variants.reduce((total, variant) => total + variant.stock, 0);
}
