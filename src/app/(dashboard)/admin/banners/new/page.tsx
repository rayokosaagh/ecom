import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { BannerForm } from "@/components/banners/BannerForm";
import { requireAdmin } from "@/lib/auth/dal";
import { getFlatCategories } from "@/lib/categories/tree";
import { createBanner } from "@/lib/actions/banners";

export const metadata: Metadata = { title: "New banner" };

export default async function NewBannerPage() {
  await requireAdmin();

  // Offered as ready-made CTA destinations; the banner itself stores only the
  // resulting URL, so deleting a category never breaks the model.
  const categories = await getFlatCategories();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/banners"
          className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="arrow_back" size={18} />
          Banners
        </Link>
        <h2 className="text-on-surface mt-2 text-2xl font-normal">New banner</h2>
      </div>

      <BannerForm
        action={createBanner}
        categories={categories}
        submitLabel="Create banner"
      />
    </div>
  );
}
