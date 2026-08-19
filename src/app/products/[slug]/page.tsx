import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Navbar } from "@/components/nav/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProductGallery } from "@/components/products/ProductGallery";
import { ProductSelectionProvider } from "@/components/products/ProductSelectionProvider";
import { AddToCartForm } from "@/components/cart/AddToCartForm";
import { Icon } from "@/components/ui/Icon";
import { BrandMark } from "@/components/brands/BrandMark";
import { SpecTable } from "@/components/products/SpecTable";
import { SelectedStockPill } from "@/components/products/SelectedStockPill";
import { SimilarProducts } from "@/components/products/SimilarProducts";
import { ReviewSection } from "@/components/reviews/ReviewSection";
import { RatingBadge } from "@/components/reviews/RatingStars";
import { getCurrentUser, isAdmin } from "@/lib/auth/dal";
import { getNavData } from "@/lib/nav/data";
import { getRootCategories } from "@/lib/categories/tree";
import { getSimilarProducts } from "@/lib/products/similar";
import { getWishlistProductIds } from "@/lib/wishlist/service";
import {
  getRatings,
  getRatingSummary,
  getReviewEligibility,
  getReviews,
} from "@/lib/reviews/service";
import { WishlistButton } from "@/components/wishlist/WishlistButton";
import { WhatsappButton } from "@/components/support/WhatsappButton";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { formatPrice } from "@/lib/products/format";
import { saleFor } from "@/lib/products/sale";
import { SaleEnds } from "@/components/products/SaleEnds";
import { endExpiredSales } from "@/lib/sales/schedule";
import { priceRange, type VariantView } from "@/lib/products/variants";
import { Role } from "@/generated/prisma/enums";

