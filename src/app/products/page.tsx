import type { Metadata } from "next";
import Link from "next/link";

import { Navbar } from "@/components/nav/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/products/ProductCard";
import { ProductFilters } from "@/components/products/ProductFilters";
import { Pagination } from "@/components/products/Pagination";
import {
  CategoryFilter,
  type FilterCategory,
} from "@/components/products/CategoryFilter";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { BrandBar, type BrandBarItem } from "@/components/products/BrandBar";
import {
  SpecSidebar,
  type SpecFilterGroup,
} from "@/components/products/SpecSidebar";
import { getNavData } from "@/lib/nav/data";
import { getWishlistProductIds } from "@/lib/wishlist/service";
import { searchProductIds } from "@/lib/products/search";
import { saleFor } from "@/lib/products/sale";
import { SALE_CANDIDATES } from "@/lib/sales/service";
import { getRatings } from "@/lib/reviews/service";
import {
  getCategoryAndDescendantIds,
  getCategoryTree,
  getRootCategories,
} from "@/lib/categories/tree";
import { prisma } from "@/lib/prisma";
import {
  clearSpec,
  countSelected,
  parseSpecParams,
  specWhereClauses,
  toggleSpec,
  toSpecParams,
  type SpecSelection,
} from "@/lib/specs/filter";
import { getSpecFacets } from "@/lib/specs/facets";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = {
  title: "Products",
  description: "Browse the full catalogue.",
};

type Params = {
  category?: string;
  brand?: string;
  q?: string;
  sort?: string;
  min?: string;
  max?: string;
  stock?: string;
  /** "1" narrows the catalogue to reduced products. */
  sale?: string;
  /** 1-based. Anything unparseable, negative or past the end lands on a real page. */
  page?: string;
  /** Repeated `label:value` keys — see lib/specs/filter. */
  spec?: string | string[];
};

/** Dollars-string → cents, or undefined when absent/garbage. */
function toCents(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100);
}

const ORDER_BY: Record<string, Prisma.ProductOrderByWithRelationInput> = {
  newest: { createdAt: "desc" },
  "price-asc": { priceCents: "asc" },
  "price-desc": { priceCents: "desc" },
  name: { name: "asc" },
};

/**
 * Relevance has no SQL equivalent here — the ranking is computed by the search
 * service — so it is applied after the query rather than in `ORDER_BY`.
 */
const RELEVANCE = "relevance";

/**
 * Nor does rating: Prisma can order by a relation's *count* but not by the
 * average of a column inside it.
 */
const TOP_RATED = "rating";

/**
 * Products per page.
 *
 * A multiple of 2, 3 and 4 so the last row is never ragged at any of the grid's
 * breakpoints.
 */
