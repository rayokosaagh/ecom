import "server-only";

import { prisma } from "@/lib/prisma";
import type { LogoTreatment } from "@/generated/prisma/enums";

/**
 * Reads for brand-as-destination surfaces.
 *
 * The brand *facet* on the catalogue computes its own counts, narrowed by
 * whatever else is filtered at the time — see `app/products/page`. This module
 * is the other thing: brands as somewhere to go from, counted against the whole
 * published catalogue rather than a filtered view of it.
 */

export type BrandSummary = {
  slug: string;
  name: string;
  iconSvg: string | null;
  /** Hosted image URL, used only where there is no `iconSvg`. */
  logo: string | null;
  /** How dark mode treats that image. See `lib/brands/logo-format`. */
  logoTreatment: LogoTreatment;
};

/**
 * Brands that have something to show, deepest catalogue first.
 *
 * Only brands with at least one published product: a mark that leads to an
 * empty listing is worse than no mark, and an admin who has set a brand up
 * ahead of its stock should not have it advertised yet.
 *
 * Ordered by how much the shop actually carries rather than alphabetically. A
 * strip with room for a dozen should spend that room on the brands the
 * catalogue is deepest in — alphabetical would hand the front of the rail to
 * whoever starts with "A". Name breaks ties so the order is stable between
 * requests rather than left to whatever the database returns.
 */
export async function getShoppableBrands(limit?: number): Promise<BrandSummary[]> {
  const rows = await prisma.brand.findMany({
    where: { products: { some: { published: true } } },
    select: {
      slug: true,
      name: true,
      iconSvg: true,
      logo: true,
      logoTreatment: true,
      _count: { select: { products: { where: { published: true } } } },
    },
  });

  // The count is still queried, and still decides the order — it is just no
  // longer returned. The strip shows a mark and a name; a tally under each one
  // was a number with nothing to compare itself against, and it is the depth of
  // the catalogue behind a brand that earns it a place on the rail, not a
  // figure the shopper has to read.
  const brands = rows
    .sort(
      (a, b) => b._count.products - a._count.products || a.name.localeCompare(b.name),
    )
    .map(({ _count, ...brand }) => brand);

  return limit === undefined ? brands : brands.slice(0, limit);
}
