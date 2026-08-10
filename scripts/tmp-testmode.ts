import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Temporary: makes one order cheap enough for a drained Khalti sandbox wallet.
 *   --on   price the Anker at Rs 50 and enable free store pickup
 *   --off  restore Rs 3,000 and disable pickup
 */
const SLUG = "anker-prime-charger";
const TEST_CENTS = 5000;      // Rs 50 — well above Khalti's Rs 10 floor
const RESTORE_CENTS = 300000; // Rs 3,000 — what it is set to now

async function main() {
  const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const off = process.argv.includes("--off");
  const to = off ? RESTORE_CENTS : TEST_CENTS;

  const before = await p.product.findFirstOrThrow({
    where: { slug: SLUG }, select: { id: true, priceCents: true },
  });

  if (before.priceCents !== to) {
    await p.product.update({ where: { id: before.id }, data: { priceCents: to } });
    // Recorded the same way the Reprice control records one.
    await p.priceChange.create({
      data: {
        productId: before.id, fromCents: before.priceCents, toCents: to,
        note: off ? "restored after Khalti sandbox test" : "temporary: Khalti sandbox test",
      },
    });
  }

  await p.storeSettings.upsert({
    where: { id: "singleton" },
    update: {
      pickupEnabled: !off,
      pickupAddress: off ? null : "Ecom Store\n4 Market Square\nKathmandu",
      pickupHours: off ? null : "Sun–Fri, 10am–7pm",
    },
    create: {
      id: "singleton", pickupEnabled: !off,
      pickupAddress: off ? null : "Ecom Store\n4 Market Square\nKathmandu",
    },
  });

  console.log(`price   : Rs ${(before.priceCents / 100).toLocaleString("en-IN")} -> Rs ${(to / 100).toLocaleString("en-IN")}`);
  console.log(`pickup  : ${off ? "disabled" : "ENABLED (delivery Rs 0)"}`);
  if (!off) {
    console.log(`\ncheckout totals:`);
    console.log(`  store pickup, no code   : Rs 50`);
    console.log(`  store pickup + HELLO30  : Rs 40`);
    console.log(`  home delivery, no code  : Rs 750`);
  }
  await p.$disconnect();
}
main();
