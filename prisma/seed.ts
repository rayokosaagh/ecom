import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { Role } from "../src/generated/prisma/enums";
import { hashPassword } from "../src/lib/auth/password";

/**
 * Seeds the first administrator plus sample products.
 *
 * Public signup only ever grants the USER role, so this script is the only way
 * to create the initial admin. Credentials come from the environment; the
 * fallbacks are development-only and must not be used anywhere reachable.
 */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@ecom.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "Store Admin";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Start the database with `npm run db`.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * Categories are a tree. `parentSlug` names the parent, and parents are
 * declared before their children so one pass can resolve every id.
 */
const CATEGORIES: Array<{
  name: string;
  slug: string;
  parentSlug?: string;
  /** Plain lead-in, then the display-serif accent — exactly as the home hero. */
  tagline?: string;
  taglineAccent?: string;
}> = [
  {
    name: "Audio",
    slug: "audio",
    tagline: "Everything you want to hear,",
    taglineAccent: "nothing you don’t.",
  },
  {
    name: "Peripherals",
    slug: "peripherals",
    tagline: "The tools your hands",
    taglineAccent: "actually touch.",
  },
  {
    name: "Lighting",
    slug: "lighting",
    tagline: "Light that works",
    taglineAccent: "as late as you do.",
  },
  {
    name: "Accessories",
    slug: "accessories",
    tagline: "The small things that",
    taglineAccent: "carry the big ones.",
  },

  // The laptop branch the promo banners point at.
  {
    name: "Laptops",
    slug: "laptops",
    tagline: "Serious machines,",
    taglineAccent: "seriously specified.",
  },
  { name: "Ultrabooks", slug: "ultrabooks", parentSlug: "laptops" },
  { name: "Workstations", slug: "workstations", parentSlug: "laptops" },
  { name: "Gaming Laptops", slug: "gaming-laptops", parentSlug: "laptops" },
  { name: "Student Laptops", slug: "student-laptops", parentSlug: "laptops" },
];

const BRANDS = [
  { name: "Anker", slug: "anker" },
  { name: "Apple", slug: "apple" },
  { name: "ASUS", slug: "asus" },
  { name: "Bellroy", slug: "bellroy" },
  { name: "Dell", slug: "dell" },
  { name: "IKEA", slug: "ikea" },
  { name: "JBL", slug: "jbl" },
  { name: "Keychron", slug: "keychron" },
  { name: "LG", slug: "lg" },
  { name: "Logitech", slug: "logitech" },
  { name: "Muuto", slug: "muuto" },
  { name: "Osprey", slug: "osprey" },
  { name: "Peak Design", slug: "peak-design" },
  { name: "Philips", slug: "philips" },
  { name: "Razer", slug: "razer" },
  { name: "Sennheiser", slug: "sennheiser" },
  { name: "Sony", slug: "sony" },
];

