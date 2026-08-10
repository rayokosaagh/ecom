import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { FilterPills } from "@/components/admin/FilterPills";
import { ListToolbar } from "@/components/admin/ListToolbar";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { requireAdmin } from "@/lib/auth/dal";
import { getOrderCounts, getOrdersForAdmin } from "@/lib/orders/service";
import { formatPrice } from "@/lib/products/format";
import { OrderStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Orders" };

const STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.PAID,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
] as const;

function isStatus(value: string | undefined): value is OrderStatus {
  return STATUSES.includes(value as OrderStatus);
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  // The layout checks the session, but layouts do not re-render on every
  // navigation — so the page enforces the admin gate itself.
  await requireAdmin();

  const params = await searchParams;
  const active = isStatus(params.status) ? params.status : undefined;
  const query = params.q?.trim() ?? "";

  const [orders, counts] = await Promise.all([
    getOrdersForAdmin(active, query),
    getOrderCounts(query),
  ]);

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">Orders</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          {total === 0
            ? "Orders placed through checkout arrive here."
            : `${counts[OrderStatus.PENDING] ?? 0} awaiting payment · ${
                counts[OrderStatus.PAID] ?? 0
              } to ship`}
        </p>
      </div>

      <ListToolbar
        searchLabel="Search by customer, email, city or order ref"
        alsoClear={["status"]}
      />

      {/* Same pill language as the storefront's brand and category rails. */}
      <FilterPills
        label="Filter by status"
        param="status"
        basePath="/admin/orders"
        params={params}
        options={[
          { value: "", label: "All", count: total },
          ...STATUSES.map((value) => ({
            value,
            label: value.charAt(0) + value.slice(1).toLowerCase(),
            count: counts[value] ?? 0,
          })),
        ]}
      />

      {orders.length === 0 ? (
        <Card variant="outlined">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon
              name={query ? "search_off" : "receipt_long"}
              size={40}
              className="text-on-surface-variant"
            />
            <p className="text-on-surface">
              {query
                ? `Nothing matches “${query}”`
                : active
                  ? `No ${active.toLowerCase()} orders`
                  : "No orders yet"}
            </p>
            <p className="text-on-surface-variant max-w-sm text-sm">
              {query
                ? "Searches cover the customer's name and email, the shipping city and country, the phone number, and the start of the order reference."
                : active
                  ? "Nothing is sitting in this state right now."
                  : "Every order placed through checkout shows up here, ready to be paid off and shipped."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/admin/orders/${order.id}`}
                className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Card variant="outlined" interactive>
                  <div className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-on-surface truncate text-sm font-medium">
                        {order.shippingName ?? order.user.name ?? order.user.email}
                      </p>
                      <p className="text-on-surface-variant mt-0.5 truncate text-xs">
                        {order.user.email}
                        {order.shippingCity && ` · ${order.shippingCity}`}
                        {order.shippingCountry && `, ${order.shippingCountry}`}
                      </p>
                      <p className="text-on-surface-variant mt-1 text-xs">
                        {order._count.items} item{order._count.items === 1 ? "" : "s"} ·{" "}
                        {order.createdAt.toLocaleDateString("en-US", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>

                    <p className="text-on-surface shrink-0 text-sm">
                      {formatPrice(order.totalCents)}
                    </p>
                    <OrderStatusBadge status={order.status} />
                    <Icon
                      name="chevron_right"
                      size={18}
                      className="text-on-surface-variant shrink-0"
                    />
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
