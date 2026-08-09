import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { formatPrice } from "@/lib/products/format";
import { orderReference } from "@/lib/orders/reference";
import type { OrderStatus } from "@/generated/prisma/enums";

export interface RecentOrderRow {
  id: string;
  createdAt: Date;
  status: OrderStatus;
  totalCents: number;
  user?: { name: string | null; email: string } | null;
}

/**
 * The last few orders, as a list rather than a chart.
 *
 * Five rows of "who, how much, what state" is not data to be plotted — it is
 * data to be read, and then clicked. The charts above say how the week went;
 * this says what just happened.
 */
export function RecentOrders({
  orders,
  href,
  emptyMessage,
}: {
  orders: RecentOrderRow[];
  /** Where "View all" goes — the admin list, or the customer's own. */
  href: string;
  emptyMessage: string;
}) {
  return (
    <Card variant="outlined">
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-on-surface text-base font-medium">Recent orders</h3>
          <Link
            href={href}
            className="text-primary inline-flex items-center gap-1 rounded-sm text-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            View all
            <Icon name="chevron_right" size={16} />
          </Link>
        </div>

        {orders.length === 0 ? (
          <p className="text-on-surface-variant py-6 text-center text-sm">{emptyMessage}</p>
        ) : (
          <ul className="divide-outline-variant/50 divide-y">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`${href}/${order.id}`}
                  className="state-layer -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-on-surface truncate text-sm font-medium">
                      {order.user ? (order.user.name ?? order.user.email) : `#${orderReference(order.id)}`}
                    </p>
                    <p className="text-on-surface-variant text-xs">
                      {order.user && <span className="tabular-nums">#{orderReference(order.id)} · </span>}
                      {order.createdAt.toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                  <OrderStatusBadge status={order.status} />
                  <span className="text-on-surface shrink-0 text-sm font-medium tabular-nums">
                    {formatPrice(order.totalCents)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
