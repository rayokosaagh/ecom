import { ProductColorProvider } from "@/components/products/ProductColorContext";
import { VariantSelectionProvider } from "@/components/products/VariantSelectionContext";
import type { ColorOption } from "@/components/products/ProductColorContext";
import type { VariantView } from "@/lib/products/variants";

/**
 * Everything a shopper has chosen on a product page, in one wrapper.
 *
 * Two contexts rather than one, because they have different consumers — the
 * gallery cares only about the colour and the stock pill only about the variant
 * — but they are always mounted together and always for the same reason: a
 * choice made in the buy box has to be visible to things rendered above it. A
 * single component to mount both keeps that pairing from drifting, and keeps
 * the page from growing a second layer of indentation every time a third kind
 * of choice appears.
 *
 * Not itself a Client Component: it renders two providers that are, and holds
 * no state of its own, so the page's server-rendered children pass straight
 * through as children rather than being pulled into the client bundle.
 */
export function ProductSelectionProvider({
  colors,
  variants,
  children,
}: {
  colors: ColorOption[];
  variants: VariantView[];
  children: React.ReactNode;
}) {
  return (
    <ProductColorProvider colors={colors}>
      <VariantSelectionProvider variants={variants}>
        {children}
      </VariantSelectionProvider>
    </ProductColorProvider>
  );
}
