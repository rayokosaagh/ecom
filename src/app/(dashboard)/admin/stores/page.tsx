import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { StoreList, type StoreRow } from "@/components/stores/StoreList";
import { requireAdmin } from "@/lib/auth/dal";
import { getStoreLocationsForAdmin } from "@/lib/stores/service";

export const metadata: Metadata = { title: "Stores" };

export default async function AdminStoresPage() {
  // The layout checks the session, but layouts do not re-render on every
  // navigation — so the page enforces the admin gate itself.
  await requireAdmin();

  const rows: StoreRow[] = await getStoreLocationsForAdmin();
  const live = rows.filter((row) => row.published).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-on-surface text-2xl font-normal">Stores</h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            {rows.length === 0
              ? "Branches customers can visit, listed at /stores."
              : `${live} of ${rows.length} showing at /stores.`}
          </p>
        </div>

        <Link
          href="/admin/stores/new"
          className="bg-primary text-on-primary state-layer inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
        >
          <Icon name="add" size={18} />
          Add store
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card variant="outlined">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon name="storefront" size={40} className="text-on-surface-variant" />
            <p className="text-on-surface">No stores yet</p>
            <p className="text-on-surface-variant max-w-sm text-sm">
              Add the branches people can walk into. The Stores page shows an
              empty state until there is at least one published, so nothing is
              promised that does not exist.
            </p>
          </CardContent>
        </Card>
      ) : (
        <StoreList rows={rows} />
      )}
    </div>
  );
}
