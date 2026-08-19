import "server-only";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { prisma } from "@/lib/prisma";
import { syncProductPriceFromVariants } from "@/lib/products/price-sync";

/**
 * Ending sales on the date they were given.
 *
 * A standing sale can carry an end date (`saleEndsAt`). There is no cron in
 * this project, so the date is honoured the way flash-sale windows and
 * abandoned orders are: lazily, on the first read after the moment, from the
 * pages where a stale sale would otherwise be quoted — the storefront's home
 * and sale pages and the admin's inventory and sales screens.
 *
 * Each expired sale ends through the same shape of write an admin ending it
 * by hand would make: a conditional update guarded on the regular price and
 * the date still being what was read, and a `PriceChange` row saying the sale
 * ended and why — so the ledger is complete whether a person or the clock
 * closed it.
 *
 * The price goes **back to the regular price**. "Ends Friday" means that on
 * Saturday it costs what it cost before; a dated sale that left the reduced
 * price in place forever would be a permanent markdown wearing a timer. (The
 * hand-operated End-sale button offers the same, ticked by default, and says
 * so.)
 *
 * Idempotent and cheap in the ordinary case: the candidate query matches
 * nothing, and the function returns after one indexed read.
 */
export async function endExpiredSales(now: Date = new Date()): Promise<number> {
  const [products, variants] = await Promise.all([
    prisma.product.findMany({
      where: { compareAtPriceCents: { not: null }, saleEndsAt: { lte: now } },
      select: { id: true, slug: true, priceCents: true, compareAtPriceCents: true, saleEndsAt: true },
    }),
    prisma.productVariant.findMany({
      where: { compareAtPriceCents: { not: null }, saleEndsAt: { lte: now } },
      select: {
        id: true,
        productId: true,
        priceCents: true,
        compareAtPriceCents: true,
        saleEndsAt: true,
        product: { select: { slug: true } },
      },
    }),
  ]);

  if (products.length === 0 && variants.length === 0) return 0;

  let ended = 0;
  const slugs = new Set<string>();
  const note = (endsAt: Date) =>
    `Sale ended as scheduled (set to end ${endsAt.toISOString()}); price back to the regular price`;

  for (const product of products) {
    try {
      await prisma.$transaction(async (tx) => {
        const written = await tx.product.updateMany({
          where: {
            id: product.id,
            compareAtPriceCents: product.compareAtPriceCents,
            saleEndsAt: product.saleEndsAt,
          },
          data: {
            priceCents: product.compareAtPriceCents!,
            compareAtPriceCents: null,
            saleEndsAt: null,
          },
        });
        if (written.count === 0) return; // somebody got there first
        await tx.priceChange.create({
          data: {
            productId: product.id,
            variantId: null,
            fromCents: product.priceCents,
            toCents: product.compareAtPriceCents!,
            fromCompareAtCents: product.compareAtPriceCents,
            toCompareAtCents: null,
            note: note(product.saleEndsAt!),
            userId: null,
          },
        });
        ended++;
        slugs.add(product.slug);
      });
    } catch (error) {
      console.error(`[sales] could not end scheduled sale on product ${product.id}`, error);
    }
  }

  for (const variant of variants) {
    try {
      await prisma.$transaction(async (tx) => {
        const written = await tx.productVariant.updateMany({
          where: {
            id: variant.id,
            compareAtPriceCents: variant.compareAtPriceCents,
            saleEndsAt: variant.saleEndsAt,
          },
          data: {
            priceCents: variant.compareAtPriceCents!,
            compareAtPriceCents: null,
            saleEndsAt: null,
          },
        });
        if (written.count === 0) return;
        // The product's own column follows its cheapest configuration.
        await syncProductPriceFromVariants(variant.productId, tx);
        await tx.priceChange.create({
          data: {
            productId: variant.productId,
            variantId: variant.id,
            fromCents: variant.priceCents,
            toCents: variant.compareAtPriceCents!,
            fromCompareAtCents: variant.compareAtPriceCents,
            toCompareAtCents: null,
            note: note(variant.saleEndsAt!),
            userId: null,
          },
        });
        ended++;
        slugs.add(variant.product.slug);
      });
    } catch (error) {
      console.error(`[sales] could not end scheduled sale on variant ${variant.id}`, error);
    }
  }

  if (ended > 0) {
    // Every surface a sale badge appears on — the same list `adjustPrice`
    // refreshes, since this is the same change made by the clock. Deferred
    // with `after()`: this runs during a page render, and revalidating *in*
    // a render is refused by Next; the page that called us reads fresh rows
    // anyway, and the cached storefront pages are refreshed once the
    // response is out.
    after(() => {
      revalidatePath("/admin/inventory");
      revalidatePath("/admin/inventory/history");
      revalidatePath("/admin/sales");
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/products");
      revalidatePath("/products", "layout");
      for (const slug of slugs) revalidatePath(`/products/${slug}`);
      revalidatePath("/sale");
      revalidatePath("/");
      revalidatePath("/cart");
    });
  }

  return ended;
}
