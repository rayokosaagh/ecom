"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { findVariant, openingSelection, type VariantView } from "@/lib/products/variants";

/**
 * The configuration a shopper has chosen, shared by everything that describes it.
 *
 * The same problem `ProductColorProvider` solves, for the other picker. Stock
 * was the case that made it necessary: the availability pill sits above the
 * description and the picker sits below it, so the pill was rendered on the
 * server from `availableStock()` — the sum across every variant — and could not
 * move when the selection did. A laptop with 90 units of the 16 GB and 2 of the
 * 64 GB read "In stock" while the 64 GB was selected, right above a buy box
 * that said "2 in stock". One of the two was lying, and it was the loud one.
 *
 * State lives in a provider rather than being lifted into the page, because the
 * page is a Server Component and cannot hold it.
 */

type VariantSelectionContext = {
  variants: VariantView[];
  selection: Record<string, string>;
  /**
   * The variant matching the current selection.
   *
   * Null when the product has no variants *and* when the chosen combination is
   * not one that is sold — two different things, told apart by `variants.length`
   * rather than by overloading this.
   */
  variant: VariantView | null;
  select: (definitionId: string, valueKey: string) => void;
};

const Context = createContext<VariantSelectionContext | null>(null);

export function VariantSelectionProvider({
  variants,
  children,
}: {
  variants: VariantView[];
  children: React.ReactNode;
}) {
  const [selection, setSelection] = useState(() => openingSelection(variants));

  const select = useCallback((definitionId: string, valueKey: string) => {
    setSelection((current) => ({ ...current, [definitionId]: valueKey }));
  }, []);

  const variant = variants.length > 0 ? findVariant(variants, selection) : null;

  const value = useMemo(
    () => ({ variants, selection, variant, select }),
    [variants, selection, variant, select],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * Read the shared selection.
 *
 * Returns null outside a provider rather than throwing, for the same reason
 * `useProductColor` does: the buy box is usable on its own, and a component
 * should not start crashing because of where it happens to be mounted.
 */
export function useVariantSelection(): VariantSelectionContext | null {
  return useContext(Context);
}
