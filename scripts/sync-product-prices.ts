import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * One-off: align every configurable product's own price with its cheapest
 * configuration — the rule `lib/products/price-sync` now keeps on every write.
 *
 * Products before that rule existed could carry any product-level figure the
 * form was given, and the catalogue filtered and sorted on it. Safe to rerun;
 * prints what it changed. Products held by a live flash sale are skipped —
 * the sale restores prices by checking they still hold what it wrote, and
 * rewriting the column underneath it would stop that restore.
 *
 *   npm run prices:sync
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const products = await prisma.product.findMany({
    where: { variants: { some: {} } },
    select: {
      id: true,
      name: true,
      priceCents: true,
      variants: { select: { priceCents: true } },
      flashSales: {
        where: { flashSale: { appliedAt: { not: null } } },
        select: { flashSale: { select: { name: true } } },
      },
    },
  });

  let changed = 0;
  for (const product of products) {
    const cheapest = Math.min(...product.variants.map((variant) => variant.priceCents));
    if (product.priceCents === cheapest) continue;
    if (product.flashSales.length > 0) {
      console.log(
        `skip   ${product.name}: held by flash sale “${product.flashSales[0].flashSale.name}”`,
      );
      continue;
    }
    await prisma.product.update({ where: { id: product.id }, data: { priceCents: cheapest } });
    console.log(`synced ${product.name}: ${product.priceCents} → ${cheapest}`);
    changed++;
  }
  console.log(`\n${changed} of ${products.length} configurable product${products.length === 1 ? "" : "s"} updated.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
