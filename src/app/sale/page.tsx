import type { Metadata } from "next";
import Link from "next/link";

import { Navbar } from "@/components/nav/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SaleCard } from "@/components/products/SaleCard";
import { Pagination } from "@/components/products/Pagination";
import { SALE_TINTS, saleTintPair } from "@/components/products/sale-tints";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { getNavData } from "@/lib/nav/data";
import { getWishlistProductIds } from "@/lib/wishlist/service";
import { getRatings } from "@/lib/reviews/service";
import { formatPrice } from "@/lib/products/format";
import { getSaleProductPage } from "@/lib/sales/service";

export const metadata: Metadata = {
  title: "On sale · Ecom",
  description: "Every product currently reduced, deepest discount first.",
};

/** Matches the catalogue, so the two listings feel like one shop. */
const PAGE_SIZE = 24;

export default async function SalePage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise and must be awaited.
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const requested = Number(pageParam);
  const page = Math.max(
    Number.isFinite(requested) ? Math.trunc(requested) : 1,
    1,
  );

  const [nav, wishlistIds, pageResult] = await Promise.all([
    getNavData(),
    getWishlistProductIds(),
    getSaleProductPage(page, PAGE_SIZE),
  ]);

  // The headline figures describe the whole sale, not this page — someone on
  // page 2 has not stopped caring how much is reduced overall.
  const { products, total, totalPages, bestPercentOff, totalSavingCents } = pageResult;
  // Re-read after clamping, so the control highlights the page actually shown
  // rather than the one that was asked for.
  const currentPage = Math.min(page, totalPages);

  const ratings = await getRatings(products.map((product) => product.id));

  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <Navbar {...nav} />

      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <p className="eyebrow text-tertiary flex items-center gap-2">
            <Icon name="sell" size={16} filled />
            On sale
          </p>

          {/* Same two-tone construction and weight as the home shelf's heading,
              a size up because this one is a page title rather than a section
              heading. */}
          <h1 className="text-on-surface text-headline-lg sm:text-display-sm mt-3">
            Every{" "}
            <span className="accent-word">reduction.</span>
          </h1>

          {total > 0 && (
            <p className="text-on-surface-variant mt-3 text-sm">
              {total} {total === 1 ? "product" : "products"} reduced
              {bestPercentOff >= 1 && <> · up to {bestPercentOff}% off</>}
              {totalSavingCents > 0 && (
                <> · {formatPrice(totalSavingCents)} off in total</>
              )}
              {totalPages > 1 && (
                <>
                  {" · showing "}
                  {(currentPage - 1) * PAGE_SIZE + 1}–
                  {(currentPage - 1) * PAGE_SIZE + products.length}
                </>
              )}
            </p>
          )}
        </div>

        {products.length === 0 ? (
          <Card variant="outlined">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Icon name="sell" size={40} className="text-on-surface-variant" />
              <p className="text-on-surface">Nothing is reduced right now</p>
              <p className="text-on-surface-variant max-w-sm text-sm">
                Sales come and go. In the meantime the full catalogue is a click
                away.
              </p>
              <Link
                href="/products"
                className="text-primary mt-1 rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Shop all products
              </Link>
            </CardContent>
          </Card>
        ) : (
          <ul className="stagger grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((product, index) => (
              <li key={product.slug}>
                {/* Cycled across the whole palette here, unlike the home shelf.
                    There the lead's colour is held back so four cards can all
                    differ; on a list of arbitrary length a repeat is
                    unavoidable, so the palette is used in full and the repeat
                    falls as far apart as it can. */}
                <SaleCard
                  product={{ ...product, rating: ratings.get(product.id) ?? null }}
                  tints={saleTintPair(index % SALE_TINTS.length, product.slug)}
                  wishlisted={wishlistIds.has(product.id)}
                />
              </li>
            ))}
          </ul>
        )}

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          // Page 1 is the default, so it stays out of the URL.
          hrefFor={(next) => (next > 1 ? `/sale?page=${next}` : "/sale")}
        />
      </main>

      <Footer />
    </div>
  );
}
