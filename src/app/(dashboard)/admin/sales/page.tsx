import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ListToolbar } from "@/components/admin/ListToolbar";
import { AdjustPrice } from "@/components/inventory/AdjustPrice";
import { EndSaleButton } from "@/components/sales/EndSaleButton";
import { ClearIgnoredButton } from "@/components/sales/ClearIgnoredButton";
import { requireAdmin } from "@/lib/auth/dal";
import { formatPrice } from "@/lib/products/format";
import { findSaleCandidates, getSalesForAdmin, type SaleLine } from "@/lib/sales/service";
import { endExpiredSales } from "@/lib/sales/schedule";
import { historyHref } from "@/lib/inventory/links";

export const metadata: Metadata = { title: "Sales" };

/**
 * Where sales are started, changed and ended.
 *
 * A sale in this shop is one thing: a line's price sitting below a higher
 * regular price, which customers see crossed out. So this screen is built
 * around lines — a product, or one configuration of it — and the three things
 * anyone comes here to do: find something and mark it down, adjust a sale that
 * is running, and end one. Each happens in place, through the same price panel
 * the inventory page uses, so the rules, the preview and the ledger are the
 * same whichever screen the admin was on.
 *
 * Two kinds of mistake are surfaced rather than hidden: a regular price that
 * is not above the price (no discount showing), and a regular price on a
 * product that is priced by configuration (read by nothing). Each is fixable
 * here.
 */
