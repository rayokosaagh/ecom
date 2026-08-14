"use client";

import { StockPill } from "@/components/products/StockPill";
import { useVariantSelection } from "@/components/products/VariantSelectionContext";

/**
 * Availability of *the thing being bought*, not of the listing.
 *
 * The distinction only exists for a product sold in configurations. Summing
 * stock across variants answers "can anything here be bought", which is the
 * right question on a catalogue card — a card offers no choice, so the product
 * as a whole is what it is describing. On the detail page a choice has been
 * made, and the honest answer is about that choice: a variant with two left is
 * "Only a few left" even where ninety of the other size are sitting in the
 * warehouse.
 *
 * `stock` is the fallback for a product with no variants at all, where the
 * product's own level is the only one there is. That case renders on the server
 * exactly as it did before this component existed.
 */
export function SelectedStockPill({
  stock,
  className,
}: {
  stock: number;
  className?: string;
}) {
  const selection = useVariantSelection();

  // No provider, or a product with nothing to configure.
  if (!selection || selection.variants.length === 0) {
    return <StockPill stock={stock} className={className} />;
  }

  // Null variant here means the assembled combination is not sold — the pill
  // says so rather than reporting a stock level for something that does not
  // exist. It stays mounted rather than disappearing, so picking through the
  // axes does not shunt the description up and down the page.
  return <StockPill stock={selection.variant?.stock ?? null} className={className} />;
}
