import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { SaleRowActions } from "@/components/products/SaleRowActions";
import { requireAdmin } from "@/lib/auth/dal";
import { formatPrice } from "@/lib/products/format";
import { getSalesForAdmin } from "@/lib/sales/service";

export const metadata: Metadata = { title: "Sales" };

export default async function AdminSalesPage() {
  // The layout checks the session, but layouts do not re-render on every
  // navigation — so the page enforces the admin gate itself.
  await requireAdmin();

  const rows = await getSalesForAdmin();
  const live = rows.filter((row) => row.sale && row.published).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-on-surface text-2xl font-normal">Sales</h2>
        <p className="text-on-surface-variant mt-1 text-sm">
          {rows.length === 0
            ? "Products with a “was” price higher than their price."
            : `${live} showing on the home page right now.`}
        </p>
      </div>

      <Card variant="outlined">
        <CardContent className="text-on-surface-variant flex items-start gap-3 py-4 text-sm">
          <Icon name="info" size={20} className="mt-px shrink-0" />
          <div className="space-y-2">
            <p>
              A sale is set on the product itself: lower its{" "}
              <strong>Price</strong> to the new figure and put the old, higher
              one in <strong>Was</strong>. Price stays the amount customers are
              charged, so nothing about the cart, checkout or past orders
              changes — the shelf and the till cannot disagree.
            </p>
            <p>
              A product sold in several configurations is priced by those
              configurations, so its sale goes in the <strong>Was</strong> box
              on a <strong>variant row</strong>. A “was” price on the product
              itself is ignored there.
            </p>
          </div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card variant="outlined">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon name="sell" size={40} className="text-on-surface-variant" />
            <p className="text-on-surface">Nothing is on sale</p>
            <p className="text-on-surface-variant max-w-sm text-sm">
              Edit a product, lower its price and record what it used to cost.
              The sale section is hidden entirely while this list is empty, so
              the home page never shows an empty shelf.
            </p>
            <Link
              href="/dashboard/products"
              className="text-primary mt-1 rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Go to products
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Card variant="outlined">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    {row.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={row.image}
                        alt=""
                        className="bg-surface-container-highest size-12 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="bg-surface-container-highest text-on-surface-variant grid size-12 shrink-0 place-items-center rounded-md">
                        <Icon name="image" size={20} />
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="text-on-surface flex items-center gap-2 truncate text-sm font-medium">
                        {row.name}
                        {!row.published && (
                          <span className="bg-surface-container-highest text-on-surface-variant rounded-full px-2 py-0.5 text-label-sm">
                            Draft
                          </span>
                        )}
                        {/* Where the sale actually lives matters when it comes
                            to editing it — a configurable product is reduced
                            one row at a time. */}
                        {row.variantSale && (
                          <span className="bg-surface-container-highest text-on-surface-variant rounded-full px-2 py-0.5 text-label-sm">
                            Per configuration
                          </span>
                        )}
                      </p>

                      {row.sale ? (
                        <p className="text-on-surface-variant mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm">
                          <span className="text-tertiary font-medium">
                            {formatPrice(row.sale.priceCents)}
                          </span>
                          <span className="line-through">
                            {formatPrice(row.sale.compareAtCents)}
                          </span>
                          <span className="text-xs">
                            save {formatPrice(row.sale.savingCents)}
                            {row.sale.percentOff >= 1 && ` · ${row.sale.percentOff}% off`}
                          </span>
                        </p>
                      ) : (
                        // No discount showing. Which of the two reasons it is
                        // matters: telling someone their "was" price is not
                        // above the price when they can see that it is sends
                        // them to check the wrong thing.
                        <p className="text-error mt-0.5 max-w-prose text-sm">
                          {row.problem === "SET_ON_PRODUCT_NOT_VARIANT"
                            ? "This product is priced by configuration, so the “was” price has to go on a variant row — the one set on the product itself is ignored. Edit it and fill the “Was” box on the configuration you want reduced."
                            : "“Was” is not above Price, so no discount is showing. Price is the new, reduced figure; “Was” is what it cost before."}
                        </p>
                      )}
                    </div>
                  </div>

                  <SaleRowActions productId={row.id} productName={row.name} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
