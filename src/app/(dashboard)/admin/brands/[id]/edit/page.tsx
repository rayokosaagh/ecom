import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { BrandForm } from "@/components/brands/BrandForm";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { updateBrand } from "@/lib/actions/brands";

export const metadata: Metadata = { title: "Edit brand" };

export default async function EditBrandPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const brand = await prisma.brand.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      iconSvg: true,
      logo: true,
      logoTreatment: true,
    },
  });

  if (!brand) notFound();

  // The action needs the id, but `useActionState` only supplies (state,
  // formData) — so it is bound here on the server rather than round-tripped
  // through a hidden input a client could tamper with.
  const action = updateBrand.bind(null, brand.id);

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
        <h2 className="text-on-surface mt-2 text-2xl font-normal">Edit brand</h2>
      </div>

      <BrandForm
        action={action}
        values={{
          name: brand.name,
          slug: brand.slug,
          iconSvg: brand.iconSvg ?? "",
          logo: brand.logo ?? "",
          logoTreatment: brand.logoTreatment,
        }}
      />
    </div>
  );
}