async function getProduct(slug: string, admin: boolean) {
  return prisma.product.findFirst({
    // Admins can preview drafts; everyone else only sees published products.
    where: { slug, ...(admin ? {} : { published: true }) },
    include: {
      category: { select: { name: true, slug: true } },
      brand: { select: { name: true, slug: true, iconSvg: true, logo: true, logoTreatment: true } },
      // Ordered by the definition so every product lists its specs the same
      // way, whatever order they were typed in.
      specs: {
        orderBy: { definition: { sortOrder: "asc" } },
        select: {
          value: true,
          definition: {
            select: { label: true, unit: true, group: true, icon: true },
          },
        },
      },
      colors: {
        orderBy: { sortOrder: "asc" },
        select: { name: true, hex: true, image: true, gallery: true },
      },
      variants: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sku: true,
          priceCents: true,
          compareAtPriceCents: true,
          saleEndsAt: true,
          stock: true,
          image: true,
          options: {
            select: {
              definitionId: true,
              value: true,
              valueKey: true,
              definition: {
                select: { label: true, unit: true, sortOrder: true },
              },
            },
          },
        },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await prisma.product.findFirst({
    where: { slug, published: true },
    select: { name: true, description: true },
  });

  if (!product) return { title: "Product not found" };
  return {
    title: product.name,
    description: product.description.slice(0, 160),
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // A standing sale past its end date closes before the price is read — this
  // is the page someone buys from, so it must not quote a sale that is over.
  // One indexed read when nothing has expired; see lib/sales/schedule.
  await endExpiredSales();
  const [user, admin, nav, wishlistIds] = await Promise.all([
    getCurrentUser(),
    isAdmin(),
    getNavData(),
    getWishlistProductIds(),
  ]);
  const product = await getProduct(slug, admin);

  // Serves the not-found UI with a 200, not a 404, and that is deliberate.
  // This page sits behind a `loading.tsx` Suspense boundary (its own, and the
  // root one), so Next has already committed the status line before this runs —
  // see "The HTTP contract" in the streaming guide. It injects
  // `<meta name="robots" content="noindex">` into the stream instead, which is
  // what actually keeps these URLs out of search results. Recovering the real
  // 404 would mean deleting every loading.tsx above this page and losing the
  // skeletons on the home page, the catalogue and here; the status code is not
  // worth that.
  if (!product) notFound();

  // Flattened for the client component and the price helpers, which take a
  // plain shape rather than a Prisma row.
  const variants: VariantView[] = product.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    priceCents: variant.priceCents,
    stock: variant.stock,
    image: variant.image,
    options: variant.options.map((option) => ({
      definitionId: option.definitionId,
      label: option.definition.label,
      unit: option.definition.unit,
      sortOrder: option.definition.sortOrder,
      value: option.value,
      valueKey: option.valueKey,
    })),
  }));

  const range = priceRange(product, variants);
  // Given the raw rows rather than `variants`: `VariantView` is the shape the
  // client picker needs and carries no "was" price, so passing it would quietly
  // report every configurable product as not on sale.
  const sale = saleFor(product, product.variants);

  // Whether the brand has artwork of any kind. `BrandMark` ranks the vector
  // above the hosted image and renders nothing when it has neither, so this is
  // the same question it asks — asked here because the *name* beside it depends
  // on the answer.
  const hasBrandMark = Boolean(product.brand?.iconSvg || product.brand?.logo);

  // Loaded after the product, because all of them need its id. Together rather
  // than in sequence — none of them depends on another's result.
  const [summary, reviews, eligibility, similar, rootCategories] = await Promise.all([
    getRatingSummary(product.id),
    getReviews(product.id, user?.id),
    getReviewEligibility(product.id, user?.id),
    getSimilarProducts(product),
    getRootCategories(),
  ]);

  // Sequential because it needs the ids the shelf settled on. Batched into one
  // aggregate rather than one per card, the same way the catalogue grid does it.
  const similarRatings = await getRatings(similar.map((item) => item.id));

  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <Navbar {...nav} />

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <nav
          aria-label="Breadcrumb"
          className="text-on-surface-variant mb-6 text-sm"
        >
          <Link href="/products" className="hover:underline">
            Products
          </Link>
          {product.category && (
            <>
              <span aria-hidden> / </span>
              <Link
                href={`/products?category=${product.category.slug}`}
                className="hover:underline"
              >
                {product.category.name}
              </Link>
            </>
          )}
        </nav>

        {admin && !product.published && (
          <p className="bg-surface-container-highest text-on-surface-variant mb-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs">
            <Icon name="visibility_off" size={16} />
            Draft — only visible to administrators
          </p>
        )}

        {/* One set of choices, several consumers: the gallery shows the colour,
            the stock pill reports the chosen configuration, and the buy box
            submits both. Before this each kept its own, so the page could show
            one finish while the cart recorded another — and the pill could
            claim "In stock" for a variant with two left. */}
        <ProductSelectionProvider colors={product.colors} variants={variants}>
          <div className="grid gap-10 lg:grid-cols-2">
            <ProductGallery
              name={product.name}
              image={product.image}
              gallery={product.gallery}
            />

            <div>
              {(product.brand || product.category) && (
                <p className="label-caps text-on-surface-variant flex items-center gap-1.5">
                  {product.brand && (
                    /* "I like this Sony — show me the rest" is the single most
                       common move off a product page, and the brand was
                       already written right here as dead text. Points at the
                       catalogue's own brand facet rather than a page of its
                       own, so arriving there lands on a listing that can still
                       be narrowed by everything else. */
                    <Link
                      href={`/products?brand=${product.brand.slug}`}
                      // The mark alone says nothing on hover, so the name is
                      // still reachable for anyone who does not recognise it.
                      title={hasBrandMark ? product.brand.name : undefined}
                      className="text-on-surface hover:text-primary flex items-center gap-1.5 rounded-sm font-medium transition-colors duration-200 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {hasBrandMark ? (
                        /* Carries the name rather than being decorative: with
                           no text beside it, this mark is the whole of the
                           link, and a link whose only content is hidden from
                           assistive tech has no accessible name at all. */
                        <BrandMark
                          svg={product.brand.iconSvg}
                          logo={product.brand.logo}
                          treatment={product.brand.logoTreatment}
                          size={20}
                          label={product.brand.name}
                          // A hosted logo that never loads would otherwise
                          // leave this line blank, since the name is only
                          // rendered when there is no mark at all.
                          fallback={product.brand.name}
                        />
                      ) : (
                        product.brand.name
                      )}
                    </Link>
                  )}
                  {product.brand && product.category && (
                    <span aria-hidden className="bg-outline-variant h-3 w-px" />
                  )}
                  {product.category?.name}
                </p>
              )}

              <div className="mt-1 flex items-start justify-between gap-3">
                <h1 className="text-on-surface text-headline-md">
                  {product.name}
                </h1>
                {product.published && (
                  <WishlistButton
                    productId={product.id}
                    wishlisted={wishlistIds.has(product.id)}
                    className="bg-surface-container-high shrink-0"
                  />
                )}
              </div>

              {/* With variants this is the headline, not the price charged —
                the buy box below restates the selected configuration's own
                price, which is what actually goes in the cart. */}
              {/* Under the name and above the price: the two things a shopper
                weighs against each other, next to each other. Renders nothing
                until someone has actually rated it. */}
              <a
                href="#reviews-heading"
                className="mt-2 inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <RatingBadge
                  average={summary.average}
                  count={summary.count}
                  size={16}
                />
              </a>

              {/* The same "was / now" the cards carry, from the same helper and
                  the same row `range` took its figure from. This is the page
                  someone decides on, so the two must not disagree. */}
              <p className="text-headline-sm mt-3 flex flex-wrap items-baseline gap-x-3">
                <span className={sale ? "text-tertiary" : "text-on-surface"}>
                  {range.varies
                    ? `From ${formatPrice(range.minCents)}`
                    : formatPrice(range.minCents)}
                </span>
                {sale && (
                  <span className="text-on-surface-variant text-base line-through">
                    <span className="sr-only">was </span>
                    {formatPrice(sale.compareAtCents)}
                  </span>
                )}
                {sale && sale.percentOff >= 1 && (
                  <span className="bg-tertiary text-on-tertiary rounded-full px-2.5 py-0.5 text-xs font-medium">
                    Save {formatPrice(sale.savingCents)} · {sale.percentOff}% off
                  </span>
                )}
              </p>
              {/* When the sale ends, if it was given an end — named as a date,
                  or counted down inside the last two days. This is the page
                  someone decides on, so "ends tomorrow" belongs right here. */}
              {sale?.endsAt && (
                <p className="mt-1.5">
                  <SaleEnds
                    endsAtMs={sale.endsAt.getTime()}
                    remainingMs={Math.max(0, sale.endsInMs ?? 0)}
                  />
                </p>
              )}

              {/* Availability as a state rather than a count — the running
                  total belonged to the dashboard, not to the person deciding
                  whether they can have this today. See `StockPill`.

                  Reports the *selected* configuration rather than the product's
                  summed stock, which is what it used to do: a variant with two
                  left read "In stock" because the other sizes were well
                  stocked, directly above a buy box saying "2 in stock". Only
                  `product.stock` is passed, as the fallback for a product with
                  nothing to configure — see `SelectedStockPill`. */}
              <SelectedStockPill stock={product.stock} className="mt-3" />

              <p className="text-on-surface-variant mt-6 leading-relaxed whitespace-pre-line">
                {product.description}
              </p>

              <div className="mt-8">
                {/* The only colour picker on the page. It submits with the cart
                  line and drives the gallery through the provider. */}
                <AddToCartForm
                  productId={product.id}
                  slug={product.slug}
                  colors={product.colors.map((c) => ({
                    name: c.name,
                    hex: c.hex,
                  }))}
                  stock={product.stock}
                  priceCents={product.priceCents}
                  variants={variants}
                  /* Beside the buy action rather than under it, because that is
                     where the unanswered question stops a purchase — and a
                     shopper weighing "buy" against "ask first" should see both
                     answers at once instead of finding the second below the
                     fold. The prefilled message names this product and links to
                     it, so the first reply can be the answer rather than
                     "which one?". Renders nothing when no number is
                     configured, and the row then holds Add to cart alone. */
                  secondaryAction={
                    <WhatsappButton
                      // The anchor inside is `h-11` against the submit button's
                      // `h-10`. Overridden by a descendant selector because
                      // `cn` is a plain joiner, not tailwind-merge — both
                      // classes emit and the more specific one has to win. The
                      // hero does the same thing to reach `h-12`.
                      className="[&>a]:h-10"
                      label="Ask about this product"
                      context={{
                        productName: product.name,
                        // Absolute, and built from configuration rather than
                        // the request's Host header — see lib/app-url.
                        url: appUrl(`/products/${product.slug}`),
                      }}
                    />
                  }
                />
              </div>

              {/* Only where there is a sale to belong to. A shopper who has
                  found one reduction is the likeliest person in the shop to
                  want the rest of them, and this is the only place that tells
                  them there are others.

                  Below the buy block rather than up beside the price, where it
                  used to sit. Two reasons, and the first is a real bug: both
                  this and `StockPill` are `inline-flex`, so in a block container
                  they flowed onto the *same line* whenever the column was wide
                  enough to fit them, and the `mt-` on each did nothing to
                  separate them. `flex w-fit` here makes it block-level, so it
                  takes its own line whatever sits above it.

                  The second is that a link out of the page reads differently
                  above the Add to cart button than below it. Under the price it
                  is an interruption placed exactly where someone is deciding;
                  down here it is the next thing to do once they have decided. */}
              {sale && (
                <Link
                  href="/sale"
                  className="text-primary mt-6 flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  See everything on sale
                  <Icon name="arrow_forward" size={16} />
                </Link>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                {user?.role === Role.ADMIN && (
                  <Link
                    href={`/dashboard/products/${product.id}/edit`}
                    className="border-outline text-primary state-layer inline-flex h-10 items-center gap-2 rounded-full border px-6 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <Icon name="edit" size={18} />
                    Edit
                  </Link>
                )}
              </div>
            </div>
          </div>
        </ProductSelectionProvider>

        {/* Below the grid, not inside the right column: that column already
            carries price, stock and add-to-cart, and specs are reference
            material people scroll to rather than decide with. */}
        <SpecTable
          rows={product.specs.map((spec) => ({
            label: spec.definition.label,
            value: spec.value,
            unit: spec.definition.unit,
            group: spec.definition.group,
            icon: spec.definition.icon,
          }))}
        />

        <ReviewSection
          productId={product.id}
          productSlug={product.slug}
          summary={summary}
          reviews={reviews}
          eligibility={eligibility}
          viewerId={user?.id}
        />

        {/* Last on the page, and deliberately after the reviews: everything
            above is about *this* product, and what other people made of it is
            part of deciding on it. This is the "if not this one, then what"
            slot, which is only useful once that decision has been made. */}
        <SimilarProducts
          products={similar}
          wishlistIds={wishlistIds}
          ratings={similarRatings}
          rootCategories={rootCategories}
        />
      </main>

      <Footer />
    </div>
  );
}
