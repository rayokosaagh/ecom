import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { FlashSaleForm } from "@/components/flash/FlashSaleForm";
import {
  FlashSaleProducts,
  type FlashProductOption,
  type FlashProductRow,
} from "@/components/flash/FlashSaleProducts";
import { requireAdmin } from "@/lib/auth/dal";
import { updateFlashSale } from "@/lib/actions/flash";
import {
  flashSaleStatus,
  getFlashSaleForEdit,
  getFlashableProducts,
  reconcileFlashSales,
} from "@/lib/flash/service";
import { flashPriceCents } from "@/lib/flash/pricing";
import { formatPrice } from "@/lib/products/format";

export const metadata: Metadata = { title: "Edit flash sale" };

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in local time. */
function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default async function EditFlashSalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;

  // Before reading, so the screen reflects a sale that opened or closed since
  // the last request rather than the state it was left in.
  await reconcileFlashSales();

  const [sale, flashable] = await Promise.all([
    getFlashSaleForEdit(id),
    getFlashableProducts(id),
  ]);

  if (!sale) notFound();

  const status = flashSaleStatus(sale);
  const live = status === "LIVE";

  const rows: FlashProductRow[] = sale.items.map((item) => {
    const product = item.product;

    // The row that decides the headline figure is the cheapest one a shopper can
    // actually buy — the same row `priceRange` and `saleFor` read, so this screen
    // quotes the number the card will show rather than a different one.
    const cheapest =
      product.variants.length > 0
        ? product.variants.reduce((best, variant) =>
            variant.priceCents < best.priceCents ? variant : best,
          )
        : product;

    // `priceSnapshot` is set only while this sale is the reason for the current
    // price, which is exactly the question "is the discount live on this row?".
    const applied = item.priceSnapshot !== null;
    const becomes = flashPriceCents(cheapest.priceCents, sale.percentOff);

    return {
      id: item.id,
      name: product.name,
      image: product.image,
      brand: product.brand?.name ?? null,
      published: product.published,
      priceLabel: formatPrice(cheapest.priceCents),
      becomesLabel: applied ? null : formatPrice(becomes),
      applied,
      // Only meaningful before it runs; once applied the price already moved.
      noEffect: !applied && becomes >= cheapest.priceCents,
    };
  });

  const options: FlashProductOption[] = flashable.map((product) => ({
    id: product.id,
    name: product.name,
    brand: product.brand?.name ?? null,
    published: product.published,
    priceLabel: formatPrice(product.priceCents),
  }));

  const action = updateFlashSale.bind(null, sale.id);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link
          href="/admin/flash-sales"
          className="text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="arrow_back" size={18} />
          Flash sales
        </Link>
        <h2 className="text-on-surface mt-2 text-2xl font-normal">
          {sale.name}
        </h2>
      </div>

      <FlashSaleForm
        action={action}
        live={live}
        submitLabel="Save sale"
        values={{
          name: sale.name,
          percentOff: String(sale.percentOff),
          startsAt: toLocalInput(sale.startsAt),
          endsAt: toLocalInput(sale.endsAt),
          active: sale.active,
        }}
      />

      <section className="space-y-4">
        <div>
          <h3 className="text-on-surface text-lg font-normal">Products</h3>
          <p className="text-on-surface-variant mt-1 text-sm">
            {live
              ? "This sale is running, so these prices are what the shop is charging now."
              : "What each will cost once the sale opens."}
          </p>
        </div>

        <FlashSaleProducts
          saleId={sale.id}
          rows={rows}
          options={options}
          live={live}
        />
      </section>
    </div>
  );
}
