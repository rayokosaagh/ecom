import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { slugify } from "../src/lib/products/validation";

/**
 * Subcategories and feature filters for the sample catalogue.
 *
 *   npm run seed:taxonomy            # apply
 *   npm run seed:taxonomy -- --dry   # print what would change, touch nothing
 *
 * Idempotent throughout: categories are matched by slug, definitions by key,
 * and product specs by their (product, definition) pair, so a second run is a
 * no-op rather than a duplicate.
 *
 * Products are *moved* into a subcategory rather than copied. That is safe
 * because `/products?category=audio` resolves through
 * `getCategoryAndDescendantIds`, so the parent shelf still lists everything
 * underneath it — a shopper browsing Audio keeps seeing all five products, and
 * gains Headphones / Earbuds / Speakers as a way to narrow.
 *
 * The spec values are the ones a demo catalogue needs to have *something*
 * sensible to filter on. They are drawn from what each product plainly is — a
 * pendant lamp takes a bulb, an open-back studio headphone has no active noise
 * cancelling — and are not manufacturer data. Correct anything that matters
 * from the product form; this script will not overwrite it on a later run.
 */

const dry = process.argv.includes("--dry");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** Subcategories to create, and which products move into each. */
const SUBCATEGORIES: Array<{
  parent: string;
  name: string;
  products: string[];
}> = [
  { parent: "audio", name: "Headphones", products: ["aurora-wireless-headphones", "sennheiser-hd-490-pro-open"] },
  { parent: "audio", name: "Earbuds", products: ["airpods-pro-3", "soundcore-life-p3"] },
  { parent: "audio", name: "Speakers", products: ["jbl-partybox"] },

  { parent: "peripherals", name: "Keyboards", products: ["keychron-k2"] },
  { parent: "peripherals", name: "Mice", products: ["razer-viper-v3-pro-gengar-edition", "vector-wireless-mouse"] },
  { parent: "peripherals", name: "Monitors", products: ["lg-34-ultrawide-qhd-hdr-freesync"] },

  { parent: "accessories", name: "Chargers", products: ["anker-prime-charger"] },
  { parent: "accessories", name: "Bags", products: ["bellroy-classic-backpack", "summit-daypack", "transit-field-pack"] },

  { parent: "lighting", name: "Desk lamps", products: ["lumen-desk-lamp"] },
  { parent: "lighting", name: "Floor lamps", products: ["halo-floor-lamp"] },
  { parent: "lighting", name: "Pendant lights", products: ["arc-studio-pendant", "ember-brass-pendant"] },
];

/**
 * Filterable features, one block per definition.
 *
 * Only labels the existing 32 do not already cover — "Connection", "Bulb type",
 * "Switch type" and the rest are reused rather than duplicated, because two
 * definitions meaning the same thing split a facet in half.
 */
const FEATURES: Array<{
  label: string;
  group: string;
  icon: string;
  sortOrder: number;
  values: Record<string, string[]>;
}> = [
  {
    label: "Noise cancelling",
    group: "Sound",
    icon: "noise_control_on",
    sortOrder: 16,
    values: {
      Active: ["airpods-pro-3", "aurora-wireless-headphones", "soundcore-life-p3"],
      // Open-back studio monitoring: no ANC by design, not an omission.
      None: ["sennheiser-hd-490-pro-open"],
    },
  },
  {
    label: "Wearing style",
    group: "Sound",
    icon: "headphones",
    sortOrder: 18,
    values: {
      "Over-ear": ["aurora-wireless-headphones", "sennheiser-hd-490-pro-open"],
      "In-ear": ["airpods-pro-3", "soundcore-life-p3"],
    },
  },
  {
    label: "Backlighting",
    group: "Key feel",
    icon: "keyboard_alt",
    sortOrder: 11,
    values: {
      RGB: ["keychron-k2", "razer-viper-v3-pro-gengar-edition"],
      None: ["vector-wireless-mouse"],
    },
  },
  {
    label: "Dimmable",
    group: "Light",
    icon: "brightness_medium",
    sortOrder: 20,
    values: {
      Yes: ["lumen-desk-lamp", "halo-floor-lamp", "arc-studio-pendant"],
      No: ["ember-brass-pendant"],
    },
  },
  {
    label: "Weather resistance",
    group: "Build",
    icon: "umbrella",
    sortOrder: 22,
    values: {
      "Water-repellent": ["bellroy-classic-backpack", "summit-daypack"],
      Weatherproof: ["transit-field-pack"],
    },
  },
];

