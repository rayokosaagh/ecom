import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { sanitizeSvg } from "../src/lib/brands/svg";

/**
 * Fill in brand marks from Simple Icons.
 *
 *   npm run brands:icons          # only brands that have no mark yet
 *   npm run brands:icons -- --force   # re-fetch and overwrite existing marks
 *
 * Simple Icons publishes one monochrome path per brand on a 24x24 viewBox with
 * no fill of its own, which is exactly the shape this feature wants: the mark
 * inherits `currentColor` from the text beside it and works in both themes
 * from a single file.
 *
 * The slug map below is written out by hand rather than derived from the brand
 * name. Simple Icons' slugs do not always match ("Peak Design" is
 * `peakdesign`), and a silently wrong slug would put another company's logo
 * next to your products — that is worth being explicit about.
 *
 * Brands absent from the map keep no mark. That is deliberate: an invented
 * logo beside a real manufacturer's name misrepresents them, and the UI
 * already renders cleanly with no mark at all. Add those by hand from
 * /admin/brands.
 *
 * Everything fetched still goes through `lib/brands/svg` before it is stored —
 * a CDN is not a trust boundary.
 */

const SIMPLE_ICONS: Record<string, string> = {
  ASUS: "asus",
  Apple: "apple",
  Dell: "dell",
  IKEA: "ikea",
  JBL: "jbl",
  LG: "lg",
  Logitech: "logitech",
  "Peak Design": "peakdesign",
  Razer: "razer",
  Sennheiser: "sennheiser",
  Sony: "sony",
};

const CDN = "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons";

const force = process.argv.includes("--force");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Start the database with `npm run db`.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function fetchIcon(slug: string): Promise<string | null> {
  const response = await fetch(`${CDN}/${slug}.svg`);
  if (!response.ok) return null;
  if (!(response.headers.get("content-type") ?? "").includes("svg")) return null;
  return response.text();
}

async function main() {
  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, iconSvg: true },
  });

  let updated = 0;
  const skipped: string[] = [];
  const unmapped: string[] = [];

  for (const brand of brands) {
    const slug = SIMPLE_ICONS[brand.name];

    if (!slug) {
      unmapped.push(brand.name);
      continue;
    }

    if (brand.iconSvg && !force) {
      skipped.push(brand.name);
      continue;
    }

    const source = await fetchIcon(slug);
    if (!source) {
      console.log(`  !  ${brand.name.padEnd(14)} could not fetch "${slug}"`);
      continue;
    }

    const cleaned = sanitizeSvg(source);
    if (!cleaned.ok) {
      console.log(`  !  ${brand.name.padEnd(14)} rejected: ${cleaned.error}`);
      continue;
    }

    await prisma.brand.update({
      where: { id: brand.id },
      data: { iconSvg: cleaned.svg },
    });

    console.log(`  ok ${brand.name.padEnd(14)} ${cleaned.svg.length} bytes`);
    updated++;
  }

  console.log(`\n${updated} mark(s) written.`);
  if (skipped.length > 0) {
    console.log(`Already had a mark (use --force to replace): ${skipped.join(", ")}`);
  }
  if (unmapped.length > 0) {
    console.log(`No Simple Icons entry, left without a mark: ${unmapped.join(", ")}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
