import type { Metadata } from "next";
import Link from "next/link";

import { ProductForm } from "@/components/products/ProductForm";
import { Icon } from "@/components/ui/Icon";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { getFlatCategories } from "@/lib/categories/tree";
import { createProduct } from "@/lib/actions/products";
import { getSpecLabels } from "@/lib/specs/resolve";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireAdmin();

  const [categories, brands, specLabels] = await Promise.all([
    getFlatCategories(),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSpecLabels(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/dashboard/products"
          className="text-on-surface-variant inline-flex items-center gap-1 rounded-sm text-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="arrow_back" size={16} />
          Products
        </Link>
        <h2 className="text-on-surface mt-2 text-2xl font-normal">New product</h2>
      </div>

      <ProductForm
        action={createProduct}
        categories={categories}
        brands={brands}
        specLabels={specLabels}
        submitLabel="Create product"
      />
    </div>
  );
}
