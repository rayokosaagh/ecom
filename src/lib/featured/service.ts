import "server-only";

import { prisma } from "@/lib/prisma";
import type { LogoTreatment } from "@/generated/prisma/enums";
import { priceRange, availableStock } from "@/lib/products/variants";

export interface FeaturedProductView {
  id: string;
  slug: string;
  name: string;
  description: string;
  image: string | null;
  brand: {
    name: string;
    iconSvg: string | null;
    logo: string | null;
    /** How dark mode treats a hosted logo. See `lib/brands/logo-format`. */
    logoTreatment?: LogoTreatment | null;
  } | null;
  category: string | null;
  /** Formatted by the caller; cents here so the component owns presentation. */
  minCents: number;
  priceVaries: boolean;
  soldOut: boolean;
  /**
   * Resolved on the server. A client-side date check would compare the
   * visitor's clock against a server timestamp, so a skewed machine would
   * disagree with the page it was served.
   */
  isNew: boolean;
  /** A few headline specs, in definition order. */
  specs: { label: string; value: string; icon: string | null }[];
  /**
   * The background wash an admin chose, as a preset id from `lib/tints`, or
   * null when nobody has chosen one.
   *
   * Passed through raw rather than resolved to classes here: which id maps to
   * which utilities is a presentation decision, and a service that returned
   * Tailwind strings would make the storefront's styling unchangeable without
   * a database read to check what it had already been told.
   */
  tint: string | null;
}

/** How many specs the showcase lists before it stops being a summary. */
const SHOWCASE_SPECS = 3;

/** How long a product wears the "New" badge. */
const NEW_FOR_DAYS = 30;

/**
 * The curated home page showcase.
 *
 * Unpublished products are dropped rather than hidden by the query alone: an
 * admin can feature something and unpublish it later, and the storefront must
 * not resurrect a draft because a stale row still points at it.
 *
 * Specs come from the same two places everything else reads — fixed specs and
 * variant axes — so a machine sold in several configurations shows its range
 * here exactly as it does on the comparison table.
 */
export async function getFeaturedProducts(): Promise<FeaturedProductView[]> {
  const rows = await prisma.featuredProduct.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      tint: true,
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          image: true,
          priceCents: true,
          stock: true,
          published: true,
          createdAt: true,
          // `slug` so the card's mark links through to the brand's listing.
          brand: { select: { name: true, slug: true, iconSvg: true, logo: true, logoTreatment: true } },
          category: { select: { name: true } },
          variants: { select: { priceCents: true, stock: true } },
          specs: {
            orderBy: { definition: { sortOrder: "asc" } },
            take: SHOWCASE_SPECS,
            select: {
              value: true,
              definition: { select: { label: true, unit: true, icon: true } },
            },
          },
        },
      },
    },
  });

  const newerThan = Date.now() - NEW_FOR_DAYS * 24 * 60 * 60 * 1000;

  // Filtered before the product is unwrapped rather than after: `tint` lives on
  // the FeaturedProduct row, not on the product, so mapping to `row.product`
  // first would drop it.
  return rows
    .filter((row) => row.product.published)
    .map(({ tint, product }) => {
      const range = priceRange(product, product.variants);
      return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        description: product.description,
        image: product.image,
        brand: product.brand,
        category: product.category?.name ?? null,
        minCents: range.minCents,
        priceVaries: range.varies,
        soldOut: availableStock(product, product.variants) === 0,
        isNew: product.createdAt.getTime() >= newerThan,
        specs: product.specs.map((spec) => ({
          label: spec.definition.label,
          value: spec.definition.unit
            ? `${spec.value} ${spec.definition.unit}`
            : spec.value,
          icon: spec.definition.icon,
        })),
        tint,
      };
    });
}

/** Rows for the admin list, including drafts so their state is visible there. */
export async function getFeaturedForAdmin() {
  return prisma.featuredProduct.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      tint: true,
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          image: true,
          published: true,
          priceCents: true,
          brand: { select: { name: true } },
        },
      },
    },
  });
}

/** Products not yet featured, for the picker. */
export async function getFeaturableProducts() {
  return prisma.product.findMany({
    where: { featured: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      published: true,
      brand: { select: { name: true } },
    },
  });
}