const PAGE_SIZE = 24;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const { category, brand, stock } = params;
  const query = params.q?.trim();
  const minCents = toCents(params.min);
  const maxCents = toCents(params.max);
  const inStockOnly = stock === "in";
  // Compared as an exact value rather than truthiness, so `?sale=` or a stray
  // `?sale=0` on a shared link does not silently narrow the catalogue.
  const onSaleOnly = params.sale === "1";
  const specSelection = parseSpecParams(params.spec);

  /**
   * Spec filters need a category to mean anything.
   *
   * Labels are shared across the catalogue, so their *values* collide between
   * product types: a "Resolution" facet spanning phones and laptops offers
   * 2340x1080 next to 3840x2400, and no shopper wants a list that mixes the
   * two. Coverage filtering cannot help — both types genuinely carry the
   * label. Narrowing to a category is what makes the values comparable, which
   * is why every catalogue that does this well asks for a department first.
   *
   * An active selection keeps them on regardless, so a shared link never
   * arrives narrowed with no controls to widen it.
   */
  const specsInScope = Boolean(category) || specSelection.size > 0;

  // Relevance is the natural default for a search, and only means anything
  // when there is something to rank against.
  const requested = params.sort;
  const defaultSort = query ? RELEVANCE : "newest";
  const sort =
    requested && (requested in ORDER_BY || (requested === RELEVANCE && query))
      ? requested
      : defaultSort;

  const [nav, wishlistIds, matchIds, categoryIds] = await Promise.all([
    getNavData(),
    getWishlistProductIds(),
    // Typo-tolerant: the same ranking the search dropdown used, so pressing
    // Enter on a misspelling lands on the results it was already showing.
    query ? searchProductIds(query) : Promise.resolve(null),
    // Selecting "Laptops" must also return its workstations and ultrabooks,
    // so the filter is over the whole subtree rather than one id.
    category ? getCategoryAndDescendantIds(category) : Promise.resolve(null),
  ]);

  /**
   * Every filter except brand and specs — the two that have facets of their
   * own, each of which has to be computed without itself applied.
   */
  const baseWhere: Prisma.ProductWhereInput = {
    published: true,
    ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
    ...(matchIds ? { id: { in: matchIds } } : {}),
    ...(minCents !== undefined || maxCents !== undefined
      ? {
          priceCents: {
            ...(minCents !== undefined ? { gte: minCents } : {}),
            ...(maxCents !== undefined ? { lte: maxCents } : {}),
          },
        }
      : {}),
    ...(inStockOnly ? { stock: { gt: 0 } } : {}),
    /**
     * Half of the sale filter.
     *
     * "On sale" is `compareAtPriceCents > priceCents`, a comparison between two
     * columns that Prisma cannot express in a `where`. So the query narrows to
     * rows that have a "was" price *set* anywhere, and the exact test runs in
     * `saleFor` once the rows are back — the same rule the cards and the shelf
     * render by, rather than a second definition kept in step by hand.
     *
     * It is in `baseWhere` so the brand and spec facets narrow with it: with
     * the filter on, the brand rail offers only brands that have something
     * reduced. The counts it shows can overstate by one where an admin has left
     * a "was" price at or below the price — a misconfiguration the admin Sales
     * screen already flags — which is a better trade than facets that ignore
     * the filter entirely.
     */
    ...(onSaleOnly ? SALE_CANDIDATES : {}),
  };

  const specClauses = specWhereClauses(specSelection);

  /**
   * What the brand facet is computed from, so the options are always the
   * brands that actually have products in the current view — no option that
   * would return nothing. Excluding brand from its *own* facet is the
   * important part: including it would leave only the selected brand on
   * screen, with no way to switch to another without clearing first.
   */
  const whereWithoutBrand: Prisma.ProductWhereInput =
    specClauses.length > 0 ? { ...baseWhere, AND: specClauses } : baseWhere;

  /**
   * The same idea for specs, one level down: each label's options are counted
   * without that label's own selection, which `getSpecFacets` applies per
   * label. Everything else — including brand — is in force here.
   */
  const whereWithoutSpecs: Prisma.ProductWhereInput = {
    ...baseWhere,
    ...(brand ? { brand: { slug: brand } } : {}),
  };

  /** Only published products are public, regardless of who is browsing. */
  const listWhere: Prisma.ProductWhereInput = {
    ...whereWithoutBrand,
    ...(brand ? { brand: { slug: brand } } : {}),
  };

  /**
   * Every matching id, in the requested order — the first of two phases.
   *
   * Pagination cannot be a plain `skip`/`take` on the listing query, because
   * three things this page offers have no SQL expression: relevance ranking
   * comes from the search service, "top rated" is the average of a relation,
   * and "on sale" compares two columns. Applying any of them to one page's rows
   * would rank that page against itself — which is not the same list, just a
   * shuffled slice of one.
   *
   * So the id set is resolved in full first, ordered and filtered, and only
   * then is a page of it fetched with everything a card needs. The heavy
   * columns — colours, variants, the brand's inlined SVG, which runs to tens of
   * kilobytes each — are read for the page alone rather than the catalogue.
   *
   * This phase is still O(matches) in rows, though they are narrow ones. The
   * next step, if the catalogue ever gets big enough to care, is pushing
   * relevance and rating into SQL so the whole thing collapses to one
   * LIMIT/OFFSET query.
   */
  async function orderedProductIds(): Promise<string[]> {
    if (!onSaleOnly) {
      const rows = await prisma.product.findMany({
        where: listWhere,
        orderBy: ORDER_BY[sort] ?? ORDER_BY.newest,
        select: { id: true },
      });
      return rows.map((row) => row.id);
    }

    // The sale filter's exact test, which the query could only approximate.
    // Variants come along because a configurable product is priced by them.
    const rows = await prisma.product.findMany({
      where: listWhere,
      orderBy: ORDER_BY[sort] ?? ORDER_BY.newest,
      select: {
        id: true,
        priceCents: true,
        compareAtPriceCents: true,
        variants: { select: { priceCents: true, compareAtPriceCents: true } },
      },
    });
    return rows
      .filter((row) => saleFor(row, row.variants))
      .map((row) => row.id);
  }

  const [matchingIds, categoryTree, brands, specFacets, rootCategories] = await Promise.all([
    orderedProductIds(),
    getCategoryTree(),
    // Only brands with at least one product in the current view, so a tab can
    // never lead to an empty page. The `where` still narrows with every other
    // filter — the bar just no longer says by how much.
    prisma.brand.findMany({
      where: { products: { some: whereWithoutBrand } },
      orderBy: { name: "asc" },
      select: { slug: true, name: true, iconSvg: true, logo: true, logoTreatment: true },
    }),
    specsInScope
      ? getSpecFacets(whereWithoutSpecs, specSelection)
      : Promise.resolve([]),
    // Comparison is locked to the top-level category, so each card carries the
    // group it would join.
    getRootCategories(),
  ]);

  /**
   * Ranking that SQL could not do, applied to the whole id set rather than to
   * one page of it — which is the point of resolving ids first.
   *
   * Ratings for the full set are only pulled when the ranking needs them; every
   * other sort reads ratings for the page alone, further down.
   */
  const rankingRatings = sort === TOP_RATED ? await getRatings(matchingIds) : null;

  if (rankingRatings) {
    matchingIds.sort((a, b) => {
      const left = rankingRatings.get(a);
      const right = rankingRatings.get(b);
      // Unrated products sort last rather than as zero stars — "nobody has
      // said" is not the same claim as "everybody said it was bad".
      const byScore = (right?.average ?? -1) - (left?.average ?? -1);
      if (byScore !== 0) return byScore;
      // Same average, more voices first: 4.8 from 40 people is a stronger
      // signal than 4.8 from one.
      return (right?.count ?? 0) - (left?.count ?? 0);
    });
  }

  // `matchIds` is already best-match-first; restore that order once the other
  // filters have had their say.
  if (sort === RELEVANCE && matchIds) {
    const rank = new Map(matchIds.map((id, index) => [id, index]));
    matchingIds.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
  }

  /**
   * Where the page lands.
   *
   * Clamped rather than 404'd: a shopper arrives on page 4 from a bookmark,
   * three products sell out, and the honest thing is the last page of what is
   * left — not an error about a page that used to exist.
   */
  const totalProducts = matchingIds.length;
  const totalPages = Math.max(1, Math.ceil(totalProducts / PAGE_SIZE));
  const requestedPage = Number(params.page);
  const currentPage = Math.min(
    Math.max(Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1, 1),
    totalPages,
  );
  const pageIds = matchingIds.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  /**
   * Phase two: everything a card needs, for this page only.
   *
   * `findMany` returns rows in whatever order it likes, so the ids drive the
   * final order — the ranking above would otherwise be thrown away by the very
   * query meant to honour it.
   */
  const pageRows = await prisma.product.findMany({
    where: { id: { in: pageIds } },
    select: {
      id: true,
      slug: true,
      name: true,
      image: true,
      priceCents: true,
      compareAtPriceCents: true,
      saleEndsAt: true,
      stock: true,
      published: true,
      colors: { orderBy: { sortOrder: "asc" as const }, select: { name: true, hex: true } },
      categoryId: true,
      category: { select: { name: true } },
      // `slug` so the card's mark links through to the brand's listing.
      brand: { select: { name: true, slug: true, iconSvg: true, logo: true, logoTreatment: true } },
      variants: {
        select: { priceCents: true, compareAtPriceCents: true, saleEndsAt: true, stock: true },
      },
    },
  });

  const rowsById = new Map(pageRows.map((row) => [row.id, row]));
  const products = pageIds
    .map((id) => rowsById.get(id))
    .filter((row) => row !== undefined);

  // Ratings for exactly the products on screen, in one grouped query — or the
  // set already fetched for the ranking, which covers them.
  const ratings = rankingRatings ?? (await getRatings(pageIds));

  /** Facet href that keeps every other active filter. */
  const facetHref = (next: {
    category?: string;
    brand?: string;
    specs?: SpecSelection;
    /**
     * Omitted by every facet link on purpose: changing a filter changes the
     * result set, so page 4 of the old one is meaningless. Leaving it out
     * returns to page 1, which is where a newly narrowed list starts.
     */
    page?: number;
  }) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);

    const nextCategory = "category" in next ? next.category : category;
    const nextBrand = "brand" in next ? next.brand : brand;
    if (nextCategory) search.set("category", nextCategory);
    if (nextBrand) search.set("brand", nextBrand);

    // `append`, not `set`: a label can carry several selected values.
    for (const param of toSpecParams(next.specs ?? specSelection)) {
      search.append("spec", param);
    }

    if (sort !== defaultSort) search.set("sort", sort);
    if (params.min) search.set("min", params.min);
    if (params.max) search.set("max", params.max);
    if (inStockOnly) search.set("stock", "in");
    if (onSaleOnly) search.set("sale", "1");
    // Page 1 is the default, so it stays out of the URL — a bare /products and
    // /products?page=1 should not be two addresses for one page.
    if (next.page && next.page > 1) search.set("page", String(next.page));
    const qs = search.toString();
    return qs ? `/products?${qs}` : "/products";
  };

  // Hrefs are resolved here rather than in the client component: each one
  // carries every other active filter, and a callback cannot be handed across
  // the server/client boundary.
  const filterCategories: FilterCategory[] = categoryTree.map((parent) => ({
    id: parent.id,
    name: parent.name,
    slug: parent.slug,
    href: facetHref({ category: parent.slug }),
    children: parent.children.map((child) => ({
      id: child.id,
      name: child.name,
      slug: child.slug,
      href: facetHref({ category: child.slug }),
      children: [],
    })),
  }));

  // Hrefs are resolved on the server for the same reason the category ones
  // are: each carries every other active filter, and a callback cannot cross
  // the server/client boundary.
  const specGroups: SpecFilterGroup[] = specFacets.map((facet) => ({
    key: facet.key,
    label: facet.label,
    icon: facet.icon,
    options: facet.options.map((option) => ({
      ...option,
      href: facetHref({
        specs: toggleSpec(specSelection, facet.key, option.valueKey),
      }),
    })),
    clearHref: specSelection.has(facet.key)
      ? facetHref({ specs: clearSpec(specSelection, facet.key) })
      : null,
  }));

  const selectedSpecCount = countSelected(specSelection);

  const brandItems: BrandBarItem[] = brands.map((b) => ({
    slug: b.slug,
    name: b.name,
    iconSvg: b.iconSvg,
    logo: b.logo,
    logoTreatment: b.logoTreatment,
    href: facetHref({ brand: b.slug }),
  }));

  const filtersActive =
    Boolean(query || brand || minCents !== undefined || maxCents !== undefined) ||
    inStockOnly ||
    selectedSpecCount > 0;

  // The node being browsed, plus its parent, so the eyebrow can show where in
  // the tree we are — "Laptops" above "Workstations".
  const activeCategory = category
    ? categoryTree
        .flatMap((parent) => [parent, ...parent.children])
        .find((node) => node.slug === category)
    : undefined;
  const activeParent = activeCategory?.parentId
    ? categoryTree.find((parent) => parent.id === activeCategory.parentId)
    : undefined;

  /**
   * Header copy, in the home page's two-tone shape: a plain lead-in and a
   * display-serif accent. "Shop" is used as the lead-in because it stays
   * grammatical whatever a category happens to be called.
   */
  const heading = query
    ? { eyebrow: "Search results", icon: "search", lead: "Results for", accent: `“${query}”` }
    : activeCategory
      ? {
          eyebrow: activeParent?.name ?? "Shop by category",
          icon: "category",
          lead: "Shop",
          accent: activeCategory.name,
        }
      : { eyebrow: "All products", icon: "storefront", lead: "The full", accent: "catalogue." };

  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <Navbar {...nav} />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {/* Same typographic system as the home page hero — eyebrow in spaced
            small caps, then a two-tone headline whose accent is the display
            serif on a primary-to-tertiary gradient. Scaled down from the home
            page's 7xl, because this one sits directly above a filter toolbar
            rather than owning the viewport. */}
        <p className="animate-rise eyebrow text-primary flex items-center gap-2">
          <Icon name={heading.icon} size={16} filled />
          {heading.eyebrow}
        </p>

        <h1 className="animate-rise rise-2 text-on-surface text-headline-lg sm:text-display-sm mt-4 max-w-3xl">
          {heading.lead}{" "}
          <span className="accent-word">
            {heading.accent}
          </span>
        </h1>

        <div className="mt-6">
          <ProductFilters
            initial={{
              q: query ?? "",
              sort,
              min: params.min ?? "",
              max: params.max ?? "",
              inStock: inStockOnly,
              onSale: onSaleOnly,
              category: category ?? "",
            }}
          />
        </div>

        <nav aria-label="Categories">
          <CategoryFilter
            categories={filterCategories}
            active={category ?? ""}
            allHref={facetHref({ category: undefined })}
          />
        </nav>

        <BrandBar
          brands={brandItems}
          active={brand ?? ""}
          allHref={facetHref({ brand: undefined })}
        />

        {/* Specs sit in a column beside the grid rather than above it: there
            can be a dozen labels with several values each, which as another
            row of chips would push the first product off the screen. */}
        <div className="mt-6 flex flex-col gap-8 lg:flex-row">
          <SpecSidebar
            groups={specGroups}
            scope={activeCategory?.name ?? null}
            clearAllHref={selectedSpecCount > 0 ? facetHref({ specs: new Map() }) : null}
            activeCount={selectedSpecCount}
          />

          <div className="min-w-0 flex-1">
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {/* The whole result set, not the page — a shopper filtering down
                  is asking how many matched, and "24 products" on every page of
                  a hundred answers nothing. The range says where they are. */}
              <p className="text-on-surface-variant text-sm" aria-live="polite">
                {totalProducts} product{totalProducts === 1 ? "" : "s"}
                {totalPages > 1 && (
                  <>
                    {" · showing "}
                    {(currentPage - 1) * PAGE_SIZE + 1}–
                    {(currentPage - 1) * PAGE_SIZE + products.length}
                  </>
                )}
              </p>

              {/* Teaches the affordance rather than leaving the absent
                  sidebar unexplained. */}
              {!specsInScope && (
                <p className="text-on-surface-variant text-sm">
                  · Pick a category above to filter by specification
                </p>
              )}
            </div>

            {products.length === 0 ? (
              <Card variant="outlined">
                <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                  <Icon
                    name={filtersActive ? "filter_alt_off" : "inventory_2"}
                    size={40}
                    className="text-on-surface-variant"
                  />
                  <p className="text-on-surface">
                    {filtersActive ? "No products match" : "Nothing here yet"}
                  </p>
                  <p className="text-on-surface-variant max-w-sm text-sm">
                    {filtersActive
                      ? "Try widening the price range or clearing some filters."
                      : category
                        ? "No published products in this category."
                        : "No published products yet. An admin can add one from the dashboard."}
                  </p>
                  {filtersActive && (
                    <Link
                      href="/products"
                      className="text-primary rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      Clear all filters
                    </Link>
                  )}
                </CardContent>
              </Card>
            ) : (
              <ul className="stagger grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                {products.map((product) => (
                  <li key={product.slug}>
                    <ProductCard
                      product={{
                        ...product,
                        compareGroup: product.categoryId
                          ? (rootCategories.get(product.categoryId) ?? null)
                          : null,
                        rating: ratings.get(product.id) ?? null,
                      }}
                      wishlisted={wishlistIds.has(product.id)}
                      comparable
                    />
                  </li>
                ))}
              </ul>
            )}

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              hrefFor={(page) => facetHref({ page })}
            />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
