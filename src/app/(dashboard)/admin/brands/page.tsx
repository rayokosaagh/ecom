import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { BrandList, type BrandRow } from "@/components/brands/BrandList";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Brands" };

export default async function AdminBrandsPage() {
  // The layout checks the session, but layouts do not re-render on every
  // navigation — so the page enforces the admin gate itself.
  await requireAdmin();

  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      iconSvg: true,
      logo: true,
      _count: { select: { products: true } },
    },
  });

  const rows: BrandRow[] = brands.map((brand) => ({
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    iconSvg: brand.iconSvg,
    logo: brand.logo,
    productCount: brand._count.products,
  }));

  // Counts anything that renders, not just vectors — a brand with only a hosted
  // logo is not one of the ones still needing artwork.
  const withMarks = rows.filter((row) => row.iconSvg || row.logo).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-on-surface text-2xl font-normal">Brands</h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            {rows.length === 0
              ? "Manufacturers, and the marks shown beside their products."
              : `${withMarks} of ${rows.length} have a mark.`}
          </p>
        </div>

        <Link
          href="/admin/brands/new"
          className="bg-primary text-on-primary state-layer inline-flex h-10 items-center gap-2 rounded-full px-6 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
        >
          <Icon name="add" size={18} />
          Add brand
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card variant="outlined">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon name="sell" size={40} className="text-on-surface-variant" />
            <p className="text-on-surface">No brands yet</p>
            <p className="text-on-surface-variant max-w-sm text-sm">
              Brands are also created on the fly from the product form. Adding
              one here lets you give it a mark at the same time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <BrandList brands={rows} />
      )}
    </div>
  );
}
