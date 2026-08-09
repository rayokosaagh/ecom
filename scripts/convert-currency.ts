import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DiscountKind } from "../src/generated/prisma/enums";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  convertMinor,
  formatMoney,
  isCurrencyCode,
  type CurrencyCode,
} from "../src/lib/money/currency";

/**
 * Re-denominate every price in the database.
 *
 * Prices are stored in the shop's own currency (see `lib/money/currency`), so
 * changing currency is a migration, not a setting. This is that migration.
 *
 *   npm run currency -- --from USD --to NPR --rate 142 --dry-run
 *   npm run currency -- --from USD --to NPR --rate 142
 *
 * `--rate` is how many units of the target currency one unit of the source
 * buys, and it is required: there is no sane default for an exchange rate, and
 * one baked in here would silently go stale.
 *
 * ## What it will not do
 *
 * Run twice. `StoreSettings.currency` records what the stored numbers already
 * mean; this asserts that it matches `--from` and advances it in the same
 * transaction as the prices. A second run finds NPR where it expected USD and
 * stops, which is the difference between a safe migration and one that turns
 * Rs 10,700 into Rs 1,519,400 without a word.
 */

function usage(message: string): never {
  console.error(
    `${message}\n\n` +
      "Usage: npm run currency -- --from <CODE> --to <CODE> --rate <number> [--dry-run]\n" +
      `Currencies: ${Object.keys(CURRENCIES).join(", ")}`,
  );
  process.exit(1);
}

function flag(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(`--${name}`);
  if (index >= 0 && argv[index + 1]) return argv[index + 1];
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  return inline?.split("=").slice(1).join("=");
}

const dryRun = process.argv.slice(2).includes("--dry-run");
const fromArg = flag("from")?.toUpperCase();
const toArg = flag("to")?.toUpperCase();
const rateArg = Number(flag("rate"));

if (!isCurrencyCode(fromArg)) usage(`Unknown --from currency ${fromArg ?? "(missing)"}.`);
if (!isCurrencyCode(toArg)) usage(`Unknown --to currency ${toArg ?? "(missing)"}.`);
if (fromArg === toArg) usage("--from and --to are the same currency.");
if (!Number.isFinite(rateArg) || rateArg <= 0) usage("--rate must be a positive number.");

const from: CurrencyCode = fromArg;
const to: CurrencyCode = toArg;
const rate = rateArg;
const target = CURRENCIES[to];

