import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { FlashSaleForm } from "@/components/flash/FlashSaleForm";
import { requireAdmin } from "@/lib/auth/dal";
import { createFlashSale } from "@/lib/actions/flash";

export const metadata: Metadata = { title: "New flash sale" };

export default async function NewFlashSalePage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/flash-sales"
          className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="arrow_back" size={18} />
          Flash sales
        </Link>
        <h2 className="text-on-surface mt-2 text-2xl font-normal">
          New flash sale
        </h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          Products are chosen next, once the sale exists.
        </p>
      </div>

      <FlashSaleForm action={createFlashSale} submitLabel="Create sale" />
    </div>
  );
}
