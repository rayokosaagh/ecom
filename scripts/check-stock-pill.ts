/**
 * The stock pill on a product page reports the *selected* configuration.
 *
 * Guards the bug this was written for: `availableStock()` sums every variant,
 * so a product with 90 of one size and 2 of another reported "In stock" while
 * the 2-unit variant was selected — directly above a buy box saying "2 in
 * stock". The page now passes the selected variant's own level.
 *
 * Pure assertions over the same helpers the page uses, plus a scan of the real
 * catalogue for products where the two answers actually differ, so the check
 * fails loudly if the summing behaviour ever comes back.
 */

// Needed because the catalogue pass talks to the database; the pure checks
// above it would run without this. Same first line `db-status` uses.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { LOW_STOCK_THRESHOLD, stockState } from "@/lib/inventory/stock";
import {
  availableStock,
  findVariant,
  openingSelection,
  type VariantView,
} from "@/lib/products/variants";

let failures = 0;

function check(label: string, condition: boolean) {
  console.log(`${condition ? "  ok  " : "FAIL  "}${label}`);
  if (!condition) failures++;
}

/** A variant with one axis ("size"), used to build fixtures cheaply. */
function variant(id: string, valueKey: string, stock: number, priceCents = 1000): VariantView {
  return {
    id,
    sku: id,
    priceCents,
    stock,
    image: null,
    options: [
      {
        definitionId: "size",
        label: "Size",
        unit: null,
        sortOrder: 0,
        value: valueKey,
        valueKey,
      },
    ],
  };
}

console.log("\nThe reported bug: one low variant among well-stocked ones");

{
  const variants = [variant("big", "l", 90), variant("small", "s", 2)];

  // What the page used to show, and why it was wrong.
  const summed = availableStock({ stock: 0 }, variants);
  check("summed stock across variants is 92", summed === 92);
  check("summed stock reads as IN — the bug", stockState(summed) === "IN");

  // What it shows now: the selected variant's own level.
  const selected = findVariant(variants, { size: "s" });
  check("the 2-unit variant is found", selected?.stock === 2);
  check("selected stock reads as LOW", stockState(selected!.stock) === "LOW");
}

console.log("\nA sold-out variant is not hidden by its siblings");

{
  const variants = [variant("big", "l", 40), variant("none", "s", 0)];
  const selected = findVariant(variants, { size: "s" });

  check("summed stock still reads as IN", stockState(availableStock({ stock: 0 }, variants)) === "IN");
  check("selected reads as OUT", stockState(selected!.stock) === "OUT");
}

console.log("\nProducts with nothing to configure are unchanged");

{
  const none: VariantView[] = [];
  check("no variants falls back to the product's own stock", availableStock({ stock: 3 }, none) === 3);
  check("and that level still decides the state", stockState(3) === "LOW");
  check("opening selection is empty", Object.keys(openingSelection(none)).length === 0);
}

console.log("\nThe page opens on a configuration that can be bought");

{
  const variants = [variant("cheap-out", "s", 0, 500), variant("dearer-in", "l", 7, 900)];
  const opening = openingSelection(variants);

  check(
    "opens on the in-stock variant, not the cheapest sold-out one",
    findVariant(variants, opening)?.id === "dearer-in",
  );

  // With nothing in stock at all it still opens somewhere, so the picker is
  // never left with no selection to render.
  const allOut = [variant("a", "s", 0, 500), variant("b", "l", 0, 900)];
  check("falls back to the cheapest when all are sold out", findVariant(allOut, openingSelection(allOut))?.id === "a");
}

/**
 * The catalogue pass, in a function because `tsx` compiles these scripts to
 * CommonJS and top-level await is not available there.
 */
async function scanCatalogue() {
  console.log("\nAgainst the real catalogue");

  const products = await prisma.product.findMany({
    where: { variants: { some: {} } },
    select: {
      name: true,
      slug: true,
      stock: true,
      variants: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sku: true,
          priceCents: true,
          stock: true,
          image: true,
          options: {
            select: {
              definitionId: true,
              value: true,
              valueKey: true,
              definition: { select: { label: true, unit: true, sortOrder: true } },
            },
          },
        },
      },
    },
  });

  console.log(`  ${products.length} product(s) with variants`);

  let divergent = 0;

  for (const product of products) {
    const variants: VariantView[] = product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      priceCents: v.priceCents,
      stock: v.stock,
      image: v.image,
      options: v.options.map((o) => ({
        definitionId: o.definitionId,
        label: o.definition.label,
        unit: o.definition.unit,
        sortOrder: o.definition.sortOrder,
        value: o.value,
        valueKey: o.valueKey,
      })),
    }));

    const summedState = stockState(availableStock(product, variants));

    // Every configuration a shopper can reach, not just the opening one.
    for (const v of variants) {
      const state = stockState(v.stock);
      if (state !== summedState) {
        divergent++;
        console.log(
          `  /${product.slug} — ${v.sku ?? v.id}: ${v.stock} unit(s) → ${state}, ` +
            `listing total → ${summedState}`,
        );
      }
    }
  }

  console.log(
    divergent === 0
      ? `  no configuration currently disagrees with its listing total\n` +
          `  (set a variant to <= ${LOW_STOCK_THRESHOLD} on a well-stocked product to see the fix bite)`
      : `  ${divergent} configuration(s) the old pill would have mislabelled`,
  );

  await prisma.$disconnect();
}

scanCatalogue().then(() => {
  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
});
