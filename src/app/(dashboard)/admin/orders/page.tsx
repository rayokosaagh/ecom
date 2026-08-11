import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Icon } from "@/components/ui/Icon";
import { Pagination } from "@/components/products/Pagination";
import { EmptyState } from "@/components/admin/EmptyState";
import { FilterPills } from "@/components/admin/FilterPills";
import { ListToolbar } from "@/components/admin/ListToolbar";
import { OrdersControls } from "@/components/admin/orders/OrdersControls";
import { OrdersSkeleton } from "@/components/admin/orders/OrdersSkeleton";
import { OrdersView } from "@/components/admin/orders/OrdersView";
import { requireAdmin } from "@/lib/auth/dal";
import { getOrderCounts, getOrdersForAdmin } from "@/lib/orders/service";
import { toOrderRow } from "@/lib/orders/row-view";
import {
  STATUSES,
  defaultSort,
  describeDateWindow,
  parsePage,
  parsePerPage,
  parseRangeKey,
  parseSort,
  parseStatus,
  parseView,
  resolveDateWindow,
} from "@/lib/orders/list-params";
import { OrderStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Orders" };

/** Every param this page reads. Named so the two suspended halves can share it. */
interface OrderParams {
  status?: string;
  q?: string;
  sort?: string;
  view?: string;
  page?: string;
  perPage?: string;
  range?: string;
  from?: string;
  to?: string;
}

const BASE_PATH = "/admin/orders";

/** Rebuild the query string, overriding some keys and dropping any set to null. */
function queryString(params: OrderParams, overrides: Record<string, string | null> = {}) {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries({ ...params, ...overrides })) {
    if (value) next.set(key, String(value));
  }

  return next.toString();
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<OrderParams>;
}) {
  // The layout checks the session, but layouts do not re-render on every
  // navigation — so the page enforces the admin gate itself.
  await requireAdmin();

  const params = await searchParams;

  const status = parseStatus(params.status);
  const query = params.q?.trim() ?? "";
  const sort = parseSort(params.sort, status);
  const view = parseView(params.view);
  const perPage = parsePerPage(params.perPage);
  const page = parsePage(params.page);
  const rangeKey = parseRangeKey(params.range);

  // Every key that changes *which* orders come back. Suspense remounts on a
  // changed key, which is what makes the skeleton appear on a filter or page
  // change and not only on the first load.
  const resultsKey = [status, query, sort, page, perPage, view, rangeKey, params.from, params.to]
    .map((value) => value ?? "")
    .join("|");

  // The rail counts under the search and the date range but not under the
  // status, so it does not re-suspend when a tab is picked or a page turned.
  const countsKey = [query, rangeKey, params.from, params.to].map((v) => v ?? "").join("|");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-on-surface text-2xl font-normal">Orders</h2>
          <Suspense fallback={<p className="text-on-surface-variant mt-1 h-5 text-sm" />}>
            <Headline key={countsKey} params={params} />
          </Suspense>
        </div>

        {/* A plain anchor, not a `Link`: this is a file download served by a
            route handler, and the client router would try to navigate to it. */}
        <a
          href={`/api/admin/orders/export?${queryString(params, { page: null, perPage: null, view: null })}`}
          className="border-outline text-primary state-layer inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="download" size={18} />
          Export
        </a>
      </div>

      <ListToolbar
        searchLabel="Search by customer, email, city, product or order ref"
        alsoClear={["status", "sort", "range", "from", "to"]}
      />

      <OrdersControls
        view={view}
        sort={sort}
        perPage={perPage}
        isDefaultSort={sort === defaultSort(status)}
      />

      {/* Same pill language as the storefront's brand and category rails. */}
      <Suspense fallback={<div className="h-10" />}>
        <StatusRail key={countsKey} params={params} />
      </Suspense>

      <Suspense key={resultsKey} fallback={<OrdersSkeleton view={view} />}>
        <Results params={params} />
      </Suspense>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

async function Headline({ params }: { params: OrderParams }) {
  const window = resolveDateWindow(
    parseRangeKey(params.range),
    params.from,
    params.to,
    new Date(),
  );
  const counts = await getOrderCounts(params.q?.trim(), window);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <p className="text-on-surface-variant mt-1 text-sm">
      {total === 0
        ? "Orders placed through checkout arrive here."
        : `${counts[OrderStatus.PENDING] ?? 0} awaiting payment · ${
            counts[OrderStatus.PAID] ?? 0
          } to ship`}
    </p>
  );
}

