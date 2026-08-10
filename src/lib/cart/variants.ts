import type { VariantView } from "@/lib/products/variants";

/**
 * Reading a variant well enough to label a cart line.
 *
 * Shared between `addToCart` and `reorder` rather than written twice. Both put
 * a line in the same table, and `getCart` renders whichever label was stored —
 * so if the two disagreed, the same product would describe itself differently
 * depending on which button put it there.
 *
 * A plain module, not a `"use server"` one, because a server-action file may
 * only export async functions and these are a constant and a mapper.
 */

/**
 * The definition's sort order rides along so a configuration always describes
 * itself in the same order — "16 GB / 512 GB", never "512 GB / 16 GB".
 */
export const VARIANT_SELECT = {
  id: true,
  sku: true,
  priceCents: true,
  stock: true,
  image: true,
  options: {
    select: {
      definitionId: true,
      value: true,
      valueKey: true,
      definition: { select: { label: true, unit: true, sortOrder: true } },
    },
  },
} as const;

export type VariantRow = {
  id: string;
  sku: string | null;
  priceCents: number;
  stock: number;
  image: string | null;
  options: {
    definitionId: string;
    value: string;
    valueKey: string;
    definition: { label: string; unit: string | null; sortOrder: number };
  }[];
};

export function toVariantView(variant: VariantRow): VariantView {
  return {
    id: variant.id,
    sku: variant.sku,
    priceCents: variant.priceCents,
    stock: variant.stock,
    image: variant.image,
    options: variant.options.map((option) => ({
      definitionId: option.definitionId,
      label: option.definition.label,
      unit: option.definition.unit,
      sortOrder: option.definition.sortOrder,
      value: option.value,
      valueKey: option.valueKey,
    })),
  };
}
