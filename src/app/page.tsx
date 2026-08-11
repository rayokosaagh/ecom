import Link from "next/link";

import { Navbar } from "@/components/nav/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PromoBannerSections } from "@/components/banners/PromoBannerSections";
import { BrandStrip } from "@/components/brands/BrandStrip";
import { FlashSaleSection } from "@/components/flash/FlashSaleSection";
import { ProductCard } from "@/components/products/ProductCard";
import { FeaturedAccordion } from "@/components/products/FeaturedAccordion";
import { FeaturedShowcase } from "@/components/products/FeaturedShowcase";
import { SaleSection } from "@/components/products/SaleSection";
import { SocialBar } from "@/components/social/SocialBar";
import { TrustBadgesSection } from "@/components/layout/TrustBadges";
import { FaqSection } from "@/components/faqs/FaqSection";
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
import { getBestSellers } from "@/lib/products/best-sellers";
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

  const [nav, wishlistIds, categories, featured, bestSellers, onSale, brands, flashSale] =
    await Promise.all([
      getNavData(),
      getWishlistProductIds(),
      prisma.category.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
      getFeaturedProducts(),
      // Six, because the accordion divides one fixed row between its panels and
      // past six a closed one is a sliver too narrow to carry its own name.
      // Served from an hourly cache, so this usually costs nothing.
      getBestSellers(6),
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
        {/* `sm:px-6` matches the gutter every other section on this page uses
            (`mx-auto max-w-7xl px-4 sm:px-6`). It was `px-4` alone, which put
            the hero's contents 8px wider than everything below them from `sm`
            up — invisible on the centred copy, obvious on the accordion, whose
            edges sit right above the Featured picks card. */}
        <section className="flex flex-col items-center justify-center px-4 pt-16 pb-20 text-center sm:px-6 sm:pt-24 sm:pb-28">
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

          {/* Under the copy rather than beside it. The hero is a centred stack,
              and moving the headline off to one side to make room would restyle
              the part of this page that already works — so the shelf takes the
              full width beneath it instead.

              It carries **best sellers**, not the featured list. It used to
              show the latter, which meant the featured products appeared twice
              in a row — here, and again in the spotlight immediately below —
              so the row was a second telling of the same story rather than a
              section of its own. Ranked by units sold, it now answers a
              question no other shelf on this page does: not what the shop
              chose, but what people bought. Renders nothing under three
              products; see `FeaturedAccordion`. */}
          {bestSellers.length >= 3 && (
            <h2 className="animate-rise rise-4 text-on-surface mt-14 w-full max-w-[calc(80rem-3rem)] text-left text-2xl font-medium tracking-tight sm:text-3xl">
              Best <span className="accent-word">sellers</span>
            </h2>
          )}
          <FeaturedAccordion
            products={bestSellers.map((entry) => ({
              slug: entry.slug,
              name: entry.name,
              image: entry.image,
              brand: entry.brand,
              minCents: entry.minCents,
              priceVaries: entry.priceVaries,
              soldOut: entry.soldOut,
              // Always null here, and deliberately: `tint` is an admin's pick
              // on a *featured* row, and there is no such row behind a best
              // seller. `resolveWell` cycles the palette by position instead,
              // which is what that fallback is for.
              tint: null,
            }))}
            /* Width matched to the Featured picks card below rather than set
               independently. That card is a `max-w-7xl` section with `sm:px-6`
               gutters, so the box a shopper actually sees is 80rem *minus* those
               two 1.5rem gutters. This row has no gutters of its own at `md`
               and up, so it has to state that figure directly — `max-w-7xl`
               here would overhang the card below it by 3rem.

               `mt-4` rather than the `mt-14` it used to carry: the heading above
               now owns the gap from the hero, and leaving both would have set
               the row a full section's distance from its own title. */
            className="animate-rise rise-4 mt-4 w-full max-w-[calc(80rem-3rem)] text-left"
          />
        </section>

        {/* First of the shelves, because it is the only thing on the page with
            a deadline. Everything below is still true tomorrow; this is not,
            and a shopper who scrolls past it cannot come back to it. It used to
            sit under the featured spotlight, which meant the one section that
            expires was behind the one that never does. Renders nothing when no
            sale is running. */}
        <Reveal>
          <FlashSaleSection
            sale={flashSale}
            wishlistIds={wishlistIds}
            ratings={ratings}
          />
        </Reveal>

        {/* The curated spotlight. Renders nothing while the admin list is
            empty, so the page never shows an empty shelf. */}
        <Reveal>
          <FeaturedShowcase
            products={featured.map((entry) => ({
              ...entry,
              rating: ratings.get(entry.id) ?? null,
            }))}
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

        {/* Brands directly after the deals, because a shopper who arrives
            knowing the maker — "a MacBook", "ROG", "Sony" — is high-intent and
            should not have to scroll five screens to act on it. It sat below
            the category grid, which put the axis with no other entry point
            deepest on the page. It now also has a place in the top bar, so this
            rail is the browse prompt rather than the only way in. */}
        <Reveal>
          <BrandStrip brands={brands} />
        </Reveal>

        {/* Last of the product shelves, and with them rather than stranded past
            the navigation.

            It used to sit below the brand strip, which meant a shopper scrolled
            promos → categories → brands and was then dropped back into a
            general grid — offering a way to browse and then immediately taking
            it back. It is also the section that changes most often, so it is
            what gives a returning visitor a reason to scroll at all. */}
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

        {/* Navigation begins here. Everything above was the shop showing a
            shopper something; from here down it is answering "then let me look
            for myself".

            One section per category, each led by that category’s headline.
            Renders nothing until an admin creates a banner. */}
        <PromoBannerSections className="pb-24" />


        {/* Last of the ways to shop: following is what someone does when they
            have finished looking and are not buying today. Above it are all the
            ways to buy; putting an outbound link before any of them would be
            inviting people off the page mid-shop. Renders nothing at all until
            an admin adds a link. */}
        <Reveal>
          <SocialBar />
        </Reveal>

        {/* Reassurance, then objections — in that order, and both after every
            way to buy has been offered.

            These two answer the question a shopper who has scrolled the whole
            page is actually asking, which is no longer "what do you sell" but
            "can I trust this and what happens if it goes wrong". They earn
            their place at the bottom because that is where somebody who has not
            clicked anything ends up. */}
        <Reveal>
          <TrustBadgesSection />
        </Reveal>

        <Reveal>
          <FaqSection />
        </Reveal>
      </main>

      {/* The promises now have a band of their own above, so the footer's copy
          of them would be the same four twice within a screen. Every other page
          keeps them, where the footer is the end of a short page rather than of
          a long one. */}
      <Footer showPromises={false} />
    </div>
  );
}
