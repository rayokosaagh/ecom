import type { Metadata } from "next";
import Link from "next/link";

import { Navbar } from "@/components/nav/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { getCurrentUser } from "@/lib/auth/dal";
import { getCart } from "@/lib/cart/service";
import { findCartId } from "@/lib/cart/identity";
import { getNavData } from "@/lib/nav/data";
import { formatPrice } from "@/lib/products/format";
import {
  FREE_SHIPPING_OVER_CENTS,
  shippingFor,
} from "@/lib/checkout/shipping";
import { updateCartItem, removeCartItem } from "@/lib/actions/cart";
import { DiscountField } from "@/components/cart/DiscountField";
import { cartPaymentOutcome } from "@/lib/payments/outcome";
import { releaseAbandonedOrders } from "@/lib/payments/expiry";

export const metadata: Metadata = { title: "Cart" };

export default async function CartPage({
  searchParams,
}: {
  // Set by a payment callback that unwound an order back into this basket.
  searchParams: Promise<{ payment?: string }>;
}) {
  /**
   * Clear out anything that gave up at a wallet before reading the basket.
   *
   * First, because a swept order puts its lines back *into this cart* — reading
   * first would render the basket as it was a moment ago and hide the very items
   * the sweep just returned. Lazy on render rather than scheduled, the same way
   * flash sales reconcile; see `releaseAbandonedOrders`.
   */
  await releaseAbandonedOrders();

  const query = await searchParams;

  // Open to guests. Signing in is deferred to checkout, where an account
  // actually starts being necessary.
  const [user, cartId] = await Promise.all([getCurrentUser(), findCartId()]);
  const [{ items, subtotalCents, discount, discountCents, payableCents }, nav] =
    await Promise.all([getCart(cartId, user?.id), getNavData()]);

  const payment = cartPaymentOutcome(query.payment);

  const hasIssue = items.some(
    (item) => item.unavailable || item.availableStock < item.quantity,
  );

  // Shown here so the total is honest before the checkout page repeats it —
  // and recomputed on the server at checkout regardless. Quoted on what is
  // actually payable, so a code can carry a basket over the free-delivery line.
  const shippingCents = shippingFor(payableCents);

  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <Navbar {...nav} />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="text-on-surface text-3xl font-normal tracking-tight">Your cart</h1>

        {/* Why the basket looks the way it does, for someone arriving back from
            a wallet they cancelled at. Without it the items reappearing is as
            unexplained as them vanishing was. */}
        {payment && (
          <div
            role="status"
            className="bg-surface-container-highest text-on-surface mt-4 flex items-start gap-3 rounded-xl px-4 py-3"
          >
            <Icon name={payment.icon} size={20} />
            <div>
              <p className="font-medium">{payment.title}</p>
              <p className="text-sm">{payment.detail}</p>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <Card variant="outlined" className="mt-8">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Icon name="shopping_cart" size={40} className="text-on-surface-variant" />
              <p className="text-on-surface">Your cart is empty</p>
              <Link
                href="/products"
                className="bg-primary text-on-primary state-layer mt-2 inline-flex h-10 items-center rounded-full px-6 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Browse products
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
            <ul className="space-y-3">
              {items.map((item) => {
                const outOfStock = item.unavailable || item.availableStock < item.quantity;
                return (
                  <li key={item.id}>
                    <Card variant="outlined">
                      <CardContent className="flex flex-wrap items-center gap-4">
                        <div className="bg-surface-container-highest size-20 shrink-0 overflow-hidden rounded-lg">
                          {item.image ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={item.image}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="text-on-surface-variant grid size-full place-items-center">
                              <Icon name="image" size={24} />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/products/${item.product.slug}`}
                            className="text-on-surface rounded-sm text-sm font-medium hover:underline focus-visible:outline-2"
                          >
                            {item.product.name}
                          </Link>
                          {/* The configuration reads before the colour: it is
                              the more consequential choice, and it is what the
                              price on this line follows. */}
                          {item.variantLabel && (
                            <p className="text-on-surface-variant mt-0.5 text-xs">
                              {item.variantLabel}
                            </p>
                          )}
                          {item.color && (
                            <p className="text-on-surface-variant mt-1 flex items-center gap-1.5 text-xs">
                              {/* The line snapshots its own swatch, so this
                                  still renders after the product's colourways
                                  are edited. */}
                              <span
                                aria-hidden
                                className="border-outline-variant size-3 rounded-full border"
                                style={{ backgroundColor: item.colorHex || "transparent" }}
                              />
                              {item.color}
                            </p>
                          )}
                          <p className="text-on-surface-variant mt-1 text-sm">
                            {formatPrice(item.unitPriceCents)}
                          </p>
                          {outOfStock && (
                            <p className="text-error mt-1 text-xs">
                              Only {item.availableStock} left
                            </p>
                          )}
                          {!item.product.published && (
                            <p className="text-error mt-1 text-xs">No longer available</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <form action={updateCartItem}>
                            <input type="hidden" name="id" value={item.id} />
                            <input type="hidden" name="quantity" value={item.quantity - 1} />
                            <button
                              type="submit"
                              aria-label="Decrease quantity"
                              // 36px is a comfortable mouse target and a poor
                              // thumb one, so it grows to 44 on touch. These
                              // three sit in a row inches from each other, and
                              // the third deletes the line — a mis-tap here is
                              // the most expensive one in the cart.
                              className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-200 pointer-coarse:size-11 focus-visible:outline-2"
                            >
                              <Icon name="remove" size={18} />
                            </button>
                          </form>

                          <span className="text-on-surface w-6 text-center text-sm tabular-nums">
                            {item.quantity}
                          </span>

                          <form action={updateCartItem}>
                            <input type="hidden" name="id" value={item.id} />
                            <input type="hidden" name="quantity" value={item.quantity + 1} />
                            <button
                              type="submit"
                              aria-label="Increase quantity"
                              disabled={item.quantity >= item.availableStock}
                              className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-9 place-items-center rounded-full transition-colors duration-200 pointer-coarse:size-11 disabled:opacity-40 focus-visible:outline-2"
                            >
                              <Icon name="add" size={18} />
                            </button>
                          </form>

                          <form action={removeCartItem}>
                            <input type="hidden" name="id" value={item.id} />
                            <button
                              type="submit"
                              aria-label={`Remove ${item.product.name}`}
                              // Extra separation on touch as well as extra size:
                              // this is the destructive one of the three.
                              className="text-on-surface-variant hover:bg-error/[0.08] hover:text-error ml-1 grid size-9 place-items-center rounded-full transition-colors duration-200 pointer-coarse:ml-3 pointer-coarse:size-11 focus-visible:outline-2"
                            >
                              <Icon name="delete" size={18} />
                            </button>
                          </form>
                        </div>

                        <p className="text-on-surface w-20 shrink-0 text-right text-sm">
                          {formatPrice(item.unitPriceCents * item.quantity)}
                        </p>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>

            <aside>
              <Card variant="filled" className="sticky top-24">
                <CardContent className="space-y-4">
                  <h2 className="text-on-surface text-sm font-medium">Summary</h2>

                  <DiscountField
                    applied={discount?.ok ? discount.label : undefined}
                    failed={discount && !discount.ok ? discount.reason : undefined}
                    discountCents={discountCents}
                  />

                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-on-surface-variant">Subtotal</dt>
                      <dd className="text-on-surface">{formatPrice(subtotalCents)}</dd>
                    </div>
                    {discountCents > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-tertiary">Discount</dt>
                        <dd className="text-tertiary">
                          −{formatPrice(discountCents)}
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-on-surface-variant">Delivery</dt>
                      <dd className="text-on-surface-variant">
                        {shippingCents === 0
                          ? "Free"
                          : `${formatPrice(shippingCents)} · free over ${formatPrice(FREE_SHIPPING_OVER_CENTS)}`}
                      </dd>
                    </div>
                  </dl>

                  <div className="border-outline-variant flex justify-between border-t pt-4">
                    <span className="text-on-surface font-medium">Total</span>
                    <span className="text-on-surface text-lg">
                      {formatPrice(payableCents + shippingCents)}
                    </span>
                  </div>

                  {/* A link, not a submit: checkout now collects an address,
                      so the cart hands off to a page rather than placing the
                      order from here. A guest is routed through sign-in and
                      lands back on checkout with the cart intact — it is
                      claimed by the account on the way through. */}
                  {hasIssue ? (
                    <span
                      aria-disabled
                      className="bg-on-surface/[0.12] text-on-surface/[0.38] flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-full text-sm font-medium"
                    >
                      <Icon name="lock" size={18} />
                      Checkout
                    </span>
                  ) : (
                    <Link
                      href={user ? "/checkout" : "/login?redirectTo=%2Fcheckout"}
                      className="bg-primary text-on-primary state-layer flex h-11 items-center justify-center gap-2 rounded-full text-sm font-medium transition-all duration-200 hover:shadow-elevation-1 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
                    >
                      <Icon name="lock" size={18} />
                      Checkout
                    </Link>
                  )}

                  {!user && !hasIssue && (
                    <p className="text-on-surface-variant text-xs">
                      You&rsquo;ll sign in at the next step. Your cart comes with you.
                    </p>
                  )}

                  {hasIssue && (
                    <p className="text-error text-xs">
                      Fix the flagged items before checking out.
                    </p>
                  )}
                </CardContent>
              </Card>
            </aside>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
