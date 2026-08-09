import type { Metadata } from "next";

import { FilterPills } from "@/components/admin/FilterPills";
import { BarList } from "@/components/charts/BarList";
import { ChartCard, Legend } from "@/components/charts/ChartCard";
import { StackedBar } from "@/components/charts/StackedBar";
import { TrendChart, type TrendPoint } from "@/components/charts/TrendChart";
import { InventoryCard } from "@/components/dashboard/InventoryCard";
import { RecentOrders } from "@/components/dashboard/RecentOrders";
import { StatTile } from "@/components/dashboard/StatTile";
import { pipelineSegments } from "@/components/dashboard/pipeline";
import { requireUser } from "@/lib/auth/dal";
import { getAdminOverview, getCustomerOverview } from "@/lib/dashboard/metrics";
import {
  RANGE_DAYS,
  RANGE_PARAM,
  formatCompactMoney,
  formatDayFull,
  formatDayLabel,
  parseRange,
  type RangeDays,
} from "@/lib/dashboard/range";
import { formatPrice } from "@/lib/products/format";
import { Role } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Overview · Ecom" };

/** Points for a trend chart: the value, plus both forms of its date. */
function trendPoints(days: Date[], series: number[]): TrendPoint[] {
  return days.map((day, i) => ({
    label: formatDayLabel(day),
    full: formatDayFull(day),
    value: series[i] ?? 0,
  }));
}

/** The chart's numbers as text, for the table every chart card carries. */
function trendTable(
  days: Date[],
  series: number[],
  previous: number[],
  format: (value: number) => string,
) {
  return days.map((day, i) => [
    formatDayFull(day),
    format(series[i] ?? 0),
    format(previous[i] ?? 0),
  ]);
}

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const range = parseRange(params[RANGE_PARAM]);

  const greeting = (
    <div>
      <h2 className="text-on-surface text-2xl font-normal">
        Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}
      </h2>
      <p className="text-on-surface-variant mt-1 text-sm">
        {user.role === Role.ADMIN
          ? `How the store has done over the last ${range} days.`
          : `Your account over the last ${range} days.`}
      </p>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {greeting}
        <RangeFilter range={range} />
      </div>

      {user.role === Role.ADMIN ? (
        <StoreOverview range={range} />
      ) : (
        <AccountOverview userId={user.id} range={range} />
      )}
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

/**
 * The same page for a customer.
 *
 * The overview is reachable by every signed-in account, so it shows the shop's
 * numbers to an admin and the reader's own to everyone else. The two are not
 * the same page with figures hidden — they are different queries, scoped by
 * user id in `getCustomerOverview`.
 */
async function AccountOverview({ userId, range }: { userId: string; range: RangeDays }) {
  const data = await getCustomerOverview(userId, range);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Spent"
          value={formatCompactMoney(data.spend.total)}
          delta={data.spend.delta}
          trend={data.spend.series}
          icon="payments"
        />
        <StatTile
          label="Orders placed"
          value={data.placed.total.toLocaleString("en-US")}
          delta={data.placed.delta}
          trend={data.placed.series}
          icon="receipt_long"
        />
        <StatTile
          label="Wishlist"
          value={data.wishlist.toLocaleString("en-US")}
          delta={null}
          icon="favorite"
          noteWhenNoDelta="All time"
        />
        <StatTile
          label="Reviews written"
          value={data.reviews.toLocaleString("en-US")}
          delta={null}
          icon="reviews"
          noteWhenNoDelta="All time"
        />
      </div>

      <ChartCard
        title="Your spending"
        description={`Paid and shipped orders. ${formatPrice(data.lifetime.spentCents)} across ${data.lifetime.orders} order${data.lifetime.orders === 1 ? "" : "s"} all time.`}
        aside={
          <Legend
            entries={[
              { label: "This period", color: "var(--color-chart-accent)", shape: "line" },
              { label: `Previous ${range} days`, color: "var(--color-chart-muted)", shape: "line" },
            ]}
          />
        }
        table={{
          caption: `Spending by day, with the previous ${range} days for comparison`,
          columns: ["Day", "Spent", "Previous"],
          rows: trendTable(
            data.days,
            data.spend.series,
            data.spend.previousSeries,
            formatPrice,
          ),
        }}
      >
        <TrendChart
          points={trendPoints(data.days, data.spend.series)}
          comparison={data.spend.previousSeries}
          format="money"
          seriesLabel="Spending"
          comparisonLabel={`Previous ${range} days`}
        />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Your orders"
          description={`Everything you placed in the last ${range} days, by state.`}
          table={{
            caption: "Your orders by status",
            columns: ["Status", "Orders"],
            rows: pipelineSegments(data.pipeline).map((segment) => [
              segment.label,
              segment.value.toLocaleString("en-US"),
            ]),
          }}
        >
          <StackedBar
            segments={pipelineSegments(data.pipeline)}
            emptyMessage="You have not ordered in this period."
          />
        </ChartCard>

        <RecentOrders
          orders={data.recent}
          href="/orders"
          emptyMessage="Your orders will appear here."
        />
      </div>
    </>
  );
}