// Images are remote URLs — see the note in ProductCard about why these are not
// routed through next/image.
const SAMPLE_PRODUCTS: Array<{
  name: string;
  slug: string;
  description: string;
  categorySlug: string;
  brandSlug: string;
  image: string;
  gallery: string[];
  colors: Array<{ name: string; hex: string; image: string | null }>;
  priceCents: number;
  stock: number;
  published: boolean;
}> = [
  // --- Audio ---------------------------------------------------------------
  {
    name: "Aurora Wireless Headphones",
    slug: "aurora-wireless-headphones",
    description:
      "Over-ear headphones with adaptive noise cancelling, 40-hour battery life and a machined aluminium headband.",
    categorySlug: "audio",
    brandSlug: "sony",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80",
    gallery: ["https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&q=80"],
    colors: [
      { name: "Midnight Black", hex: "#1b1b1f", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80" },
      { name: "Cobalt", hex: "#0b57d0", image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&q=80" },
    ],
    priceCents: 3540000,
    stock: 42,
    published: true,
  },
  {
    name: "Studio Reference Headphones",
    slug: "studio-reference-headphones",
    description:
      "Closed-back, flat response, replaceable pads. Built for mixing rather than for impressing anyone on a train.",
    categorySlug: "audio",
    brandSlug: "sennheiser",
    image: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&q=80",
    gallery: [],
    colors: [{ name: "Graphite", hex: "#303034", image: null }],
    priceCents: 2830000,
    stock: 21,
    published: true,
  },
  {
    name: "Pulse Wireless Earbuds",
    slug: "pulse-wireless-earbuds",
    description:
      "Six hours a charge, twenty-four in the case, and a fit that survives a run. Transparency mode you can hold a conversation through.",
    categorySlug: "audio",
    brandSlug: "anker",
    image: "https://images.unsplash.com/photo-1585155770447-2f66e2a397b5?w=800&q=80",
    gallery: [],
    colors: [{ name: "Starlight", hex: "#f5f4f9", image: null }],
    priceCents: 1830000,
    stock: 56,
    published: true,
  },
  {
    name: "Cadence Portable Speaker",
    slug: "cadence-portable-speaker",
    description:
      "A rugged Bluetooth speaker with a woven grille, twelve hours of playback and enough bass to fill a kitchen.",
    categorySlug: "audio",
    brandSlug: "jbl",
    image: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80",
    gallery: [],
    colors: [{ name: "Midnight Black", hex: "#1b1b1f", image: null }],
    priceCents: 1830000,
    stock: 30,
    published: true,
  },

  // --- Peripherals ---------------------------------------------------------
  {
    name: "Meridian Mechanical Keyboard",
    slug: "meridian-mechanical-keyboard",
    description:
      "Hot-swappable 75% keyboard with a gasket mount, PBT double-shot keycaps and a contrast escape key.",
    categorySlug: "peripherals",
    brandSlug: "keychron",
    image: "https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=800&q=80",
    gallery: ["https://images.unsplash.com/photo-1595225476474-87563907a212?w=800&q=80"],
    colors: [
      { name: "Graphite", hex: "#303034", image: "https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=800&q=80" },
      { name: "Sky Blue", hex: "#c2e7ff", image: "https://images.unsplash.com/photo-1595225476474-87563907a212?w=800&q=80" },
    ],
    priceCents: 2260000,
    stock: 18,
    published: true,
  },
  {
    name: "Vector Wireless Mouse",
    slug: "vector-wireless-mouse",
    description:
      "An 8K polling rate, 60 g shell and a battery measured in months rather than days.",
    categorySlug: "peripherals",
    brandSlug: "logitech",
    image: "https://images.unsplash.com/photo-1527814050087-3793815479db?w=800&q=80",
    gallery: [],
    colors: [{ name: "Starlight", hex: "#f5f4f9", image: null }],
    priceCents: 1260000,
    stock: 44,
    published: true,
  },
  {
    name: "Apex Gaming Mouse",
    slug: "apex-gaming-mouse",
    description:
      "A matte black shell, optical switches rated to 90 million clicks and a sensor that keeps up with any of them.",
    categorySlug: "peripherals",
    brandSlug: "razer",
    image: "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=800&q=80",
    gallery: [],
    colors: [{ name: "Midnight Black", hex: "#1b1b1f", image: null }],
    priceCents: 980000,
    stock: 33,
    published: true,
  },
  {
    name: "Panorama 34in Ultrawide",
    slug: "panorama-34-ultrawide",
    description:
      "3440x1440 at 144 Hz on a gentle curve. One cable carries picture, data and 90 W of charge to the machine beside it.",
    categorySlug: "peripherals",
    brandSlug: "lg",
    image: "https://images.unsplash.com/photo-1593642532400-2682810df593?w=800&q=80",
    gallery: [],
    colors: [{ name: "Space Grey", hex: "#44474f", image: null }],
    priceCents: 10640000,
    stock: 9,
    published: true,
  },

  // --- Lighting ------------------------------------------------------------
  {
    name: "Lumen Desk Lamp",
    slug: "lumen-desk-lamp",
    description:
      "Tunable white LED lamp with a weighted base and a stepless dimmer that remembers your last setting.",
    categorySlug: "lighting",
    brandSlug: "philips",
    image: "https://images.unsplash.com/photo-1611269154421-4e27233ac5c7?w=800&q=80",
    gallery: [],
    colors: [{ name: "Starlight", hex: "#f5f4f9", image: null }],
    priceCents: 1260000,
    stock: 14,
    published: true,
  },
  {
    name: "Halo Floor Lamp",
    slug: "halo-floor-lamp",
    description:
      "A steel shade on a slim stem that tilts where you point it, so the light lands on the page and not the screen.",
    categorySlug: "lighting",
    brandSlug: "ikea",
    image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&q=80",
    gallery: [],
    colors: [{ name: "Graphite", hex: "#303034", image: null }],
    priceCents: 2680000,
    stock: 17,
    published: true,
  },
  {
    name: "Ember Brass Pendant",
    slug: "ember-brass-pendant",
    description:
      "Spun brass shades on braided cord, hung at staggered heights. Warm, dimmable, and quiet enough to sit over a table.",
    categorySlug: "lighting",
    brandSlug: "muuto",
    image: "https://images.unsplash.com/photo-1540932239986-30128078f3c5?w=800&q=80",
    gallery: [],
    colors: [{ name: "Brass", hex: "#a6f5b6", image: null }],
    priceCents: 3250000,
    stock: 11,
    published: true,
  },
  {
    name: "Arc Studio Pendant",
    slug: "arc-studio-pendant",
    description:
      "A wide enamelled shade that spreads light flat across a worktop instead of pooling it in one spot.",
    categorySlug: "lighting",
    brandSlug: "philips",
    image: "https://images.unsplash.com/photo-1524484485831-a92ffc0de03f?w=800&q=80",
    gallery: [],
    colors: [{ name: "Starlight", hex: "#f5f4f9", image: null }],
    priceCents: 1690000,
    stock: 25,
    published: true,
  },

  // --- Accessories ---------------------------------------------------------
  {
    name: "Carbon Commuter Backpack",
    slug: "carbon-commuter-backpack",
    description:
      "A structured 18-litre pack in water-resistant canvas, with a suspended laptop sleeve that keeps a dropped bag off the machine inside it.",
    categorySlug: "accessories",
    brandSlug: "bellroy",
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80",
    gallery: [],
    colors: [{ name: "Midnight Black", hex: "#1b1b1f", image: null }],
    priceCents: 840000,
    stock: 63,
    published: true,
  },
  {
    name: "Transit Field Pack",
    slug: "transit-field-pack",
    description:
      "Waxed canvas and leather buckles over a 22-litre roll-top. Built to be thrown in a boot and still look right.",
    categorySlug: "accessories",
    brandSlug: "peak-design",
    image: "https://images.unsplash.com/photo-1547949003-9792a18a2601?w=800&q=80",
    gallery: [],
    colors: [{ name: "Slate", hex: "#44474f", image: null }],
    priceCents: 2120000,
    stock: 31,
    published: true,
  },
  {
    name: "Summit Daypack",
    slug: "summit-daypack",
    description:
      "A light 16-litre pack that packs down into its own pocket, with a flap that stays shut in wind.",
    categorySlug: "accessories",
    brandSlug: "osprey",
    image: "https://images.unsplash.com/photo-1491637639811-60e2756cc1c7?w=800&q=80",
    gallery: [],
    colors: [{ name: "Sage", hex: "#a6f5b6", image: null }],
    priceCents: 1120000,
    stock: 47,
    published: true,
  },
  {
    name: "Braided USB-C Charger",
    slug: "braided-usb-c-charger",
    description:
      "A 96 W folding-pin charger with a two-metre braided cable that survives being wrapped around it every day.",
    categorySlug: "accessories",
    brandSlug: "anker",
    image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=800&q=80",
    gallery: [],
    colors: [{ name: "Starlight", hex: "#f5f4f9", image: null }],
    priceCents: 410000,
    stock: 120,
    published: true,
  },

  // --- Laptops -------------------------------------------------------------
  // Brand follows what is visible in the photograph: an Apple machine is not
  // listed under a PC maker just to fill a slot.
  {
    name: "MacBook Air 15in M3",
    slug: "macbook-air-15-m3",
    description:
      "Fanless 15-inch ultrabook with the M3 chip, an 18-hour battery and a 500-nit Liquid Retina display.",
    categorySlug: "ultrabooks",
    brandSlug: "apple",
    image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80",
    gallery: ["https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&q=80"],
    colors: [
      { name: "Midnight Black", hex: "#1b1b1f", image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80" },
      { name: "Starlight", hex: "#e3e2e8", image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&q=80" },
    ],
    priceCents: 18450000,
    stock: 24,
    published: true,
  },
  {
    name: "Dell XPS 14",
    slug: "dell-xps-14",
    description:
      "Machined aluminium chassis, a 14.5-inch OLED panel and an RTX 4050 in a 1.7 kg body.",
    categorySlug: "ultrabooks",
    brandSlug: "dell",
    image: "https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=800&q=80",
    gallery: ["https://images.unsplash.com/photo-1593642634524-b40b5baae6bb?w=800&q=80"],
    colors: [{ name: "Platinum Silver", hex: "#e3e2e8", image: null }],
    priceCents: 21290000,
    stock: 11,
    published: true,
  },
  {
    name: "Dell Precision 5690",
    slug: "dell-precision-5690",
    description:
      "An ISV-certified mobile workstation with ECC memory support and a keyboard that survives a decade of typing.",
    categorySlug: "workstations",
    brandSlug: "dell",
    image: "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=800&q=80",
    gallery: [],
    colors: [{ name: "Space Grey", hex: "#44474f", image: null }],
    priceCents: 32650000,
    stock: 5,
    published: true,
  },
  {
    name: "ASUS ProArt Studiobook 16",
    slug: "asus-proart-studiobook-16",
    description:
      "Colour-calibrated 16-inch OLED, RTX 4070 and 64 GB of memory. Built for render queues rather than frame rates.",
    categorySlug: "workstations",
    brandSlug: "asus",
    image: "https://images.unsplash.com/photo-1593642702821-c8da6771f0c6?w=800&q=80",
    gallery: ["https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=800&q=80"],
    colors: [
      { name: "Mineral Black", hex: "#1b1b1f", image: "https://images.unsplash.com/photo-1593642702821-c8da6771f0c6?w=800&q=80" },
      { name: "Steel Blue", hex: "#0b57d0", image: "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=800&q=80" },
    ],
    priceCents: 35490000,
    stock: 7,
    published: true,
  },
  {
    name: "ASUS ROG Strix G16",
    slug: "asus-rog-strix-g16",
    description:
      "240 Hz 16-inch display, RTX 4070 and a vapour chamber that keeps the chassis usable under sustained load.",
    categorySlug: "gaming-laptops",
    brandSlug: "asus",
    image: "https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=800&q=80",
    gallery: [],
    colors: [{ name: "Eclipse Grey", hex: "#1b1b1f", image: null }],
    priceCents: 26970000,
    stock: 14,
    published: true,
  },
  {
    name: "MacBook Air 13in M2",
    slug: "macbook-air-13-m2",
    description:
      "The sensible first laptop. Silent, all-day battery, and light enough to forget in a bag between lectures.",
    categorySlug: "student-laptops",
    brandSlug: "apple",
    image: "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=800&q=80",
    gallery: [],
    colors: [{ name: "Space Grey", hex: "#44474f", image: null }],
    priceCents: 14190000,
    stock: 38,
    published: true,
  },
  {
    name: "MacBook Air 13in M1",
    slug: "macbook-air-13-m1",
    description:
      "Still the best value in the range. Same chassis, same all-day battery, a generation behind on price.",
    categorySlug: "student-laptops",
    brandSlug: "apple",
    image: "https://images.unsplash.com/photo-1484788984921-03950022c9ef?w=800&q=80",
    gallery: [],
    colors: [{ name: "Space Grey", hex: "#44474f", image: null }],
    priceCents: 11350000,
    stock: 22,
    published: true,
  },
];

/**
 * Home page promo banners — one per top-level part of the catalogue, so the
 * grid covers the whole shop rather than only laptops.
 *
 * Lighting is deliberately absent: its only product is unpublished, so a tile
 * for it would land on an empty results page.
 *
 * Upserted by heading, so re-running the seed refreshes the copy without
 * duplicating rows or disturbing an order set by drag-and-drop.
 */
const SAMPLE_BANNERS: Array<{
  heading: string;
  subtext: string;
  ctaLabel: string;
  ctaLink: string;
  imageUrl: string;
  sortOrder: number;
  /** Which category headline this banner appears under. */
  categorySlug: string;
}> = [
  {
    heading: "Executive Power Uncompromised.",
    subtext: "Apple silicon and premium ultrabooks, built for the long haul.",
    ctaLabel: "Shop premium laptops",
    ctaLink: "/products?category=ultrabooks",
    imageUrl: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=900&q=80",
    sortOrder: 0,
    categorySlug: "laptops",
  },
  {
    heading: "Compile. Render. Dominate.",
    subtext: "Workstation-class machines that never flinch.",
    ctaLabel: "Shop Workstations",
    ctaLink: "/products?category=workstations",
    imageUrl: "https://images.unsplash.com/photo-1593642702821-c8da6771f0c6?w=900&q=80",
    sortOrder: 1,
    categorySlug: "laptops",
  },
  {
    heading: "Campus Ready Laptops.",
    subtext: "Starting at $599.",
    ctaLabel: "Shop student picks",
    ctaLink: "/products?category=student-laptops",
    imageUrl: "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=900&q=80",
    sortOrder: 2,
    categorySlug: "laptops",
  },

  // The rest of the catalogue, in the same voice as the laptop tiles above.
  {
    heading: "Silence, On Demand.",
    subtext: "Adaptive noise cancelling and forty hours between charges.",
    ctaLabel: "Shop audio",
    ctaLink: "/products?category=audio",
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900&q=80",
    sortOrder: 3,
    categorySlug: "audio",
  },
  {
    heading: "Type Like You Mean It.",
    subtext: "Hot-swappable switches in a machined aluminium case.",
    ctaLabel: "Shop peripherals",
    ctaLink: "/products?category=peripherals",
    imageUrl: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=900&q=80",
    sortOrder: 4,
    categorySlug: "peripherals",
  },
  {
    heading: "Protect Your Kit.",
    subtext: "Sleeves and cases that outlast the thing they carry.",
    ctaLabel: "Shop accessories",
    ctaLink: "/products?category=accessories",
    imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900&q=80",
    sortOrder: 5,
    categorySlug: "accessories",
  },
  {
    heading: "Work Late, Comfortably.",
    subtext: "Warm, dimmable light that keeps the room out of your screen.",
    ctaLabel: "Shop lighting",
    ctaLink: "/products?category=lighting",
    imageUrl: "https://images.unsplash.com/photo-1595044426077-d36d9236d54a?w=900&q=80",
    sortOrder: 6,
    categorySlug: "lighting",
  },
];

/**
 * Starter FAQ.
 *
 * Every answer here is checked against what the code actually does rather than
 * written as plausible shop copy — a published answer that contradicts
 * `shippingFor` or `customerCanCancel` is worse than no answer, because a
 * customer will act on it. Where a claim is a policy the code does not enforce
 * (the returns window), it is phrased as the promise the footer already makes
 * and nothing more.
 */
const SAMPLE_FAQS: Array<{ question: string; answer: string; sortOrder: number }> = [
  {
    question: "How much is delivery?",
    // The figures come from the active currency's own rates —
    // FREE_SHIPPING_OVER_CENTS = 710000 and FLAT_SHIPPING_CENTS = 70000 under
    // NPR — and the threshold is `>=`, so "Rs 7,100 or more", not "over
    // Rs 7,100". This answer is prose in the database, so it does not follow
    // a currency switch on its own: changing currency means editing it, here
    // and in the FAQ screen.
    answer:
      "Delivery is free on orders of Rs 7,100 or more. Below that it is a flat Rs 700, added at checkout.\n\nThe total is worked out on what you actually pay for goods, so a discount code that brings your basket under Rs 7,100 will add delivery — and one that keeps you above it will not.",
    sortOrder: 0,
  },
  {
    question: "Do I need an account to buy something?",
    answer:
      "You can browse and fill a basket without one. An account is only needed at checkout, because an order needs an owner and a receipt you can come back to.\n\nAnything already in your basket comes with you when you sign in — nothing is lost.",
    sortOrder: 1,
  },
  {
    question: "Can I cancel an order?",
    // customerCanCancel() allows PENDING only.
    answer:
      "Yes, while the order is still pending — open it from Orders and cancel there. Anything reserved goes straight back into stock.\n\nOnce an order has been paid or shipped that button is gone, because the parcel is already moving. Get in touch at that point and we will sort it out.",
    sortOrder: 2,
  },
  {
    question: "How do I use a discount code?",
    answer:
      "Enter it in your basket and the saving appears immediately.\n\nCodes are checked again when you pay, so one that expires or is fully claimed between filling your basket and paying will simply stop applying — you will be charged the normal price rather than have the order refused.",
    sortOrder: 3,
  },
  {
    question: "What does the crossed-out price mean?",
    answer:
      "It is what the product cost before it was reduced. The larger figure is what you pay now.\n\nEverything currently reduced is on the sale page, and you can filter the catalogue to reduced items with the On sale toggle.",
    sortOrder: 4,
  },
  {
    question: "Can I return something?",
    // The footer promises 30 days; no returns flow exists in the app, so this
    // stops at the promise rather than inventing a process.
    answer:
      "Yes — you have 30 days to change your mind.\n\nGet in touch with your order number, which is on your receipt and in your confirmation email, and we will take it from there.",
    sortOrder: 5,
  },
  {
    question: "I have forgotten my password.",
    answer:
      "Use the “Forgot password?” link on the sign-in page. We will email you a link to choose a new one.\n\nThe link works once and expires after an hour. If it has gone stale, just ask for another.",
    sortOrder: 6,
  },
  {
    question: "Will I get an email when my order ships?",
    answer:
      "Yes. We email you when the order is placed, when payment is confirmed and again when it ships — and if an order is cancelled, you get that in writing too.\n\nThe same updates appear in the bell menu when you are signed in.",
    sortOrder: 7,
  },
  {
    question: "Can I compare products?",
    answer:
      "Yes. Use the Compare control on any product card and a tray appears at the bottom of the screen; open it to see the specifications side by side.\n\nComparisons are limited to one category at a time, because a laptop and a pair of headphones have almost no specifications in common.",
    sortOrder: 8,
  },
  {
    question: "Who can leave a review?",
    answer:
      "Anyone who has ordered from us. Reviews from someone who bought that particular product are marked as verified.\n\nYou can edit or remove your own review at any time from the product page.",
    sortOrder: 9,
  },
];

async function main() {
  /**
   * Declare what the prices below are denominated in, before writing any.
   *
   * Every `priceCents` in this file is NPR minor units — paisa — because that
   * is what the shop sells in. The column exists so `scripts/convert-currency`
   * knows what it is starting from; seeding without setting it would leave a
   * fresh database holding rupees while claiming dollars, and the first
   * conversion run would then multiply an already-converted catalogue.
   */
  await prisma.storeSettings.upsert({
    where: { id: "singleton" },
    update: { currency: "NPR" },
    create: { id: "singleton", currency: "NPR" },
  });

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    // Always re-assert the role, so an account demoted by accident can be
    // restored by re-running the seed.
    update: { role: Role.ADMIN },
    create: {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      role: Role.ADMIN,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
    },
  });

  // Parents are declared before their children, so a single pass can resolve
  // every parentId from the map as it fills.
  const categories = new Map<string, string>();
  for (const { parentSlug, ...category } of CATEGORIES) {
    const parentId = parentSlug ? (categories.get(parentSlug) ?? null) : null;
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      // Re-assert the parent and the copy so re-running the seed repairs both.
      update: { ...category, parentId },
      create: { ...category, parentId },
    });
    categories.set(category.slug, row.id);
  }

  const brands = new Map<string, string>();
  for (const brand of BRANDS) {
    const row = await prisma.brand.upsert({
      where: { slug: brand.slug },
      update: {},
      create: brand,
    });
    brands.set(brand.slug, row.id);
  }

  for (const { categorySlug, brandSlug, colors, ...product } of SAMPLE_PRODUCTS) {
    const relations = {
      categoryId: categories.get(categorySlug) ?? null,
      brandId: brandSlug ? (brands.get(brandSlug) ?? null) : null,
    };

    // Colourways are replaced wholesale on re-seed, matching how the admin
    // form saves them. Cart and order lines keep their own snapshots.
    // `gallery` is stated explicitly rather than left off. It is a `String[]`,
    // which Postgres stores NOT NULL with no default, and omitting it from a
    // nested create fails the constraint — the sample colourways carry no extra
    // shots of their own, so the empty list is the honest value.
    const colorRows = colors.map((color, index) => ({
      ...color,
      gallery: [],
      sortOrder: index,
    }));

    await prisma.product.upsert({
      where: { slug: product.slug },
      // Re-assert content so re-running the seed refreshes sample data.
      update: {
        ...product,
        ...relations,
        colors: { deleteMany: {}, create: colorRows },
      },
      create: {
        ...product,
        ...relations,
        createdById: admin.id,
        colors: { create: colorRows },
      },
    });
  }

  for (const banner of SAMPLE_BANNERS) {
    const { heading, sortOrder, categorySlug, ...rest } = banner;
    const data = { ...rest, categoryId: categories.get(categorySlug) ?? null };

    const existing = await prisma.promoBanner.findFirst({
      where: { heading },
      select: { id: true },
    });

    if (existing) {
      // Leave sortOrder alone — it belongs to the admin's drag-and-drop.
      await prisma.promoBanner.update({ where: { id: existing.id }, data });
    } else {
      await prisma.promoBanner.create({
        data: { heading, sortOrder, ...data, isActive: true },
      });
    }
  }

  for (const faq of SAMPLE_FAQS) {
    const { question, sortOrder, ...rest } = faq;

    // Matched on the question, so re-seeding refreshes an answer rather than
    // stacking a duplicate beside it.
    const existing = await prisma.faq.findFirst({
      where: { question },
      select: { id: true },
    });

    if (existing) {
      // `sortOrder` and `published` are left alone — both belong to whoever
      // has been arranging the list in the admin screen since.
      await prisma.faq.update({ where: { id: existing.id }, data: rest });
    } else {
      await prisma.faq.create({ data: { question, sortOrder, ...rest } });
    }
  }

  console.log(`Seeded admin: ${admin.email}`);
  console.log(`Seeded ${CATEGORIES.length} categories (${BRANDS.length} brands).`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`Default password: ${ADMIN_PASSWORD} — change this before deploying.`);
  }
  console.log(`Seeded ${SAMPLE_PRODUCTS.length} products.`);
  console.log(`Seeded ${SAMPLE_BANNERS.length} promo banners.`);
  console.log(`Seeded ${SAMPLE_FAQS.length} FAQ entries.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
