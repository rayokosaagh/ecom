import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";

import { Navbar } from "@/components/nav/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/products/ProductCard";
import { getRatings } from "@/lib/reviews/service";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { requireUser } from "@/lib/auth/dal";
import { getNavData } from "@/lib/nav/data";
import { getWishlist, markWishlistSeen } from "@/lib/wishlist/service";

export const metadata: Metadata = { title: "Wishlist" };

export default async function WishlistPage() {
  const user = await requireUser();
  const [nav, items] = await Promise.all([getNavData(), getWishlist(user.id)]);
  const ratings = await getRatings(items.map((item) => item.product.id));

  /**
   * Arriving here is what empties the heart's badge.
   *
   * After the response, not before it: nobody waiting to see their own saved
   * products should wait on a write recording that they looked. The cost is
   * that `nav` was read a moment too early to know — so the badge is passed as
   * zero below rather than being read back, which is also the honest answer,
   * since the page it counts for is the one on screen.
   */
  after(() => markWishlistSeen(user.id));

  // A product can be unpublished after being wishlisted; keep the row (the
  // heart still counts) but flag it rather than 404ing from the card link.
  const visible = items.filter((item) => item.product.published);
  const hidden = items.length - visible.length;

  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <Navbar {...nav} wishlistNewCount={0} />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <h1 className="text-on-surface text-headline-md">Wishlist</h1>
        <p className="text-on-surface-variant mt-1 text-sm">
          {visible.length} item{visible.length === 1 ? "" : "s"}
          {hidden > 0 && ` · ${hidden} no longer available`}
        </p>

        {visible.length === 0 ? (
          <Card variant="outlined" className="mt-8">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Icon name="favorite" size={40} className="text-on-surface-variant" />
              <p className="text-on-surface">Nothing saved yet</p>
              <p className="text-on-surface-variant max-w-sm text-sm">
                Tap the heart on any product to keep it here.
              </p>
              <Link
                href="/products"
                className="bg-primary text-on-primary state-layer mt-2 inline-flex h-10 items-center rounded-full px-6 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Browse products
              </Link>
            </CardContent>
          </Card>
        ) : (
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {visible.map((item) => (
              <li key={item.id}>
                <ProductCard
                  product={{
                    ...item.product,
                    rating: ratings.get(item.product.id) ?? null,
                  }}
                  wishlisted
                />
              </li>
            ))}
          </ul>
        )}
      </main>

      <Footer />
    </div>
  );
}
