import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { slugify } from "../src/lib/products/validation";

/**
 * More sample products, filling out the subcategories that had one or two.
 *
 *   npm run seed:products            # apply
 *   npm run seed:products -- --dry   # list what would be added, write nothing
 *
 * Idempotent on `slug`: a product that already exists is left entirely alone,
 * including any edits made to it in the admin.
 *
 * Prices are in the shop's minor units, which is NPR paisa — the same scale the
 * existing catalogue uses (Rs 3,300 to Rs 354,900). They are *not* converted at
 * render, so a figure written here must already be in shop currency; see the
 * note on NEXT_PUBLIC_SHOP_CURRENCY in .env.example.
 *
 * Images come from Unsplash at the same `?w=800&q=80` the seeded catalogue
 * already uses, so nothing here depends on a file being uploaded first.
 */

const dry = process.argv.includes("--dry");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=800&q=80`;

interface Seed {
  name: string;
  category: string;
  brand: string | null;
  description: string;
  priceCents: number;
  /** Set to show a struck-through "was" price. */
  compareAtPriceCents?: number;
  stock: number;
  image: string;
  gallery?: string[];
  colors?: Array<{ name: string; hex: string }>;
  /** Label → value, matched to existing SpecDefinitions by label. */
  specs?: Record<string, string>;
}

const PRODUCTS: Seed[] = [
  // ---------- Audio › Headphones ----------
  {
    name: "Sony WH-1000XM5",
    category: "headphones",
    brand: "Sony",
    description:
      "The reference for travel headphones. Eight microphones feeding two processors, a 30-hour battery, and a fold-flat case that survives being shoved in a bag.",
    priceCents: 5200000,
    compareAtPriceCents: 5990000,
    stock: 18,
    image: U("1618366712010-f4ae9c647dcb"),
    colors: [
      { name: "Midnight Black", hex: "#1b1b1f" },
      { name: "Platinum Silver", hex: "#e3e2e8" },
    ],
    specs: { "Noise cancelling": "Active", "Wearing style": "Over-ear", Connection: "Bluetooth", "Battery life": "30", "Driver size": "30" },
  },
  {
    name: "Audio-Technica ATH-M50x",
    category: "headphones",
    brand: null,
    description:
      "The studio closed-back that ended up on every desk. No wireless, no app, no cancelling — just a flat response and a cable you can replace.",
    priceCents: 2100000,
    stock: 25,
    image: U("1487215078519-e21cc028cb29"),
    specs: { "Noise cancelling": "None", "Wearing style": "Over-ear", Connection: "Wired", "Driver size": "45" },
  },

  // ---------- Audio › Earbuds ----------
  {
    name: "Sony WF-1000XM5",
    category: "earbuds",
    brand: "Sony",
    description:
      "Cancelling that holds up on a bus, in buds small enough to forget. Eight hours in the ear and sixteen more in the case.",
    priceCents: 3400000,
    stock: 30,
    image: U("1590658268037-6bf12165a8df"),
    colors: [
      { name: "Midnight Black", hex: "#1b1b1f" },
      { name: "Starlight", hex: "#f5f4f9" },
    ],
    specs: { "Noise cancelling": "Active", "Wearing style": "In-ear", Connection: "Bluetooth", "Battery life": "8" },
  },
  {
    name: "Sennheiser Momentum 4",
    category: "earbuds",
    brand: "Sennheiser",
    description:
      "Tuned by people who make studio monitors, which shows the moment anything acoustic is playing. Adaptive cancelling, seven-hour battery.",
    priceCents: 2950000,
    compareAtPriceCents: 3400000,
    stock: 14,
    image: U("1606220945770-b5b6c2c55bf1"),
    specs: { "Noise cancelling": "Active", "Wearing style": "In-ear", Connection: "Bluetooth", "Battery life": "7" },
  },

  // ---------- Audio › Speakers ----------
  {
    name: "Sonos Era 100",
    category: "speakers",
    brand: null,
    description:
      "A shelf speaker that fills a room without asking for a subwoofer. Two tweeters for real stereo, and it tunes itself to the walls around it.",
    priceCents: 3200000,
    stock: 12,
    image: U("1545454675-3531b543be5d"),
    specs: { Connection: "Wi-Fi", "Noise cancelling": "None" },
  },
  {
    name: "JBL Flip 6",
    category: "speakers",
    brand: "JBL",
    description:
      "The one that goes in the bag. Twelve hours, properly waterproof, and loud enough to be a nuisance to a whole beach.",
    priceCents: 1450000,
    stock: 40,
    image: U("1608043152269-423dbba4e7e1"),
    colors: [
      { name: "Midnight Black", hex: "#1b1b1f" },
      { name: "Cobalt", hex: "#0b57d0" },
    ],
    specs: { Connection: "Bluetooth", "Battery life": "12" },
  },

  // ---------- Peripherals › Keyboards ----------
  {
    name: "Logitech MX Keys S",
    category: "keyboards",
    brand: "Logitech",
    description:
      "Low-profile scissor switches with the backlight that comes up as your hands approach. Pairs to three machines and switches with one key.",
    priceCents: 1600000,
    stock: 22,
    image: U("1587829741301-dc798b83add3"),
    specs: { Connection: "Bluetooth", Backlighting: "White", "Switch type": "Scissor" },
  },
  {
    name: "Keychron Q1 Pro",
    category: "keyboards",
    brand: "Keychron",
    description:
      "A gasket-mounted aluminium board that sounds like the hobby it comes from. Hot-swappable, QMK, and heavy enough to stay where it is put.",
    priceCents: 2600000,
    compareAtPriceCents: 2950000,
    stock: 9,
    image: U("1595225476474-87563907a212"),
    colors: [
      { name: "Space Grey", hex: "#44474f" },
      { name: "Silver", hex: "#e3e2e8" },
    ],
    specs: { Connection: "Bluetooth", Backlighting: "RGB", "Switch type": "Mechanical" },
  },

  // ---------- Peripherals › Mice ----------
  {
    name: "Logitech MX Master 3S",
    category: "mice",
    brand: "Logitech",
    description:
      "The scroll wheel that spins free through a thousand-line file and stops dead when you grab it. Quiet clicks, eight programmable buttons.",
    priceCents: 1350000,
    stock: 35,
    image: U("1527864550417-7fd91fc51a46"),
    colors: [
      { name: "Space Grey", hex: "#44474f" },
      { name: "Starlight", hex: "#f5f4f9" },
    ],
    specs: { Connection: "Bluetooth", Backlighting: "None" },
  },
  {
    name: "Razer DeathAdder V3",
    category: "mice",
    brand: "Razer",
    description:
      "Fifty-nine grams with no holes drilled in it. The shape that has been on esports desks for a decade, finally without the weight.",
    priceCents: 1100000,
    stock: 27,
    image: U("1615663245857-ac93bb7c39e7"),
    specs: { Connection: "Wireless", Backlighting: "None" },
  },

  // ---------- Peripherals › Monitors ----------
  {
    name: "Dell UltraSharp U2723QE",
    category: "monitors",
    brand: "Dell",
    description:
      "27 inches of 4K IPS Black, which is the panel that finally gives an IPS a contrast ratio worth quoting. One cable carries video, data and 90W of power.",
    priceCents: 7900000,
    stock: 8,
    image: U("1527443224154-c4a3942d3acf"),
    specs: { "Panel type": "IPS", Resolution: "3840x2160", "Refresh rate": "60", "Screen size": "27", Ports: "USB-C" },
  },
  {
    name: "ASUS ProArt PA278CV",
    category: "monitors",
    brand: "ASUS",
    description:
      "Calibrated at the factory to Delta E under two, which is the difference between guessing at colour and knowing. 1440p across 27 inches.",
    priceCents: 4600000,
    compareAtPriceCents: 5300000,
    stock: 11,
    image: U("1585792180666-f7347c490ee2"),
    specs: { "Panel type": "IPS", Resolution: "2560x1440", "Refresh rate": "75", "Screen size": "27" },
  },

  // ---------- Accessories › Chargers ----------
  {
    name: "Anker 737 Power Bank",
    category: "chargers",
    brand: "Anker",
    description:
      "24,000mAh and 140W in both directions, so it refills a laptop and then refills itself in an hour. The little screen tells you exactly what it is doing.",
    priceCents: 1750000,
    stock: 20,
    image: U("1609091839311-d5365f9ff1c5"),
    specs: { Capacity: "24000", "Charging Methods": "USB-C", "Quick Charge": "Yes" },
  },
  {
    name: "Belkin BoostCharge Pro 3-in-1",
    category: "chargers",
    brand: null,
    description:
      "Phone, watch and buds on one pad, all upright where you can see them. Magnetic alignment, so nothing has to be nudged into place at midnight.",
    priceCents: 1450000,
    stock: 16,
    image: U("1601972599720-36938d4ecd31"),
    specs: { "Charging Methods": "Wireless", "Quick Charge": "Yes" },
  },

  // ---------- Accessories › Bags ----------
  {
    name: "Peak Design Everyday Backpack 20L",
    category: "bags",
    brand: "Peak Design",
    description:
      "The origami dividers that made the brand, in a bag that opens from either side without being taken off. Fits a 16-inch machine and a body with two lenses.",
    priceCents: 3300000,
    stock: 13,
    image: U("1553062407-98eeb64c6a62"),
    colors: [
      { name: "Midnight Black", hex: "#1b1b1f" },
      { name: "Forest", hex: "#146c2e" },
    ],
    specs: { "Weather resistance": "Weatherproof", Capacity: "20" },
  },
  {
    name: "Bellroy Tokyo Totepack",
    category: "bags",
    brand: "Bellroy",
    description:
      "A tote until you need both hands, then a backpack. Woven from recycled fabric with a panel that stays flat against your back.",
    priceCents: 2400000,
    compareAtPriceCents: 2800000,
    stock: 17,
    image: U("1548036328-c9fa89d128fa"),
    specs: { "Weather resistance": "Water-repellent", Capacity: "14" },
  },

  // ---------- Lighting ----------
  {
    name: "BenQ ScreenBar Halo",
    category: "desk-lamps",
    brand: null,
    description:
      "Clips to the top of a monitor and lights the desk without lighting the screen. Asymmetric optics, so there is no reflection to work around.",
    priceCents: 2200000,
    stock: 15,
    image: U("1517991104123-1d56a6e81ed9"),
    specs: { Dimmable: "Yes", Brightness: "500", "Bulb type": "LED" },
  },
  {
    name: "Anglepoise Type 75",
    category: "desk-lamps",
    brand: null,
    description:
      "Kenneth Grange's revision of the lamp that has been on drawing boards since 1935. Springs balanced so it stays exactly where it is left.",
    priceCents: 3900000,
    stock: 7,
    image: U("1507473885765-e6ed057f782c"),
    colors: [
      { name: "Midnight Black", hex: "#1b1b1f" },
      { name: "Crimson", hex: "#8c1d18" },
    ],
    specs: { Dimmable: "No", "Bulb type": "E27" },
  },
  {
    name: "Meridian Arc Floor Lamp",
    category: "floor-lamps",
    brand: null,
    description:
      "A brushed steel arc that reaches over a sofa from behind it, so the light lands on the page and not in anyone's eyes.",
    priceCents: 4700000,
    stock: 6,
    image: U("1543198126-a4d9b4b0e57e"),
    specs: { Dimmable: "Yes", "Bulb type": "LED", Brightness: "800" },
  },
];

async function main() {
  console.log(dry ? "DRY RUN — nothing will be written\n" : "Applying\n");

  // Attributed to the first admin, matching how the seeded catalogue was made.
  const author = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const categories = new Map(
    (await prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]),
  );
  const brands = new Map(
    (await prisma.brand.findMany({ select: { id: true, name: true } })).map((b) => [b.name, b.id]),
  );
  const definitions = new Map(
    (await prisma.specDefinition.findMany({ select: { id: true, label: true } })).map((d) => [d.label, d.id]),
  );

  let added = 0;
  let skipped = 0;
  const missingSpecs = new Set<string>();

  for (const seed of PRODUCTS) {
    const slug = slugify(seed.name);

    if (await prisma.product.findUnique({ where: { slug }, select: { id: true } })) {
      skipped++;
      console.log(`  =  ${seed.name} (already exists)`);
      continue;
    }

    const categoryId = categories.get(seed.category);
    if (!categoryId) {
      console.log(`  !! ${seed.name}: no category "${seed.category}" — skipped`);
      continue;
    }

    const specRows = Object.entries(seed.specs ?? {}).flatMap(([label, value]) => {
      const definitionId = definitions.get(label);
      if (!definitionId) {
        missingSpecs.add(label);
        return [];
      }
      return [{ definitionId, value, valueKey: slugify(value) }];
    });

    if (!dry) {
      await prisma.product.create({
        data: {
          name: seed.name,
          slug,
          description: seed.description,
          image: seed.image,
          gallery: seed.gallery ?? [],
          priceCents: seed.priceCents,
          compareAtPriceCents: seed.compareAtPriceCents ?? null,
          stock: seed.stock,
          published: true,
          categoryId,
          brandId: seed.brand ? (brands.get(seed.brand) ?? null) : null,
          createdById: author?.id ?? null,
          colors: {
            create: (seed.colors ?? []).map((c, i) => ({
              name: c.name,
              hex: c.hex,
              image: i === 0 ? seed.image : null,
              gallery: [],
              sortOrder: i,
            })),
          },
          specs: { create: specRows },
        },
      });
    }

    added++;
    const price = (seed.priceCents / 100).toLocaleString("en-IN");
    console.log(
      `  +  ${seed.name.padEnd(34)} ${seed.category.padEnd(13)} Rs ${price}` +
        `${seed.compareAtPriceCents ? "  (on sale)" : ""}`,
    );
  }

  if (missingSpecs.size > 0) {
    console.log(`\n  note: no SpecDefinition for ${[...missingSpecs].join(", ")} — those values were skipped.`);
  }
  console.log(`\n${added} added, ${skipped} already present.`);
  if (dry) console.log("(dry run — nothing was written)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
