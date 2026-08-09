import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { BrandForm } from "@/components/brands/BrandForm";
import { requireAdmin } from "@/lib/auth/dal";
import { createBrand } from "@/lib/actions/brands";

export const metadata: Metadata = { title: "New brand" };

export default async function NewBrandPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/brands"
          className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="arrow_back" size={18} />
          Brands
        </Link>
        <h2 className="text-on-surface mt-2 text-2xl font-normal">New brand</h2>
      </div>

      <BrandForm action={createBrand} submitLabel="Create brand" />
    </div>
  );
}
