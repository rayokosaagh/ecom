import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FilterPills } from "@/components/admin/FilterPills";
import { BarList } from "@/components/charts/BarList";
import { ChartCard, Legend } from "@/components/charts/ChartCard";
import { StackedBar } from "@/components/charts/StackedBar";
import { TrendChart } from "@/components/charts/TrendChart";
import { InventoryCard } from "@/components/dashboard/InventoryCard";
import { RecentOrders } from "@/components/dashboard/RecentOrders";
import { StatTile } from "@/components/dashboard/StatTile";
import { pipelineSegments } from "@/components/dashboard/pipeline";
import { trendPoints, trendTable } from "@/components/dashboard/trend";
import { requireUser } from "@/lib/auth/dal";
import { getAdminOverview } from "@/lib/dashboard/metrics";
import {
  RANGE_DAYS,
  RANGE_PARAM,
  formatCompactMoney,
  parseRange,
  type RangeDays,
} from "@/lib/dashboard/range";
import { formatPrice } from "@/lib/products/format";
import { Role } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Overview · Ecom" };

/**
 * The window control.
 *
 * One row, above everything it scopes — every figure on the page is for the
 * same period, so they can be read against each other without checking which
 * chart is showing what. Links rather than a client-side control, so the view
 * is in the URL and survives a refresh or a shared link.
 */
function RangeFilter({ range }: { range: RangeDays }) {
  return (
    <FilterPills
      label="Date range"
      param={RANGE_PARAM}
      basePath="/dashboard"
      // The default is stated explicitly rather than left as an absent param,
      // so the pill for the period actually being shown is the selected one.
      params={{ [RANGE_PARAM]: String(range) }}
      options={RANGE_DAYS.map((days) => ({
        value: String(days),
        label: `${days} days`,
      }))}
    />
  );
}

/**
 * The store's books.
 *
 * Customers used to land here too, on a version of the page scoped to their
 * own account. That reading now lives on /profile, in the storefront's chrome
 * rather than the console's, so a shopper is sent there instead of being shown
 * an admin sidebar to find their own orders in.
 *
 * The redirect is a courtesy, not the boundary — nothing on this page is
 * fetched before it, and the pages beneath /dashboard each hold their own gate.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (user.role !== Role.ADMIN) redirect("/profile");

  const params = await searchParams;
  const range = parseRange(params[RANGE_PARAM]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-on-surface text-2xl font-normal">
            Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            How the store has done over the last {range} days.
          </p>
        </div>
        <RangeFilter range={range} />
      </div>

      <StoreOverview range={range} />
    </div>
  );
}

/** The store's books — admins only. */
async function StoreOverview({ range }: { range: RangeDays }) {
  const data = await getAdminOverview(range);
  const comparison = `vs previous ${range} days`;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Revenue"
          value={formatCompactMoney(data.revenue.total)}
          delta={data.revenue.delta}
          trend={data.revenue.series}
          icon="payments"
        />
        <StatTile
          label="Orders"
          value={data.orders.total.toLocaleString("en-US")}
          delta={data.orders.delta}
          trend={data.orders.series}
          icon="receipt_long"
        />
        <StatTile
          label="Average order"
          value={formatCompactMoney(data.aov.total)}
          delta={data.aov.delta}
          icon="shopping_bag"
        />
        <StatTile
          label="New customers"
          value={data.customers.total.toLocaleString("en-US")}
          delta={data.customers.delta}
          trend={data.customers.series}
          icon="person_add"
        />
      </div>

      <ChartCard
        title="Revenue"
        description="Paid and shipped orders only — pending checkouts are not counted."
        aside={
          <Legend
            entries={[
              { label: "This period", color: "var(--color-chart-accent)", shape: "line" },
              { label: comparison.replace("vs ", ""), color: "var(--color-chart-muted)", shape: "line" },
            ]}
          />
        }
        table={{
          caption: `Revenue by day, with the previous ${range} days for comparison`,
          columns: ["Day", "Revenue", "Previous"],
          rows: trendTable(
            data.days,
            data.revenue.series,
            data.revenue.previousSeries,
            formatPrice,
          ),
        }}
      >
        <TrendChart
          points={trendPoints(data.days, data.revenue.series)}
          comparison={data.revenue.previousSeries}
          format="money"
          seriesLabel="Revenue"
          comparisonLabel={comparison}
        />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Order pipeline"
          description={`Every order placed in the last ${range} days, by state.`}
          table={{
            caption: "Orders by status",
            columns: ["Status", "Orders"],
            rows: pipelineSegments(data.pipeline).map((segment) => [
              segment.label,
              segment.value.toLocaleString("en-US"),
            ]),
          }}
        >
          <StackedBar
            segments={pipelineSegments(data.pipeline)}
            emptyMessage="No orders in this period yet."
          />
        </ChartCard>

        <ChartCard
          title="Top products"
          description="By revenue in this period."
          table={{
            caption: "Top products by revenue",
            columns: ["Product", "Revenue", "Units"],
            rows: data.topProducts.map((product) => [
              product.name,
              formatPrice(product.revenueCents),
              product.units.toLocaleString("en-US"),
            ]),
          }}
        >
          <BarList
            rows={data.topProducts.map((product) => ({
              label: product.name,
              value: product.revenueCents,
              display: formatPrice(product.revenueCents),
              meta: `${product.units} sold`,
              href: product.slug ? `/products/${product.slug}` : undefined,
            }))}
            emptyMessage="Nothing sold in this period yet."
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InventoryCard
          lowStock={data.inventory.lowStock}
          outOfStock={data.inventory.outOfStock}
          catalogue={data.inventory.catalogue}
          published={data.inventory.published}
          drafts={data.inventory.drafts}
        />
        <RecentOrders
          orders={data.recent}
          href="/admin/orders"
          emptyMessage="No orders yet."
        />
      </div>
    </>
  );
}
