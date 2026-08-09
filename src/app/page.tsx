import Link from "next/link";

import { Navbar } from "@/components/nav/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PromoBannerSections } from "@/components/banners/PromoBannerSections";
import { BrandStrip } from "@/components/brands/BrandStrip";
import { FlashSaleSection } from "@/components/flash/FlashSaleSection";
import { ProductCard } from "@/components/products/ProductCard";
import { FeaturedShowcase } from "@/components/products/FeaturedShowcase";
import { SaleSection } from "@/components/products/SaleSection";
import { SocialBar } from "@/components/social/SocialBar";
import { WhatsappButton } from "@/components/support/WhatsappButton";
import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { getNavData } from "@/lib/nav/data";
import { getWishlistProductIds } from "@/lib/wishlist/service";
import { getRatings } from "@/lib/reviews/service";
import { getFeaturedProducts } from "@/lib/featured/service";
import { getSaleProducts } from "@/lib/sales/service";
import { getShoppableBrands } from "@/lib/brands/service";
import { getLiveFlashSale, reconcileFlashSales } from "@/lib/flash/service";
import { prisma } from "@/lib/prisma";

/**
 * Brands on the home strip.
 *
 * Three full rows of six on desktop, which is every brand the shop currently
 * carries — so the front door reaches all of them and none is left behind a
 * link. It was two rows, on the reasoning that the section should stay a
 * signpost rather than become the catalogue; at eighteen tiles that distinction
 * costs more than it buys, because the six it hid were hidden for no reason a
 * shopper could see.
 *
 * A cap is still worth keeping. It is what stops this section growing without
 * limit as brands are added, and `/brands` — reached from "All brands" here and
 * from the footer — is where the overflow goes once there is any. Raise it in
 * multiples of six so the last row is never a ragged one.
 */
const BRAND_LIMIT = 18;

