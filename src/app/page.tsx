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
import { cn } from "@/lib/cn";
import { Reveal } from "@/components/ui/Reveal";
import { getNavData } from "@/lib/nav/data";
import { getWishlistProductIds } from "@/lib/wishlist/service";
import { getRatings } from "@/lib/reviews/service";
import { getFeaturedProducts } from "@/lib/featured/service";
import { getSaleProducts } from "@/lib/sales/service";
import { getShoppableBrands } from "@/lib/brands/service";
import { getBestSellers } from "@/lib/products/best-sellers";
import { getLiveFlashSale, reconcileFlashSales } from "@/lib/flash/service";
import { getStoreSettings } from "@/lib/settings/service";
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

/**
 * The shop's opening line, its two actions and its two promises.
 *
 * One component with two alignments, because the home page has two
 * arrangements and the *words* are the same in both. Which one is served is an
 * admin setting — see `homeHeroCombined` on `StoreSettings` — so the copy has
 * to be able to sit in either without being written out twice; a second copy
 * would be the one that stopped being updated.
 *
 * Every alignment here is stated rather than inherited. In the stacked
 * arrangement this sits inside a `flex flex-col items-center` section that used
 * to centre each of these elements as a flex item; wrapped in a component they
 * are no longer that section's children, so the centring has to come from the
 * elements themselves.
 */
function HeroCopy({
  categoryNames,
  showRegister,
  split,
}: {
  categoryNames: string[];
  /** Signed-out visitors are offered an account; signed-in ones are not. */
  showRegister: boolean;
  /**
   * Beside the featured product rather than across the page — centred while
   * the columns are stacked, left-aligned from `lg` where they are not. Copy
   * centred against a card beside it reads as an unrelated caption.
   */
  split: boolean;
}) {
  return (
    <div className={cn("w-full text-center", split && "lg:text-left")}>
      <p
        className={cn(
          "animate-rise eyebrow text-primary flex items-center justify-center gap-2",
          split && "lg:justify-start",
        )}
      >
        <Icon name="storefront" size={16} filled />
        {/* The real category names, so the eyebrow stays true as the catalogue
            grows. */}
        {categoryNames.length > 0 ? categoryNames.join(" · ") : "New arrivals"}
      </p>

      {/* A step down from `display-lg` when the copy is in a column: 72px in
          half a page breaks "Precision gear for" over three lines and leaves
          the headline taller than the product it is introducing. Across the
          full width there is room for it. */}
      <h1
        className={cn(
          "animate-rise rise-2 text-on-surface text-display-sm mx-auto mt-6 max-w-3xl",
          split ? "sm:text-display-md lg:mx-0" : "sm:text-display-lg",
        )}
      >
        Precision gear for
        <span className="accent-word block pt-2">the modern desk.</span>
      </h1>

      <div
        className={cn(
          "animate-rise rise-3 mt-9 flex flex-wrap items-center justify-center gap-3",
          split && "lg:justify-start",
        )}
      >
        <Link
          href="/products"
          className="bg-primary text-on-primary state-layer text-label-lg inline-flex h-12 items-center gap-2 rounded-full px-8 shadow-none transition-all duration-200 hover:shadow-elevation-2 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
        >
          Shop all products
          <Icon name="arrow_forward" size={18} />
        </Link>
        {showRegister && (
          <Link
            href="/register"
            className="text-primary state-layer text-label-lg inline-flex h-12 items-center rounded-full px-6 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Create an account
          </Link>
        )}

        {/* Beside the shopping actions rather than in a section of its own:
            someone who lands with a question should not have to scroll the
            whole page to find out they can just ask. Renders nothing until a
            number is configured. */}
        <WhatsappButton
          label="Ask us anything"
          // The note lives with the buttons that answer a specific question; in
          // a hero it is noise.
          showNote={false}
          className="[&>a]:h-12"
        />
      </div>

      <ul
        className={cn(
          "animate-rise rise-4 text-on-surface-variant text-body-md flex flex-wrap items-center justify-center gap-x-8 gap-y-2",
          // Tighter beside the product, where the column has a card to keep
          // level with rather than a whole page to breathe into.
          split ? "mt-10 lg:justify-start" : "mt-12",
        )}
      >
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

      {/*
        Nothing follows the promises.

        A stat rule stood here — products carried, then brands — to fill the
        foot of the column beside the card, and both figures have been taken
        out on request. The space they occupied is not a defect to be patched:
        the column is centred against the card by `items-center` on the hero
        grid, so what is left reads as margin above and below the copy rather
        than as a hole under it.
      */}
    </div>
  );
}

