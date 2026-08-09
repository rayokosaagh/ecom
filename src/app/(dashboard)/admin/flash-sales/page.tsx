import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import {
  FlashSaleList,
  type FlashSaleListRow,
} from "@/components/flash/FlashSaleList";
import { requireAdmin } from "@/lib/auth/dal";
import { getFlashSalesForAdmin } from "@/lib/flash/service";

export const metadata: Metadata = { title: "Flash sales" };

const WINDOW_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default async function AdminFlashSalesPage() {
  // The layout checks the session, but layouts do not re-render on every
  // navigation — so the page enforces the admin gate itself.
  await requireAdmin();

  // Reconciles as it reads, so a sale that opened or closed since the last
  // request is shown in the state it is actually in.
  const sales = await getFlashSalesForAdmin();

  const rows: FlashSaleListRow[] = sales.map((sale) => ({
    id: sale.id,
    name: sale.name,
    percentOff: sale.percentOff,
    windowLabel: `${WINDOW_FORMAT.format(sale.startsAt)} → ${WINDOW_FORMAT.format(sale.endsAt)}`,
    active: sale.active,
    productCount: sale.productCount,
    status: sale.status,
  }));

  const live = rows.filter((row) => row.status === "LIVE").length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-on-surface text-2xl font-normal">Flash sales</h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            {rows.length === 0
              ? "Time-boxed sales that lower real prices and put them back."
              : live > 0
                ? `${live} running now, ${rows.length} in total.`
                : `${rows.length} set up, none running.`}
          </p>
        </div>

        <Link
          href="/admin/flash-sales/new"
          className="bg-primary text-on-primary state-layer inline-flex h-10 items-center gap-2 rounded-full px-6 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
        >
          <Icon name="add" size={18} />
          New flash sale
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card variant="outlined">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon name="bolt" size={40} className="text-on-surface-variant" />
            <p className="text-on-surface">No flash sales yet</p>
            <p className="text-on-surface-variant max-w-md text-sm">
              A flash sale actually lowers the prices of the products in it for
              a set window, then restores them — so the cart and the checkout
              charge the sale price without anything else changing. For a
              standing discount on one product, set its “was” price on the
              product form instead.
            </p>
          </CardContent>
        </Card>
      ) : (
        <FlashSaleList rows={rows} />
      )}
    </div>
  );
}