export default async function HomePage() {
  // Settled before anything reads a price, and deliberately not inside the
  // batch below. A flash sale rewrites `Product.priceCents`, so a reconcile
  // running *alongside* the showcase and sale-shelf queries would let them read
  // yesterday's figures on the first request after a sale opens or closes.
  await reconcileFlashSales();

  const [nav, wishlistIds, categories, featured, onSale, brands, flashSale] =
    await Promise.all([
      getNavData(),
      getWishlistProductIds(),
      prisma.category.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
      getFeaturedProducts(),
      // One full row of four on desktop; the grid reflows below that.
      getSaleProducts(4),
      getShoppableBrands(BRAND_LIMIT),
      getLiveFlashSale(),
    ]);

  const categoryNames = categories.slice(0, 4).map((c) => c.name);

  const products = await prisma.product.findMany({
    where: { published: true },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      slug: true,
      name: true,
      image: true,
      priceCents: true,
      compareAtPriceCents: true,
      stock: true,
      published: true,
      colors: { orderBy: { sortOrder: "asc" as const }, select: { name: true, hex: true } },
      category: { select: { name: true } },
      // `slug` so the card's mark links through to the brand's listing.
      brand: { select: { name: true, slug: true, iconSvg: true, logo: true, logoTreatment: true } },
      variants: { select: { priceCents: true, compareAtPriceCents: true, stock: true } },
    },
  });

  // One grouped query covering the grid, the showcase and the sale shelf, so a
  // rating shows wherever a product does rather than only in the catalogue.
  const ratings = await getRatings([
    ...products.map((product) => product.id),
    ...featured.map((entry) => entry.id),
    ...onSale.map((entry) => entry.id),
    ...(flashSale?.products.map((entry) => entry.id) ?? []),
  ]);

  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <Navbar {...nav} />

      <main>
        <section className="flex flex-col items-center justify-center px-4 pt-16 pb-20 text-center sm:pt-24 sm:pb-28">
          <p className="animate-rise text-primary flex items-center gap-2 text-xs font-medium tracking-[0.25em] uppercase">
            <Icon name="storefront" size={16} filled />
            {/* The real category names, so the eyebrow stays true as the
                catalogue grows. */}
            {categoryNames.length > 0 ? categoryNames.join(" · ") : "New arrivals"}
          </p>

          <h1 className="animate-rise rise-2 text-on-surface mt-6 max-w-3xl text-5xl leading-[1.05] font-medium tracking-tight text-balance sm:text-7xl">
            Precision gear for
            <span className="accent-word block pt-2">
              the modern desk.
            </span>
          </h1>

          <div className="animate-rise rise-3 mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/products"
              className="bg-primary text-on-primary state-layer inline-flex h-12 items-center gap-2 rounded-full px-8 text-sm font-medium shadow-none transition-all duration-200 hover:shadow-elevation-2 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
            >
              Shop all products
              <Icon name="arrow_forward" size={18} />
            </Link>
            {!nav.user && (
              <Link
                href="/register"
                className="text-primary state-layer inline-flex h-12 items-center rounded-full px-6 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Create an account
              </Link>
            )}

            {/* Beside the shopping actions rather than in a section of its own:
                someone who lands with a question should not have to scroll the
                whole page to find out they can just ask. Outlined, so it reads
                as the third option rather than competing with "Shop all
                products". Renders nothing until a number is configured. */}
            <WhatsappButton
              label="Ask us anything"
              // The note lives with the buttons that answer a specific
              // question; in a hero it is noise.
              showNote={false}
              className="[&>a]:h-12"
            />
          </div>

          <ul className="animate-rise rise-4 text-on-surface-variant mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm">
            <li className="flex items-center gap-1.5">
              <Icon name="memory" size={16} />
              Spec-first, no filler
            </li>
            <span aria-hidden className="bg-outline-variant hidden h-4 w-px sm:block" />
            <li className="flex items-center gap-1.5">
              <Icon name="lock" size={16} />
              Secure checkout
            </li>
          </ul>
        </section>

        {/* The curated spotlight, directly under the hero. Renders nothing
            while the admin list is empty, so the page never shows an empty
            shelf. */}
        <Reveal>
          <FeaturedShowcase
            products={featured.map((entry) => ({
              ...entry,
              rating: ratings.get(entry.id) ?? null,
            }))}
          />
        </Reveal>

        {/* Above the standing sale shelf, because it is the only thing on the
            page with a deadline. Both are "cheaper than usual"; only this one
            stops being true at a known moment, and a shopper who scrolls past
            it cannot come back to it tomorrow. Renders nothing when no sale is
            running. */}
        <Reveal>
          <FlashSaleSection
            sale={flashSale}
            wishlistIds={wishlistIds}
            ratings={ratings}
          />
        </Reveal>

        {/* Deals, above the category banners and the general grid: a shopper
            who came for a sale should not have to scroll past everything else
            to find one. Owns its own bottom spacing, exactly as
            FeaturedShowcase above it does, and renders nothing at all while
            nothing is reduced. */}
        <Reveal>
          <SaleSection
            products={onSale.map((entry) => ({
              ...entry,
              rating: ratings.get(entry.id) ?? null,
            }))}
            wishlistIds={wishlistIds}
          />
        </Reveal>

        {/* One section per category, each led by that category’s headline.
            Renders nothing until an admin creates a banner. */}
        <PromoBannerSections className="pb-24" />

        {/* Brands sit between the curated shelves and the general grid, which
            is where a shopper who was not caught by any of the above starts
            looking for a way to navigate rather than browse. Every tile lands
            on the catalogue already filtered, so this is a shortcut into
            /products rather than a section that has to earn its own page. */}
        <Reveal>
          <BrandStrip brands={brands} />
        </Reveal>

        <Reveal>
          <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
            <div className="mb-6 flex items-end justify-between gap-4">
            <h2 className="text-on-surface text-3xl font-medium tracking-tight">
              Latest <span className="accent-word">arrivals</span>
            </h2>
            {products.length > 0 && (
              <Link
                href="/products"
                className="text-primary rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                View all
              </Link>
            )}
          </div>

          {products.length === 0 ? (
            <Card variant="outlined">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <Icon name="inventory_2" size={40} className="text-on-surface-variant" />
                <p className="text-on-surface">No products yet</p>
                <p className="text-on-surface-variant max-w-sm text-sm">
                  Sign in as an administrator and add your first product from the
                  dashboard.
                </p>
              </CardContent>
            </Card>
          ) : (
            <ul className="stagger grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {products.map((product) => (
                <li key={product.slug}>
                  <ProductCard
                    product={{ ...product, rating: ratings.get(product.id) ?? null }}
                    wishlisted={wishlistIds.has(product.id)}
                  />
                </li>
              ))}
            </ul>
          )}
          </section>
        </Reveal>

        {/* Last on the page, and deliberately so: following is what someone
            does when they have finished looking and are not buying today.
            Above it are all the ways to buy; putting an outbound link before
            any of them would be inviting people off the page mid-shop.
            Renders nothing at all until an admin adds a link. */}
        <Reveal>
          <SocialBar />
        </Reveal>

      </main>

      <Footer />
    </div>
  );
}
