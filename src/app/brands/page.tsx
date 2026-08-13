import type { Metadata } from "next";

import { Navbar } from "@/components/nav/Navbar";
import { Footer } from "@/components/layout/Footer";
import { BRAND_GRID, BrandTile } from "@/components/brands/BrandTile";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { getNavData } from "@/lib/nav/data";
import { getShoppableBrands } from "@/lib/brands/service";

export const metadata: Metadata = {
  title: "Brands · Ecom",
  description: "Every brand the shop carries, and a way straight into each one.",
};

/**
 * Every brand, in full.
 *
 * The home page's strip is capped at twelve, which is a design choice about how
 * much room a front page should give one section — but it left the thirteenth
 * brand reachable only by knowing its slug. This is where "All brands" goes,
 * and it is the same tile, so a shopper who recognised a mark on the home page
 * recognises it here.
 *
 * No pagination and no filter. A shop's brand list is tens of entries, not
 * thousands, and a control that never has anything to do is worse than the
 * scroll it replaced.
 */
export default async function BrandsPage() {
  const [nav, brands] = await Promise.all([getNavData(), getShoppableBrands()]);

  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <Navbar {...nav} />

      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <p className="eyebrow text-on-surface-variant flex items-center gap-2">
            <Icon name="sell" size={16} />
            Brands
          </p>

          {/* The same two-tone heading construction the home strip and the sale
              page use, a size up because this one is a page title. */}
          <h1 className="text-on-surface text-headline-lg sm:text-display-sm mt-3">
            Shop by <span className="accent-word">brand.</span>
          </h1>

          <p className="text-on-surface-variant mt-3 max-w-xl text-sm">
            {brands.length === 0
              ? "No brands are carrying published products yet."
              : `Every brand currently stocked${brands.length > 1 ? `, ${brands.length} of them` : ""}. Each one opens the catalogue already filtered.`}
          </p>
        </div>

        {brands.length === 0 ? (
          <Card variant="outlined">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Icon name="sell" size={40} className="text-on-surface-variant" />
              <p className="text-on-surface">Nothing to show yet</p>
              <p className="text-on-surface-variant max-w-sm text-sm">
                {/* Says which of the two conditions is missing rather than just
                    "no brands": a shop with brands set up but nothing published
                    would otherwise think this page was broken. */}
                A brand appears here once it has at least one published product.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className={`stagger ${BRAND_GRID}`}>
            {brands.map((brand) => (
              <li key={brand.slug}>
                <BrandTile brand={brand} />
              </li>
            ))}
          </ul>
        )}
      </main>

      <Footer />
    </div>
  );
}
