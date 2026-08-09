import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { BannerForm } from "@/components/banners/BannerForm";
import { requireAdmin } from "@/lib/auth/dal";
import { getFlatCategories } from "@/lib/categories/tree";
import { getBannerById } from "@/lib/banners/service";
import { toDateTimeLocal } from "@/lib/banners/format";
import { updateBanner } from "@/lib/actions/banners";

export const metadata: Metadata = { title: "Edit banner" };

export default async function EditBannerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const [banner, categories] = await Promise.all([
    getBannerById(id),
    getFlatCategories(),
  ]);

  if (!banner) notFound();

  // The action needs the id, but `useActionState` only supplies (state,
  // formData) — so it is bound here on the server rather than round-tripped
  // through a hidden input a client could tamper with.
  const action = updateBanner.bind(null, banner.id);

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
        <h2 className="text-on-surface mt-2 text-2xl font-normal">Edit banner</h2>
      </div>

      <BannerForm
        action={action}
        categories={categories}
        values={{
          imageUrl: banner.imageUrl,
          heading: banner.heading,
          subtext: banner.subtext ?? "",
          ctaLabel: banner.ctaLabel,
          ctaLink: banner.ctaLink,
          isActive: banner.isActive,
          categoryId: banner.categoryId ?? "",
          startsAt: toDateTimeLocal(banner.startsAt),
          endsAt: toDateTimeLocal(banner.endsAt),
        }}
      />
    </div>
  );
}
