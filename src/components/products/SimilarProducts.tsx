import { ProductCard } from "@/components/products/ProductCard";
import type { SimilarProduct } from "@/lib/products/similar";
import type { RootCategory } from "@/lib/categories/tree";

/**
 * "More like this", under a product.
 *
 * Presentational, like `SaleSection` and `FeaturedShowcase` — the page owns the
 * query, so the ratings and wishlist lookups it already makes are shared rather
 * than duplicated here.
 *
 * The same card and the same grid the catalogue uses. A shelf of suggestions is
 * still a list of products, and inventing a second way to draw one would mean
 * the sale badge, the sold-out state and the wishlist toggle all had to be kept
 * working twice.
 *
 * Renders nothing when there is nothing to suggest. An empty "Similar products"
 * heading tells a shopper the shop has nothing else, which is rarely true and
 * never useful.
 */
export function SimilarProducts({
  products,
  wishlistIds,
  ratings,
  rootCategories,
}: {
  products: SimilarProduct[];
  wishlistIds?: Set<string>;
  /** Batched by the page, the way the catalogue grid does it. */
  ratings?: Map<string, { average: number; count: number }>;
  /** Category id → its top-level ancestor, which is what compare is locked to. */
  rootCategories?: Map<string, RootCategory>;
}) {
  if (products.length === 0) return null;

  return (
    <section className="mt-14" aria-labelledby="similar-heading">
      <h2
        id="similar-heading"
        className="text-on-surface text-2xl font-normal tracking-tight"
      >
        Similar products
      </h2>

      <ul className="stagger mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => (
          <li key={product.slug}>
            <ProductCard
              product={{
                ...product,
                compareGroup: product.categoryId
                  ? (rootCategories?.get(product.categoryId) ?? null)
                  : null,
                rating: ratings?.get(product.id) ?? null,
              }}
              wishlisted={wishlistIds?.has(product.id) ?? false}
              comparable
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
