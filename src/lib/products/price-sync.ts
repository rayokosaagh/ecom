import "server-only";

import { prisma } from "@/lib/prisma";

/** The client or a transaction inside it — only the two models this touches. */
type Db = Pick<typeof prisma, "productVariant" | "product">;

/**
 * A configurable product's own price is its cheapest configuration's.
 *
 * A product with variants never sells at `Product.priceCents` — each variant
 * carries its own — but the catalogue still sorts and range-filters on the
 * product column in Postgres, search suggestions read it, and the card's
 * "from Rs X" is computed from the variants. If the column drifts from the
 * variants, "under Rs 1,20,000" matches a laptop whose cheapest model is
 * Rs 1,41,900 and the card then says "from Rs 1,41,900" beside it. So the
 * column is kept equal to the minimum variant price, and is written only by
 * this function for such products: every place a variant's price can change
 * — the inventory panel, the product form creating or removing variants —
 * calls it afterwards. (A flash sale discounts and restores the column
 * itself, from its own snapshot, and stays self-consistent.)
 *
 * The regular price is not synced: it is per configuration by design, and
 * a product-level one on a configurable product is ignored everywhere — see
 * the Sales page's "needs fixing" list.
 *
 * A no-op for a product without variants, whose column *is* its price.
 */
export async function syncProductPriceFromVariants(
  productId: string,
  db: Db = prisma,
): Promise<void> {
  const variants = await db.productVariant.findMany({
    where: { productId },
    select: { priceCents: true },
  });
  if (variants.length === 0) return;

  const cheapest = Math.min(...variants.map((variant) => variant.priceCents));
  await db.product.updateMany({
    where: { id: productId, NOT: { priceCents: cheapest } },
    data: { priceCents: cheapest },
  });
}
