import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Navbar } from "@/components/nav/Navbar";
import { Footer } from "@/components/layout/Footer";
import { CheckoutForm, type ShippingValues } from "@/components/cart/CheckoutForm";
import { requireUser } from "@/lib/auth/dal";
import { getAddresses, summarise, toShippingValues } from "@/lib/addresses/service";
import { getNavData } from "@/lib/nav/data";
import { getCart } from "@/lib/cart/service";
import { findCartId } from "@/lib/cart/identity";
import { prisma } from "@/lib/prisma";
import { pickupAvailable } from "@/lib/checkout/fulfilment";
import { formatPrice } from "@/lib/products/format";
import { paymentConfigured, paymentsAreSandbox } from "@/lib/payments/config";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_ORDER,
  paymentUnavailable,
} from "@/lib/payments/methods";
import { getStoreSettings } from "@/lib/settings/service";
import { releaseAbandonedOrders } from "@/lib/payments/expiry";

export const metadata: Metadata = { title: "Checkout" };

const EMPTY: ShippingValues = {
  name: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postcode: "",
  country: "",
  phone: "",
};

/**
 * Prefill from the last order that recorded an address.
 *
 * The fallback now, not the mechanism. The account's saved addresses come
 * first — see `getAddresses` — and this covers the shopper who has ordered
 * before but never saved anything, for whom the previous delivery is still a
 * far better guess than eight empty fields.
 */
async function lastUsedAddress(userId: string): Promise<ShippingValues> {
  const previous = await prisma.order.findFirst({
    where: { userId, shippingLine1: { not: null } },
    orderBy: { createdAt: "desc" },
    select: {
      shippingName: true,
      shippingLine1: true,
      shippingLine2: true,
      shippingCity: true,
      shippingRegion: true,
      shippingPostcode: true,
      shippingCountry: true,
      shippingPhone: true,
    },
  });

  if (!previous) return EMPTY;

  return {
    name: previous.shippingName ?? "",
    line1: previous.shippingLine1 ?? "",
    line2: previous.shippingLine2 ?? "",
    city: previous.shippingCity ?? "",
    region: previous.shippingRegion ?? "",
    postcode: previous.shippingPostcode ?? "",
    country: previous.shippingCountry ?? "",
    phone: previous.shippingPhone ?? "",
  };
}

export default async function CheckoutPage() {
  const user = await requireUser();

  /**
   * Release stock held by abandoned wallet orders before quoting this basket.
   *
   * The page below refuses to check out anything whose stock has run short, so
   * a unit still pledged to an order nobody paid for half an hour ago would
   * block a sale the shop can actually make — including, most often, the same
   * shopper's own second attempt at the order that was abandoned.
   */
  await releaseAbandonedOrders();

  const [nav, cart] = await Promise.all([
    getNavData(),
    getCart(await findCartId(), user.id),
  ]);

  // Nothing to check out, or something in the cart cannot be bought — either
  // way the cart is where it gets resolved, and this page would only show a
  // total that is about to be rejected.
  if (cart.items.length === 0) redirect("/cart");
  const blocked = cart.items.some(
    (item) => item.unavailable || item.availableStock < item.quantity,
  );
  if (blocked) redirect("/cart");

  const [previous, settings, addresses] = await Promise.all([
    lastUsedAddress(user.id),
    getStoreSettings(),
    getAddresses(user.id),
  ]);

  /**
   * The picker's rows, and which one starts selected.
   *
   * `getAddresses` returns the default first, so "the first row" and "the
   * default" are the same thing — but the id is passed explicitly rather than
   * left implied by the ordering, because that is the sort of coupling that
   * breaks quietly the day the sort changes.
   */
  const pickable = addresses.map((address) => ({
    id: address.id,
    label: address.label,
    summary: summarise(address),
    values: toShippingValues(address),
  }));

  const defaultAddress = addresses.find((address) => address.isDefault) ?? addresses[0];

  // With a book, the fields start on the default; without one, on whatever the
  // last order was sent to.
  const values = defaultAddress ? toShippingValues(defaultAddress) : previous;

  /**
   * Passed as data rather than rendered here.
   *
   * The summary re-totals as the fulfilment radio moves, which a server-rendered
   * node cannot do — it would keep quoting delivery on an order the shopper has
   * chosen to collect. The arithmetic still lives in one place: the client
   * summary and the checkout action both call `deliveryChargeFor`.
   */
  const summary = {
    count: cart.count,
    subtotalCents: cart.subtotalCents,
    payableCents: cart.payableCents,
    discountCents: cart.discountCents,
    discountLabel: cart.discount?.ok ? cart.discount.label : null,
    items: cart.items.map((item) => ({
      id: item.id,
      name: item.product.name,
      variantLabel: item.variantLabel || null,
      color: item.color || null,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
  };

  // Only offered when the shop has both switched collection on and said where
  // to come. See `pickupAvailable`.
  const pickup = pickupAvailable(settings)
    ? {
        address: settings.pickupAddress,
        hours: settings.pickupHours,
        note: settings.pickupNote,
      }
    : null;

  /**
   * Which payment methods this basket can actually use.
   *
   * Judged here, on the server, because the answer depends on merchant keys —
   * and the form is told *whether* a gateway is configured, never with what.
   *
   * Quoted against the delivery total, which is the larger of the two: a basket
   * that clears Khalti's floor with delivery would otherwise be offered Khalti
   * and then fall below it the moment the shopper chose collection.
   */
  const worstCaseTotal = cart.payableCents;
  const payments = PAYMENT_METHOD_ORDER.map((method) => {
    const info = PAYMENT_METHODS[method];
    const blocked = paymentUnavailable(
      method,
      worstCaseTotal,
      paymentConfigured(method),
    );

    return {
      method,
      label: info.label,
      blurb: info.blurb,
      icon: info.icon,
      unavailable: blocked
        ? blocked.reason === "not-configured"
          ? "Not available at the moment"
          : blocked.reason === "currency"
            ? `Not available for ${blocked.currency} orders`
            : `Minimum ${formatPrice(blocked.minMinorUnits)} for this method`
        : null,
    };
  });

  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <Navbar {...nav} />

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="text-on-surface mb-6 text-3xl font-medium tracking-tight">
          Checkout
        </h1>

        <CheckoutForm
          values={values}
          summary={summary}
          pickup={pickup}
          payments={payments}
          sandbox={paymentsAreSandbox()}
          addresses={pickable}
          defaultAddressId={defaultAddress?.id ?? null}
        />
      </main>

      <Footer />
    </div>
  );
}