async function StatusRail({ params }: { params: OrderParams }) {
  const window = resolveDateWindow(
    parseRangeKey(params.range),
    params.from,
    params.to,
    new Date(),
  );
  const counts = await getOrderCounts(params.q?.trim(), window);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <FilterPills
      label="Filter by status"
      param="status"
      basePath={BASE_PATH}
      // `page` is dropped deliberately: page 7 of Pending is not page 7 of
      // Delivered, and carrying it across lands the reader on a blank list.
      // `sort` goes too, so the Pending tab can take its own oldest-first
      // default instead of inheriting whatever the last tab was sorted by.
      params={{ ...params, page: undefined, sort: undefined }}
      options={[
        { value: "", label: "All", count: total },
        ...STATUSES.map((value) => ({
          value,
          label: value.charAt(0) + value.slice(1).toLowerCase(),
          count: counts[value] ?? 0,
        })),
      ]}
    />
  );
}

async function Results({ params }: { params: OrderParams }) {
  const status = parseStatus(params.status);
  const query = params.q?.trim() ?? "";
  const rangeKey = parseRangeKey(params.range);

  // One `now` for the whole render, so every relative date on the page is
  // measured from the same instant — rows a second apart should not disagree
  // about what "an hour ago" means.
  const now = new Date();
  const window = resolveDateWindow(rangeKey, params.from, params.to, now);

  const { orders, total, totalPages, page } = await getOrdersForAdmin({
    status,
    query,
    sort: parseSort(params.sort, status),
    window,
    page: parsePage(params.page),
    perPage: parsePerPage(params.perPage),
  });

  if (total === 0) {
    return <NoResults status={status} query={query} rangeKey={rangeKey} params={params} />;
  }

  const perPage = parsePerPage(params.perPage);
  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);
  const rangeLabel = describeDateWindow(rangeKey, window);

  return (
    <div className="space-y-3">
      <p className="text-on-surface-variant px-1 text-xs">
        Showing <span className="tabular-nums">{first}</span>–
        <span className="tabular-nums">{last}</span> of{" "}
        <span className="tabular-nums">{total}</span> order{total === 1 ? "" : "s"}
        {rangeLabel && ` · ${rangeLabel}`}
      </p>

      <OrdersView rows={orders.map((order) => toOrderRow(order, now))} view={parseView(params.view)} />

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        hrefFor={(n) => `${BASE_PATH}?${queryString(params, { page: String(n) })}`}
      />
    </div>
  );
}

/**
 * Why the list is empty, rather than merely that it is.
 *
 * Three different situations wearing the same blank space: a search that
 * matched nothing, a filter standing on a state nothing is in, and a shop that
 * has not sold anything yet. The last one is the only one that is not a
 * problem, and telling a new shop "nothing matches those filters" would send
 * them looking for a broken checkout.
 */
function NoResults({
  status,
  query,
  rangeKey,
  params,
}: {
  status: OrderStatus | undefined;
  query: string;
  rangeKey: string | undefined;
  params: OrderParams;
}) {
  const narrowed = Boolean(query || status || rangeKey);

  if (!narrowed) {
    return (
      <EmptyState
        icon="receipt_long"
        title="No orders yet"
        description="Every order placed through checkout shows up here, ready to be paid off and shipped."
      />
    );
  }

  const clearHref = `${BASE_PATH}?${queryString(params, {
    q: null,
    status: null,
    range: null,
    from: null,
    to: null,
    page: null,
  })}`;

  return (
    <EmptyState
      icon={query ? "search_off" : "filter_alt_off"}
      title={
        query
          ? `Nothing matches “${query}”`
          : status
            ? `No ${status.toLowerCase()} orders`
            : "No orders in that period"
      }
      description={
        query
          ? "Searches cover the customer's name and email, the shipping city and country, the phone number, the names of the products ordered, and the order reference."
          : status
            ? "Nothing is sitting in this state right now."
            : "Try a wider date range."
      }
      action={
        <Link
          href={clearHref}
          className="text-primary state-layer inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="filter_alt_off" size={18} />
          Clear filters
        </Link>
      }
    />
  );
}
