import type { Metadata } from "next";
import Link from "next/link";

import { Navbar } from "@/components/nav/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { OrderTicket } from "@/components/orders/OrderTicket";
import { requireUser } from "@/lib/auth/dal";
import { getNavData } from "@/lib/nav/data";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ placed?: string }>;
}) {
  const user = await requireUser();
  const [{ placed }, nav] = await Promise.all([searchParams, getNavData()]);

  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      totalCents: true,
      createdAt: true,
      fulfilment: true,
      shippingCity: true,
      shippingCountry: true,
      items: {
        select: {
          id: true,
          name: true,
          quantity: true,
          priceCents: true,
          variant: true,
          color: true,
          colorHex: true,
        },
      },
    },
  });

  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <Navbar {...nav} />

      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-on-surface text-3xl font-normal tracking-tight">Orders</h1>
        <p className="text-on-surface-variant mt-1 text-sm">
          {orders.length === 0
            ? "Nothing here yet."
            : "Tap a ticket for the full receipt."}
        </p>

        {orders.length === 0 ? (
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
          <ul className="mt-8 space-y-4">
            {orders.map((order) => (
              <li key={order.id}>
                {/* `placed` still carries an order id on links from before
                    checkout started redirecting to the receipt. */}
                <OrderTicket order={order} highlighted={placed === order.id} />
              </li>
            ))}
          </ul>
        )}
      </main>

      <Footer />
    </div>
  );
}
