"use client";

import { createContext, useContext, useState } from "react";

/**
 * The colour a shopper has chosen, shared by the gallery and the buy box.
 *
 * These are two components in two columns of a grid, and until now each kept
 * its own idea of the selection — so the page showed one colour and the cart
 * line recorded another. One picker now drives both, which is also why the
 * duplicate swatch row under the gallery is gone.
 *
 * State lives in a provider rather than being lifted into the page, because the
 * page is a server component and cannot hold it.
 */

export type ColorOption = {
  name: string;
  hex: string;
  /** Primary shot of this colourway; null falls back to the product's own. */
  image: string | null;
  /** Further shots of the same colourway. */
  gallery: string[];
};

type ColorContext = {
  colors: ColorOption[];
  selected: ColorOption | null;
  select: (name: string) => void;
};

const Context = createContext<ColorContext | null>(null);

export function ProductColorProvider({
  colors,
  children,
}: {
  colors: ColorOption[];
  children: React.ReactNode;
}) {
  // Pre-selecting the first is what makes "Colour: Midnight" true on arrival
  // rather than a prompt nobody answered.
  const [name, setName] = useState(colors[0]?.name ?? "");
  const selected = colors.find((color) => color.name === name) ?? null;

  return (
    <Context.Provider value={{ colors, selected, select: setName }}>
      {children}
    </Context.Provider>
  );
}

/**
 * Read the shared selection.
 *
 * Returns null outside a provider rather than throwing: the gallery and the
 * buy box are both used on their own elsewhere, and a component that works
 * without colours should not start crashing because of where it is mounted.
 */
export function useProductColor(): ColorContext | null {
  return useContext(Context);
}