async function main() {
  console.log(dry ? "DRY RUN — nothing will be written\n" : "Applying\n");

  // ---------- categories ----------
  console.log("=== subcategories ===");
  let created = 0;
  let moved = 0;

  for (const entry of SUBCATEGORIES) {
    const parent = await prisma.category.findUnique({ where: { slug: entry.parent } });
    if (!parent) {
      console.log(`  !! parent "${entry.parent}" not found — skipping ${entry.name}`);
      continue;
    }

    const slug = slugify(entry.name);
    const existing = await prisma.category.findUnique({ where: { slug } });

    if (!existing) {
      if (!dry) {
        await prisma.category.create({
          data: { name: entry.name, slug, parentId: parent.id },
        });
      }
      created++;
      console.log(`  +  ${parent.name} > ${entry.name}`);
    } else {
      console.log(`  =  ${parent.name} > ${entry.name} (already there)`);
    }

    const target = existing ?? (dry ? null : await prisma.category.findUnique({ where: { slug } }));
    if (!target) continue;

    for (const productSlug of entry.products) {
      const product = await prisma.product.findUnique({
        where: { slug: productSlug },
        select: { id: true, name: true, categoryId: true },
      });
      if (!product) {
        console.log(`     !! no product "${productSlug}"`);
        continue;
      }
      if (product.categoryId === target.id) continue;

      if (!dry) {
        await prisma.product.update({
          where: { id: product.id },
          data: { categoryId: target.id },
        });
      }
      moved++;
      console.log(`     -> ${product.name}`);
    }
  }

  // ---------- features ----------
  console.log("\n=== feature filters ===");
  let defsAdded = 0;
  let specsAdded = 0;

  for (const feature of FEATURES) {
    const key = slugify(feature.label);
    let definition = await prisma.specDefinition.findUnique({ where: { key } });

    if (!definition) {
      if (!dry) {
        definition = await prisma.specDefinition.create({
          data: {
            label: feature.label,
            key,
            group: feature.group,
            icon: feature.icon,
            sortOrder: feature.sortOrder,
            filterable: true,
          },
        });
      }
      defsAdded++;
      console.log(`  +  ${feature.label}  [${feature.group}]`);
    } else {
      console.log(`  =  ${feature.label} (already defined)`);
    }
    if (!definition) continue; // dry run, nothing to attach to

    for (const [value, slugs] of Object.entries(feature.values)) {
      for (const productSlug of slugs) {
        const product = await prisma.product.findUnique({
          where: { slug: productSlug },
          select: { id: true, name: true },
        });
        if (!product) {
          console.log(`     !! no product "${productSlug}"`);
          continue;
        }

        const already = await prisma.productSpec.findUnique({
          where: {
            productId_definitionId: { productId: product.id, definitionId: definition.id },
          },
        });
        // Never overwrite: a value corrected by hand in the admin has to
        // survive a re-run of this script.
        if (already) continue;

        if (!dry) {
          await prisma.productSpec.create({
            data: {
              productId: product.id,
              definitionId: definition.id,
              value,
              valueKey: slugify(value),
            },
          });
        }
        specsAdded++;
        console.log(`     ${value.padEnd(16)} ${product.name}`);
      }
    }
  }

  console.log(
    `\n${created} categor${created === 1 ? "y" : "ies"} created, ${moved} product(s) moved, ` +
      `${defsAdded} filter(s) defined, ${specsAdded} value(s) set.`,
  );
  if (dry) console.log("(dry run — nothing was written)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