export default async function HomePage() {
  // Settled before anything reads a price, and deliberately not inside the
  // batch below. A flash sale rewrites `Product.priceCents`, so a reconcile
  // running *alongside* the showcase and sale-shelf queries would let them read
  // yesterday's figures on the first request after a sale opens or closes.
  await reconcileFlashSales();

  const [
    nav,
    wishlistIds,
    categories,
    featured,
    bestSellers,
    onSale,
    brands,
    flashSale,
    settings,
  ] = await Promise.all([
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
      // Which of the two home page arrangements to serve. Cached per request
      // and already read by the WhatsApp buttons below, so this costs nothing
      // extra.
      getStoreSettings(),
    ]);

  const categoryNames = categories.slice(0, 4).map((c) => c.name);

  /** Which arrangement the admin has published. See `HeroCopy`. */
  const combinedHero = settings.homeHeroCombined;

  // Built once and used by whichever arrangement is rendered — the two differ
  // in where these go, never in what is in them.
  const bestSellerPanels = bestSellers.map((entry) => ({
    slug: entry.slug,
    name: entry.name,
    image: entry.image,
    brand: entry.brand,
    minCents: entry.minCents,
    priceVaries: entry.priceVaries,
    soldOut: entry.soldOut,
    // Always null here, and deliberately: `tint` is an admin's pick on a
    // *featured* row, and there is no such row behind a best seller.
    // `resolveWell` cycles the palette by position instead, which is what that
    // fallback is for.
    tint: null,
  }));

  // Below three the accordion has too few panels to divide its row between;
  // `FeaturedAccordion` declines the same count on its own, and the check is
  // here as well so the heading goes with it.
  const hasBestSellers = bestSellers.length >= 3;

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

  // The featured list is the hero in one arrangement and a shelf in the other,
  // so it is prepared once here rather than mapped at either call site.
  const showcaseProducts = featured.map((entry) => ({
    ...entry,
    rating: ratings.get(entry.id) ?? null,
  }));

  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <Navbar {...nav} />

      <main>
        {/* The front door, in whichever of the two arrangements is published.
            The switch is `homeHeroCombined` in the dashboard's storefront
            settings; both show the same products, and differ only in where the
            copy, the spotlight and the best sellers sit.

            Neither is wrapped in `Reveal`: this is above the fold, and the copy
            carries the staggered `animate-rise` entrance the hero has always
            used. */}
        {combinedHero ? (
          <>
            {/* One section rather than two.

                The opening line, the actions and the featured spotlight used to
                be stacked: a centred hero, and then the same shop's best
                product introduced again a screen and a half further down. Both
                were saying "start here", which meant the page said it twice and
                neither one got the whole of the fold. Side by side they say it
                once — the copy makes the claim and the product beside it is the
                evidence.

                The carousel takes the copy as its `lead` rather than the page
                wrapping both in a grid, because the two columns have to be
                siblings for the product to sit *beside* the headline rather
                than under it, and the track that scrolls is a client component.
                Handing the copy in keeps it server-rendered — see
                `FeaturedShowcase`, where `lead` is also the switch into this
                layout. */}
            <FeaturedShowcase
              products={showcaseProducts}
              lead={
                <HeroCopy
                  categoryNames={categoryNames}
                  showRegister={!nav.user}
                  split
                />
              }
            />

          </>
        ) : (
          /* The arrangement the combined hero replaced: a centred stack, with
             "Featured picks" further down the page as a wide shelf of its own —
             rendered below, after the flash sale. The best sellers used to sit
             directly under this copy; they are now a shelf of their own below
             the flash sale, in both arrangements. See the note there. */
          <section className="flex flex-col items-center justify-center px-4 pt-16 pb-24 text-center sm:px-6 sm:pt-24 sm:pb-32">
            <HeroCopy
              categoryNames={categoryNames}
              showRegister={!nav.user}
              split={false}
            />
          </section>
        )}

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

        {/* The curated spotlight as a shelf, which is where it lived before the
            combined hero took it up to the top. Only in the stacked
            arrangement — in the other one this same component *is* the hero,
            and rendering it here as well would show the featured products
            twice. Renders nothing while the admin list is empty. */}
        {!combinedHero && (
          <Reveal>
            <FeaturedShowcase products={showcaseProducts} />
          </Reveal>
        )}

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

        {/*
          Best sellers — below both deal shelves, and the reason is the reveal
          rather than the merchandising.

          This sat directly beneath the hero in both arrangements, which put the
          top of the row about 945px down the page. That is at or above the fold
          on most desktop windows, and the accordion's scroll-driven reveal is
          anchored to `entry` — the range that runs while an element crosses
          into the viewport, whose length is exactly the element's own height.
          Measured: on a window taller than about 1360px the row was fully on
          screen before the visitor touched the scrollbar, so the panels
          finished dealing out with nobody watching; between 945 and 1360 the
          sequence began already half spent. No tuning of the timing wins that
          back, because the problem is that the element never *enters*. It
          needed distance.

          It went below the flash sale first, which was not enough and is worth
          recording: `FlashSaleSection` renders nothing unless a sale is
          actually live, so on a shop with no flash sale the move bought only
          the hero's own growth and the row landed at 1049 — still inside a tall
          fold. Position on this page is a function of which shelves have data,
          so "below X" is only as good as X's emptiest day. Below the sale shelf
          as well, the row clears every viewport with the current catalogue and
          degrades to roughly where it was if *both* deal shelves are empty,
          which is the worst case and still covers ordinary laptop heights.

          One shelf now instead of two copies, which is the other half of the
          fix: the stacked arrangement stated its width in absolute terms
          (`max-w-[calc(80rem-3rem)]`) to line up with a gutterless hero while
          the combined one used a plain guttered section. Two spellings of one
          shelf is how they drift apart. As its own section it takes the same
          `max-w-7xl` gutters every other shelf here uses.

          The order still reads: things with a deadline or a discount first,
          then what people actually bought, then the ways to browse.
        */}
        {hasBestSellers && (
          <Reveal>
            <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
              <h2 className="text-on-surface text-headline-sm sm:text-headline-md">
                Best <span className="accent-word">sellers</span>
              </h2>
              <FeaturedAccordion products={bestSellerPanels} className="mt-6" />
            </section>
          </Reveal>
        )}

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
            <h2 className="text-on-surface text-headline-md">
              Latest <span className="accent-word">arrivals</span>
            </h2>
            {products.length > 0 && (
              <Link
                href="/products"
                className="text-primary text-label-lg rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                View all
              </Link>
            )}
          </div>

          {products.length === 0 ? (
            <Card variant="outlined">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <Icon name="inventory_2" size={40} className="text-on-surface-variant" />
                <p className="text-on-surface text-title-md">No products yet</p>
                <p className="text-on-surface-variant text-body-md max-w-sm">
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
