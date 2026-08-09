import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { OrderDetail } from "@/components/orders/OrderDetail";
import { OrderStatusActions } from "@/components/orders/OrderStatusActions";
import { requireAdmin } from "@/lib/auth/dal";
import { getOrder } from "@/lib/orders/service";
import { allowedTransitions } from "@/lib/orders/transitions";

export const metadata: Metadata = { title: "Order" };

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  // No user scope here — an admin reads any order, which is the difference
  // between this page and the customer's receipt.
  const order = await getOrder(id);
  if (!order) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/orders"
          className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="arrow_back" size={18} />
          Orders
        </Link>
        <h2 className="text-on-surface mt-2 text-2xl font-normal">
          {order.shippingName ?? order.user.name ?? order.user.email}
        </h2>
        {/* Who, not when — the ticket below carries the date. */}
        <p className="text-on-surface-variant mt-1 text-sm">{order.user.email}</p>
      </div>

      <OrderDetail
        order={order}
        // The dashboard's content area is `bg-surface`, which is all but
        // white — the default ticket surface would disappear into it.
        surface="bg-surface-container-low"
        actions={
          <OrderStatusActions
            orderId={order.id}
            status={order.status}
            // Renames the forward move: "Mark collected" on an order nobody is
            // shipping anywhere.
            fulfilment={order.fulfilment}
            // Decided on the server so the UI cannot offer a move the action
            // would refuse.
            transitions={allowedTransitions(order.status)}
            // Same override as the ticket above it, and for the same reason —
            // the two are one object and must sit on one surface.
            surface="bg-surface-container-low"
          />
        }
      />
    </div>
  );
}
