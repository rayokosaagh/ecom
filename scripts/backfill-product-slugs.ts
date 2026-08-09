import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { slugify } from "../src/lib/products/validation";

/**
 * Rewrite every product slug from its name.
 *
 * The product form used to treat any pre-filled slug as hand-edited, so renaming
 * a product left the old slug (and old URL) behind. That is fixed in the form;
 * this brings the rows already in the database back in line.
 *
 *   npm run slugs:products -- --dry-run   # print the plan, change nothing
 *   npm run slugs:products                # apply it
 */
const dryRun = process.argv.slice(2).includes("--dry-run");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Start the database with `npm run db`.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** A transient slug held between the two write passes. See `apply`. */
function stagingSlug(id: string): string {
  return `tmp-reslug-${id}`;
}

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: "asc" },
  });

  const taken = new Set<string>();
  const plan: { id: string; name: string; from: string; to: string }[] = [];
  const skipped: { name: string; slug: string }[] = [];

  // First pass reserves the products whose slug is already what the name
  // produces, so a product that is right today keeps its URL and any duplicate
  // name is the one that gets suffixed.
  const pending: typeof products = [];
  for (const product of products) {
    const base = slugify(product.name);
    if (!base) {
      // A name of only punctuation or non-Latin script slugifies to nothing.
      // Leaving the existing slug alone beats inventing one.
      skipped.push({ name: product.name, slug: product.slug });
      taken.add(product.slug);
    } else if (product.slug === base) {
      taken.add(base);
    } else {
      pending.push(product);
    }
  }

  for (const product of pending) {
    const base = slugify(product.name);
    let candidate = base;
    // Two products can legitimately share a name; the slug column cannot.
    for (let n = 2; taken.has(candidate); n += 1) candidate = `${base}-${n}`;
    taken.add(candidate);
    plan.push({ id: product.id, name: product.name, from: product.slug, to: candidate });
  }

  console.log(`${products.length} product(s) scanned.`);
  for (const { name, slug } of skipped) {
    console.warn(`skip  ${name} — name has no slug-able characters, kept "${slug}"`);
  }

  if (plan.length === 0) {
    console.log("Every slug already matches its product name. Nothing to do.");
    return;
  }

  for (const { name, from, to } of plan) {
    console.log(`${dryRun ? "would " : ""}rename  ${from} -> ${to}   (${name})`);
  }

  if (dryRun) {
    console.log(`\nDry run: ${plan.length} product(s) would change. Re-run without --dry-run to apply.`);
    return;
  }

  // Two passes, because slug is unique and non-deferrable: renaming A to B's
  // slug while B is still holding it fails even when B is about to move away.
  // Parking every changing row on a staging value first makes the order of the
  // final writes irrelevant.
  await prisma.$transaction([
    ...plan.map(({ id }) =>
      prisma.product.update({ where: { id }, data: { slug: stagingSlug(id) } }),
    ),
    ...plan.map(({ id, to }) =>
      prisma.product.update({ where: { id }, data: { slug: to } }),
    ),
  ]);

  console.log(`\n${plan.length} product slug(s) updated.`);
  console.log("Old /products/<slug> URLs now 404 — restart the app to clear cached pages.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
