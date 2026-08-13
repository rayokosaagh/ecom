import type { Metadata } from "next";
import Link from "next/link";

import { Navbar } from "@/components/nav/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { OrderTicket } from "@/components/orders/OrderTicket";
import { Pagination } from "@/components/products/Pagination";
import { ReorderButton } from "@/components/orders/ReorderButton";
import { requireUser } from "@/lib/auth/dal";
import { getNavData } from "@/lib/nav/data";
import { getOrderHistory, parsePage } from "@/lib/orders/history";

export const metadata: Metadata = { title: "Orders" };

/** Deeper than the profile's summary, which is the reason to come here. */
const PER_PAGE = 10;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ placed?: string; page?: string }>;
}) {
  const user = await requireUser();
  const [params, nav] = await Promise.all([searchParams, getNavData()]);
  const { placed } = params;

  const { orders, page, totalPages, total } = await getOrderHistory(
    user.id,
    parsePage(params.page),
    PER_PAGE,
  );

  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <Navbar {...nav} />

      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-on-surface text-headline-md">Orders</h1>
        <p className="text-on-surface-variant mt-1 text-sm">
          {total === 0
            ? "Nothing here yet."
            : `${total} order${total === 1 ? "" : "s"} — tap a ticket for the full receipt.`}
        </p>

        {total === 0 ? (
          <Card variant="outlined" className="mt-8">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Icon name="receipt_long" size={40} className="text-on-surface-variant" />
              <p className="text-on-surface">No orders yet</p>
              <Link
                href="/products"
                className="bg-primary text-on-primary state-layer mt-2 inline-flex h-10 items-center rounded-full px-6 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Browse products
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            <ul className="mt-8 space-y-4">
              {orders.map((order) => (
                <li key={order.id} className="space-y-2">
                  {/* `placed` still carries an order id on links from before
                      checkout started redirecting to the receipt. */}
                  <OrderTicket order={order} highlighted={placed === order.id} />
                  <div className="flex justify-end">
                    <ReorderButton orderId={order.id} />
                  </div>
                </li>
              ))}
            </ul>

            <Pagination
              currentPage={page}
              totalPages={totalPages}
              hrefFor={(next) => (next === 1 ? "/orders" : `/orders?page=${next}`)}
            />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
