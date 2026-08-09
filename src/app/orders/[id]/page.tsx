import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Navbar } from "@/components/nav/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Icon } from "@/components/ui/Icon";
import { OrderDetail } from "@/components/orders/OrderDetail";
import { CancelOrderButton } from "@/components/orders/CancelOrderButton";
import { WhatsappButton } from "@/components/support/WhatsappButton";
import { requireUser } from "@/lib/auth/dal";
import { appUrl } from "@/lib/app-url";
import { getNavData } from "@/lib/nav/data";
import { getOrder } from "@/lib/orders/service";
import { orderReference } from "@/lib/orders/reference";
import { customerCanCancel } from "@/lib/orders/transitions";

export const metadata: Metadata = { title: "Order" };

export default async function OrderReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const user = await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);

  // Scoped to the signed-in user inside the query, not filtered afterwards —
  // an order id is unguessable in practice, but that is not a permission model.
  const [nav, order] = await Promise.all([getNavData(), getOrder(id, user.id)]);
  if (!order) notFound();

  const justPlaced = query.placed === "1";

  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <Navbar {...nav} />

      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <Link
          href="/orders"
          className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="arrow_back" size={18} />
          Orders
        </Link>

        {/* Only on arrival from checkout. Refreshing the page later shows a
            plain receipt rather than congratulating you again. */}
        {justPlaced && (
          <div
            role="status"
            className="bg-tertiary-container text-on-tertiary-container mt-4 flex items-start gap-3 rounded-xl px-4 py-3"
          >
            <Icon name="check_circle" size={20} />
            <div>
              <p className="font-medium">Order placed</p>
              <p className="text-sm">
                We have your order and will email you when it ships.
              </p>
            </div>
          </div>
        )}

        <h1 className="text-on-surface mt-4 mb-6 text-3xl font-medium tracking-tight">
          {justPlaced ? "Thank you" : "Your order"}
        </h1>

        {/* The ticket carries the date itself now. The cancel control goes in
            the same slot the admin's status buttons use. */}
        <OrderDetail
          order={order}
          actions={
            customerCanCancel(order.status) ? (
              <CancelOrderButton orderId={order.id} />
            ) : undefined
          }
        />

        {/* Where "where is my parcel?" is actually asked — and where the FAQ
            sends people for a return, or for a cancellation that has moved
            past the self-service window.

            The short reference travels, never the full id and nothing else off
            the order: this text lands in a URL and lives in the customer's
            chat history, and a reference is all an agent needs to look it up.
            See the note on `InquiryContext.orderReference`. */}
        <div className="mt-6 flex justify-center">
          <WhatsappButton
            label="Ask about this order"
            context={{
              orderReference: orderReference(order.id),
              url: appUrl(`/orders/${order.id}`),
            }}
          />
        </div>
      </main>

      <Footer />
    </div>
  );
}