export default async function AdminSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  // Sales past their end date close here, before the list is read — this is
  // the screen that would otherwise show them as live.
  await endExpiredSales();

  const { q = "" } = await searchParams;
  const [sales, candidates] = await Promise.all([
    getSalesForAdmin(),
    findSaleCandidates(q),
  ]);
  const nothingYet = sales.onSale.length === 0 && sales.broken.length === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-on-surface text-2xl font-normal">Sales</h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            A sale is a price below a higher regular price, shown crossed out. Start, change
            or end one here — every change is recorded in{" "}
            <Link
              href="/admin/inventory/history?kind=price"
              className="text-primary hover:underline"
            >
              price history
            </Link>
            .
          </p>
          <p className="text-on-surface-variant mt-2 text-sm">
            <strong className="text-on-surface font-medium">Which page?</strong> Marking a
            line down for as long as you like, with or without an end date — here. A timed
            event across several products that applies and restores itself —{" "}
            <Link href="/admin/flash-sales" className="text-primary hover:underline">
              Flash sales
            </Link>
            .
          </p>
        </div>
        <Link
          href="/admin/flash-sales"
          className="border-outline text-on-surface hover:bg-on-surface/[0.06] inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-5 text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="bolt" size={18} />
          Flash sales
        </Link>
      </div>

      <Card variant="outlined">
        <CardContent className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-4">
          <Figure label="Lines on sale" value={String(sales.onSale.length)} />
          <Figure
            label="Live on the storefront"
            value={String(sales.live)}
            hint={
              sales.onSale.length - sales.live > 0
                ? `${sales.onSale.length - sales.live} on draft products`
                : undefined
            }
          />
          <Figure
            label="Deepest discount"
            value={sales.bestPercentOff >= 1 ? `${sales.bestPercentOff}% off` : "—"}
          />
          <Figure label="Total reduction" value={formatPrice(sales.totalSavingCents)} />
        </CardContent>
      </Card>

      {/* Put something on sale ------------------------------------------- */}
      <section className="space-y-3">
        <div>
          <h3 className="text-on-surface text-base font-medium">Put something on sale</h3>
          <p className="text-on-surface-variant text-sm">
            Find the product. A product sold in several configurations is marked
            down one configuration at a time.
          </p>
        </div>

        <ListToolbar searchLabel="Search by product, slug or SKU" />

        {q.trim() === "" ? null : candidates.length === 0 ? (
          <Card variant="outlined">
            <CardContent className="text-on-surface-variant py-6 text-center text-sm">
              Nothing matches “{q}”.
            </CardContent>
          </Card>
        ) : (
          <Card variant="outlined" className="overflow-hidden">
            <ul className="divide-outline-variant divide-y">
              {candidates.map((line) => (
                <li key={line.key} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <LineIdentity line={line} />
                  <PriceNow line={line} />
                  <div className="flex flex-wrap items-start justify-end gap-2">
                    {line.sale ? (
                      <span className="text-on-surface-variant self-center text-xs">
                        Already on sale — see below
                      </span>
                    ) : (
                      <AdjustPrice
                        productId={line.productId}
                        variantId={line.variantId}
                        name={line.name}
                        configuration={line.configuration}
                        priceCents={line.priceCents}
                        compareAtPriceCents={line.compareAtPriceCents}
                        saleEndsAt={line.saleEndsAt}
                        flashSaleName={line.flashSaleName}
                        buttonLabel="Put on sale"
                        buttonIcon="local_offer"
                        openOnSale
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* Needs fixing ----------------------------------------------------- */}
      {(sales.broken.length > 0 || sales.ignored.length > 0) && (
        <section className="space-y-3">
          <div>
            <h3 className="text-on-surface text-base font-medium">Needs fixing</h3>
            <p className="text-on-surface-variant text-sm">
              Set as a sale, but no discount is showing to customers.
            </p>
          </div>
          <Card variant="outlined" className="border-error/40 overflow-hidden">
            <ul className="divide-outline-variant divide-y">
              {sales.broken.map((line) => (
                <li key={line.key} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <LineIdentity line={line} />
                  <div className="min-w-0 flex-1 basis-[16rem]">
                    <PriceNow line={line} />
                    <p className="text-error mt-1 text-xs">
                      The regular price ({formatPrice(line.compareAtPriceCents!)}) is not
                      above the price, so nothing is crossed out. Lower the price, raise the
                      regular price, or end the sale.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-start justify-end gap-2">
                    <AdjustPrice
                      productId={line.productId}
                      variantId={line.variantId}
                      name={line.name}
                      configuration={line.configuration}
                      priceCents={line.priceCents}
                      compareAtPriceCents={line.compareAtPriceCents}
                      flashSaleName={line.flashSaleName}
                      buttonLabel="Fix"
                      buttonIcon="build"
                    />
                    <EndSaleButton
                      productId={line.productId}
                      variantId={line.variantId}
                      name={line.name}
                      configuration={line.configuration}
                      priceCents={line.priceCents}
                      compareAtPriceCents={line.compareAtPriceCents}
                    />
                  </div>
                </li>
              ))}
              {sales.ignored.map((product) => (
                <li key={product.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-[16rem]">
                    <p className="text-on-surface text-sm">
                      <Link
                        href={`/dashboard/products/${product.id}/edit`}
                        className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {product.name}
                      </Link>
                    </p>
                    <p className="text-error mt-1 text-xs">
                      A regular price ({formatPrice(product.compareAtPriceCents!)}) is set on
                      the product itself, but this product is priced by configuration, so
                      customers never see it. Put a configuration on sale above, and clear
                      this.
                    </p>
                  </div>
                  <ClearIgnoredButton productId={product.id} />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {/* On sale now ------------------------------------------------------ */}
      <section className="space-y-3">
        <div>
          <h3 className="text-on-surface text-base font-medium">On sale now</h3>
          <p className="text-on-surface-variant text-sm">
            {nothingYet
              ? "Nothing yet. The storefront's Sale page and home-page shelf stay hidden until something is."
              : "Deepest discount first. Drafts are listed but not shown to customers until published."}
          </p>
        </div>

        {sales.onSale.length === 0 ? (
          <Card variant="outlined">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Icon name="sell" size={40} className="text-on-surface-variant" />
              <p className="text-on-surface">Nothing is on sale</p>
              <p className="text-on-surface-variant max-w-sm text-sm">
                Search for a product above and choose “Put on sale”.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card variant="outlined" className="overflow-hidden">
            <ul className="divide-outline-variant divide-y">
              {sales.onSale.map((line) => (
                <li key={line.key} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <LineIdentity line={line} />
                  <PriceNow line={line} />
                  <div className="flex flex-wrap items-start justify-end gap-2">
                    <AdjustPrice
                      productId={line.productId}
                      variantId={line.variantId}
                      name={line.name}
                      configuration={line.configuration}
                      priceCents={line.priceCents}
                      compareAtPriceCents={line.compareAtPriceCents}
                      saleEndsAt={line.saleEndsAt}
                      flashSaleName={line.flashSaleName}
                      buttonLabel="Change"
                      buttonIcon="edit"
                    />
                    <EndSaleButton
                      productId={line.productId}
                      variantId={line.variantId}
                      name={line.name}
                      configuration={line.configuration}
                      priceCents={line.priceCents}
                      compareAtPriceCents={line.compareAtPriceCents}
                    />
                  </div>
                </li>
              ))}
            </ul>
            {sales.truncated && (
              <p className="text-on-surface-variant border-outline-variant border-t px-4 py-2 text-xs">
                Showing the first {sales.onSale.length} — the catalogue has more lines than
                this page reads at once.
              </p>
            )}
          </Card>
        )}
      </section>
    </div>
  );
}

/** "25 Aug, 18:00" — how a sale's end reads in a list. */
function formatWhen(date: Date): string {
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** One figure in the summary strip. */
function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-on-surface-variant text-xs">{label}</p>
      <p className="text-on-surface mt-0.5 text-xl font-medium tabular-nums">{value}</p>
      {hint && <p className="text-on-surface-variant text-xs">{hint}</p>}
    </div>
  );
}

/** Image, name, configuration and the draft / flash-sale badges — the "which line". */
function LineIdentity({ line }: { line: SaleLine }) {
  return (
    <div className="flex min-w-0 flex-1 basis-[18rem] items-start gap-3">
      <div className="bg-surface-container-highest size-10 shrink-0 overflow-hidden rounded-md">
        {line.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={line.image} alt="" className="size-full object-cover" />
        ) : (
          <div className="text-on-surface-variant grid size-full place-items-center">
            <Icon name="image" size={18} />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-on-surface flex flex-wrap items-center gap-2 text-sm">
          <Link
            href={`/dashboard/products/${line.productId}/edit`}
            className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {line.name}
          </Link>
          {!line.published && (
            <span className="bg-surface-container-highest text-on-surface-variant rounded-full px-2 py-0.5 text-label-sm">
              Draft
            </span>
          )}
          {line.flashSaleName && (
            <span className="text-tertiary inline-flex items-center gap-1 text-xs">
              <Icon name="bolt" size={13} />
              {line.flashSaleName}
            </span>
          )}
        </p>
        <p className="text-on-surface-variant mt-0.5 text-xs">
          {line.configuration ?? "No configurations"}
          {line.sku && <> · SKU {line.sku}</>}
          {" · "}
          <Link
            href={historyHref({ productId: line.productId, variantId: line.variantId, kind: "price" })}
            className="text-primary rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            price history
          </Link>
        </p>
      </div>
    </div>
  );
}

/** Price, regular price and the discount, as customers would read them. */
function PriceNow({ line }: { line: SaleLine }) {
  return (
    <p className="flex min-w-[10rem] flex-col text-sm">
      <span className="text-on-surface tabular-nums">
        {formatPrice(line.priceCents)}
        {line.sale && (
          <span className="text-tertiary ml-2 text-xs">
            {line.sale.percentOff >= 1 ? `${line.sale.percentOff}% off` : "on sale"}
          </span>
        )}
      </span>
      {line.compareAtPriceCents !== null && (
        <span className="text-on-surface-variant text-xs">
          <span className="sr-only">regular price </span>
          <span className="line-through tabular-nums">{formatPrice(line.compareAtPriceCents)}</span>
          {line.sale && <> · save {formatPrice(line.sale.savingCents)}</>}
        </span>
      )}
      {line.saleEndsAt && line.compareAtPriceCents !== null && (
        <span className="text-on-surface-variant inline-flex items-center gap-1 text-xs">
          <Icon name="schedule" size={13} />
          ends {formatWhen(line.saleEndsAt)}
        </span>
      )}
      {line.compareAtPriceCents === null && (
        <span className="text-on-surface-variant text-xs">not on sale</span>
      )}
    </p>
  );
}