/** Shelf prices snap to the target's round-number step. */
const price = (minor: number) => convertMinor(minor, rate, target.priceStepMinor);
const priceOrNull = (minor: number | null) => (minor === null ? null : price(minor));
/** Derived amounts — a discount taken off, say — snap only to a whole unit. */
const exact = (minor: number) => convertMinor(minor, rate, 1);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) usage("DATABASE_URL is not set.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const show = (minor: number, code: CurrencyCode) =>
  formatMoney(minor, CURRENCIES[code]);

async function main() {
  const settings = await prisma.storeSettings.findUnique({
    where: { id: "singleton" },
    select: { currency: true },
  });

  // A shop that has never opened the settings screen has no row yet. Absent is
  // treated as the column's default rather than as an error, because that is
  // exactly what it means.
  const stored = settings?.currency ?? "USD";
  if (stored !== from) {
    usage(
      `The database is already denominated in ${stored}, not ${from}.\n` +
        `Refusing to convert — running this twice would multiply every price by ${rate} again.`,
    );
  }

  const [products, variants, discounts, orders, items, flashItems] = await Promise.all([
    prisma.product.findMany({
      select: { id: true, name: true, priceCents: true, compareAtPriceCents: true },
      orderBy: { name: "asc" },
    }),
    prisma.productVariant.findMany({
      select: { id: true, priceCents: true, compareAtPriceCents: true },
    }),
    prisma.discountCode.findMany({
      select: {
        id: true,
        code: true,
        kind: true,
        value: true,
        minSubtotalCents: true,
        maxDiscountCents: true,
      },
    }),
    prisma.order.findMany({
      select: {
        id: true,
        totalCents: true,
        shippingCents: true,
        discountCents: true,
        items: { select: { id: true, priceCents: true, quantity: true } },
      },
    }),
    prisma.orderItem.count(),
    prisma.flashSaleItem.findMany({ select: { id: true, priceSnapshot: true } }),
  ]);

  console.log(
    `\nConverting ${from} → ${to} at ${rate}, rounding prices to the nearest ` +
      `${show(target.priceStepMinor, to)}.\n`,
  );

  console.log(`Products (${products.length}) — first ${Math.min(8, products.length)}:`);
  for (const product of products.slice(0, 8)) {
    console.log(
      `  ${product.name.padEnd(28).slice(0, 28)} ` +
        `${show(product.priceCents, from).padStart(12)} → ${show(price(product.priceCents), to)}`,
    );
  }

  /**
   * Orders are rebuilt rather than converted field by field.
   *
   * A receipt has to add up: goods + delivery − discount = total. Convert those
   * four numbers independently and rounding pulls them apart, so the total on a
   * past order stops matching the lines above it. Instead the parts are
   * converted and the total is recomputed from them, which is the only way the
   * arithmetic survives.
   */
  const orderPlans = orders.map((order) => {
    const nextItems = order.items.map((item) => ({
      id: item.id,
      priceCents: price(item.priceCents),
      quantity: item.quantity,
    }));
    const goods = nextItems.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);
    const shipping = price(order.shippingCents);
    const discount = exact(order.discountCents);
    const wasGoods = order.items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
    return {
      id: order.id,
      items: nextItems,
      shippingCents: shipping,
      discountCents: discount,
      totalCents: Math.max(0, goods + shipping - discount),
      /** Did the original order's own arithmetic balance? */
      balancedBefore:
        wasGoods + order.shippingCents - order.discountCents === order.totalCents,
      wasTotal: order.totalCents,
    };
  });

  const unbalanced = orderPlans.filter((plan) => !plan.balancedBefore);
  if (unbalanced.length > 0) {
    // Reported rather than silently "fixed": a receipt that did not add up
    // before this ran is a pre-existing fact, and quietly making it add up
    // afterwards would hide it.
    console.warn(
      `\n⚠ ${unbalanced.length} order(s) did not balance before conversion ` +
        `(goods + delivery − discount ≠ total). They are rebuilt from their ` +
        `lines, which changes the recorded total:`,
    );
    for (const plan of unbalanced.slice(0, 5)) {
      console.warn(`    ${plan.id}: recorded ${show(plan.wasTotal, from)}`);
    }
  }

  console.log(
    `\nAlso converting: ${variants.length} variant(s), ${discounts.length} discount code(s), ` +
      `${orders.length} order(s) with ${items} line(s), ${flashItems.length} flash-sale snapshot(s).`,
  );

  if (dryRun) {
    console.log("\nDry run — nothing written. Re-run without --dry-run to apply.\n");
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      for (const product of products) {
        await tx.product.update({
          where: { id: product.id },
          data: {
            priceCents: price(product.priceCents),
            compareAtPriceCents: priceOrNull(product.compareAtPriceCents),
          },
        });
      }

      for (const variant of variants) {
        await tx.productVariant.update({
          where: { id: variant.id },
          data: {
            priceCents: price(variant.priceCents),
            compareAtPriceCents: priceOrNull(variant.compareAtPriceCents),
          },
        });
      }

      for (const discount of discounts) {
        await tx.discountCode.update({
          where: { id: discount.id },
          data: {
            // A percentage is a ratio, not an amount — 20% off is 20% off in
            // any currency, and multiplying it by the rate would be nonsense.
            value: discount.kind === DiscountKind.FIXED ? price(discount.value) : discount.value,
            minSubtotalCents: price(discount.minSubtotalCents),
            maxDiscountCents: priceOrNull(discount.maxDiscountCents),
          },
        });
      }

      for (const plan of orderPlans) {
        for (const item of plan.items) {
          await tx.orderItem.update({
            where: { id: item.id },
            data: { priceCents: item.priceCents },
          });
        }
        await tx.order.update({
          where: { id: plan.id },
          data: {
            shippingCents: plan.shippingCents,
            discountCents: plan.discountCents,
            totalCents: plan.totalCents,
          },
        });
      }

      /**
       * Flash-sale snapshots hold the prices a running sale overwrote, and a
       * sale closing writes them back. Left in the old currency they would
       * restore dollars into a rupee catalogue the moment the sale ended.
       *
       * `toCents` has to convert by the same rule as the product's own price,
       * because closing a sale checks the row still holds it before restoring —
       * round them differently and every restore silently declines.
       */
      for (const item of flashItems) {
        const snapshot = item.priceSnapshot as {
          product?: { id: string; fromCents: number; toCents: number; fromCompareAtCents: number | null } | null;
          variants?: { id: string; fromCents: number; toCents: number; fromCompareAtCents: number | null }[];
        } | null;
        if (!snapshot) continue;

        const convertRow = <T extends { fromCents: number; toCents: number; fromCompareAtCents: number | null }>(
          row: T,
        ): T => ({
          ...row,
          fromCents: price(row.fromCents),
          toCents: price(row.toCents),
          fromCompareAtCents: priceOrNull(row.fromCompareAtCents),
        });

        await tx.flashSaleItem.update({
          where: { id: item.id },
          data: {
            priceSnapshot: {
              product: snapshot.product ? convertRow(snapshot.product) : null,
              variants: (snapshot.variants ?? []).map(convertRow),
            },
          },
        });
      }

      // Last, and inside the same transaction: if anything above fails, the
      // ledger still says the data is in the old currency, which is true.
      await tx.storeSettings.upsert({
        where: { id: "singleton" },
        update: { currency: to },
        create: { id: "singleton", currency: to },
      });
    },
    { timeout: 30_000 },
  );

  console.log(`\n✔ Converted. The database is now denominated in ${to}.`);

  // What the app will actually render with, which is the env var *or* the
  // default it falls back to — not the raw variable. Comparing against the raw
  // value would nag about an unset variable whose default is already correct.
  const configured = process.env.NEXT_PUBLIC_SHOP_CURRENCY;
  const effective = isCurrencyCode(configured) ? configured : DEFAULT_CURRENCY;

  if (effective === to) {
    console.log(
      `  Prices will render as ${to}${configured ? "" : ` (NEXT_PUBLIC_SHOP_CURRENCY is unset, and ${DEFAULT_CURRENCY} is the default)`}.`,
    );
  } else {
    console.log(
      `\n⚠ The app is configured to render ${effective}, but the data is now ${to}.\n` +
        `  Set NEXT_PUBLIC_SHOP_CURRENCY=${to} in .env and restart, or every price\n` +
        `  will be shown with the wrong symbol.`,
    );
  }

  console.log(
    `\n  Switching back is the same command with --from and --to swapped and the\n` +
      `  inverse rate: npm run currency -- --from ${to} --to ${from} --rate ${(1 / rate).toPrecision(6)}\n`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
