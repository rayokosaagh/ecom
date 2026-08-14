import type { Metadata } from "next";
import Link from "next/link";

import { FilterPills } from "@/components/admin/FilterPills";
import { OrderTicket } from "@/components/orders/OrderTicket";
import { ReorderButton } from "@/components/orders/ReorderButton";
import { ProductCard } from "@/components/products/ProductCard";
import { Pagination } from "@/components/products/Pagination";
import { Icon } from "@/components/ui/Icon";
import { AddressBook } from "@/components/users/AddressBook";
import { ProfileHero } from "@/components/users/ProfileHero";
import { PanelEmpty, ProfilePanel } from "@/components/users/ProfilePanel";
import { ProfileShell } from "@/components/users/ProfileShell";
import { RecentPurchases } from "@/components/users/RecentPurchases";
import { getAddresses } from "@/lib/addresses/service";
import { requireUser } from "@/lib/auth/dal";
import { getNavData } from "@/lib/nav/data";
import {
  HISTORY_STATUSES,
  getOrderHistory,
  parsePage,
  parseStatus,
} from "@/lib/orders/history";
import { getRecentPurchases } from "@/lib/orders/purchases";
import { prisma } from "@/lib/prisma";
import { getRatings } from "@/lib/reviews/service";
import { getWishlist } from "@/lib/wishlist/service";
import { statusLabel } from "@/components/dashboard/pipeline";
import { OrderStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Profile" };

/** How many wishlist cards the profile shows before deferring to /wishlist. */
const WISHLIST_PREVIEW = 4;

/**
 * A shopper's account page.
 *
 * Two columns above `lg`, one below. The split is by *size and traffic*, not by
 * category: order history is the tall thing people come for and takes the main
 * column, while the wishlist, addresses and settings are compact and live in a
 * rail that stays in view. Before this the page was a single 1024px column in a
 * 1440px window — four and a half screens tall, with the two smallest cards
 * stretched full width and mostly empty.
 *
 * Above both columns sits `ProfileHero` — the greeting and a strip of counts.
 * It is the page's one full-width element because it is the only thing on the
 * page that summarises the rest: someone arriving to check how many orders are
 * still pending gets the number and the link to them before scrolling at all.
 *
 * Below it, every section is a `ProfilePanel`: a card carrying its own heading.
 * That is what makes the two columns possible at all — a panel can move between
 * them without leaving a heading behind in the other one.
 *
 * Entirely Server Components. The editing surfaces are separate routes
 * (`/profile/edit`, `/profile/settings`, `/profile/addresses/*`,
 * `/profile/reviews/*`) which hold the Client Components, so reading your own
 * orders costs no form JavaScript.
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireUser();
  const params = await searchParams;
  const status = parseStatus(params.status);

  const [user, nav, addresses, history, purchases, wishlist, reviews] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.id },
      select: { name: true, email: true, image: true, role: true, createdAt: true },
    }),
    getNavData(),
    getAddresses(session.id),
    getOrderHistory(session.id, parsePage(params.page), undefined, status),
    getRecentPurchases(session.id),
    getWishlist(session.id),
    // The one count the hero needs that nothing else on the page already
    // fetches — a count rather than the rows, because the strip shows a number
    // and the reviews themselves are read on the products they belong to.
    prisma.review.count({ where: { userId: session.id } }),
  ]);

  if (!user) return null;

  return (
    <ProfileShell nav={nav}>
      <ProfileHero
        user={user}
        stats={{
          // `counts` covers every status regardless of the active filter, so
          // the strip keeps saying how many orders the account has even while
          // the history below it is narrowed to one of them.
          orders: history.totalAll,
          pending: history.counts[OrderStatus.PENDING],
          wishlist: wishlist.length,
          reviews,
        }}
      />

      {/*
        `items-start` so the rail is free to be shorter than the main column —
        without it the grid stretches both to the tallest, and `sticky` inside a
        stretched cell has nothing to scroll against and never pins.
        `minmax(0,1fr)` rather than `1fr` because a grid track's default minimum
        is its content, and one long product name would otherwise push the main
        column wider than its share and squeeze the rail.
      */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6">
          <OrderHistory history={history} status={status} />
          <RecentPurchases purchases={purchases} />
          {/*
            The wishlist is here rather than in the rail, which is where the
            first draft put it. Two things decided it. Product cards at rail
            width truncate their own names ("Aurora Wireles…"), and a rail
            holding all three panels grew taller than the window — so it either
            pinned and hid its own last rows, or needed an inner scrollbar that
            nobody would think to look for. Moving one panel out fixes both:
            the cards get the width they need, and what is left of the rail
            fits on screen and can simply stick.
          */}
          <WishlistSection items={wishlist} />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24">
          <AddressBook addresses={addresses} />
          <SettingsLinks />
        </aside>
      </div>
    </ProfileShell>
  );
}

function OrderHistory({
  history,
  status,
}: {
  history: Awaited<ReturnType<typeof getOrderHistory>>;
  status: ReturnType<typeof parseStatus>;
}) {
  const { orders, page, totalPages, totalAll, counts } = history;

  return (
    <ProfilePanel
      id="orders"
      title="Order history"
      blurb={
        totalAll === 0
          ? "Nothing here yet."
          : `${totalAll} order${totalAll === 1 ? "" : "s"} — tap a ticket for the full receipt.`
      }
      action={
        totalAll > 0 ? { href: "/orders", label: "All orders", icon: "chevron_right" } : undefined
      }
    >
      {totalAll === 0 ? (
        <PanelEmpty
          icon="receipt_long"
          message="Your orders will appear here."
          action={{ href: "/products", label: "Browse products", primary: true }}
        />
      ) : (
        <div className="space-y-4">
          {/* Counts on every tab, so a filter that leads nowhere says so before
              it is pressed — which is also why the old "Showing 3 of 8" line
              under the pager is gone: the tabs already answer it, in the place
              you make the decision rather than after it.

              `params` deliberately carries only the status, so switching filter
              starts at page one rather than landing on whatever page number the
              previous filter happened to be showing. */}
          <FilterPills
            label="Filter orders by status"
            param="status"
            basePath="/profile"
            params={{ status: status ?? "" }}
            options={[
              { value: "", label: "All", count: totalAll },
              ...HISTORY_STATUSES.map((value) => ({
                value,
                label: statusLabel(value),
                count: counts[value],
              })),
            ]}
          />

          {orders.length === 0 ? (
            <PanelEmpty
              icon="filter_alt_off"
              message={`No ${status ? statusLabel(status).toLowerCase() : ""} orders.`}
            />
          ) : (
            <>
              <ul className="space-y-4">
                {orders.map((order) => (
                  <li key={order.id} className="space-y-2">
                    <OrderTicket order={order} />
                    <div className="flex justify-end">
                      <ReorderButton orderId={order.id} />
                    </div>
                  </li>
                ))}
              </ul>

              <Pagination
                currentPage={page}
                totalPages={totalPages}
                className="mt-4"
                hrefFor={(next) => {
                  const query = new URLSearchParams();
                  if (status) query.set("status", status);
                  if (next > 1) query.set("page", String(next));
                  const search = query.toString();
                  return `${search ? `/profile?${search}` : "/profile"}#orders`;
                }}
              />
            </>
          )}
        </div>
      )}
    </ProfilePanel>
  );
}

/**
 * Saved items, as a grid.
 *
 * A preview rather than the whole list — /wishlist is the page for that, and
 * repeating an unbounded grid inside an account page would push everything
 * below it off the screen for anyone who saves things freely.
 */
async function WishlistSection({
  items,
}: {
  items: Awaited<ReturnType<typeof getWishlist>>;
}) {
  const visible = items.slice(0, WISHLIST_PREVIEW);

  // Same batched lookup the wishlist page uses, so a card here shows the rating
  // it shows everywhere else.
  const ratings = await getRatings(visible.map((item) => item.product.id));

  return (
    <ProfilePanel
      id="wishlist"
      title="Wishlist"
      blurb={
        items.length === 0
          ? "Nothing saved yet."
          : `${items.length} saved item${items.length === 1 ? "" : "s"}.`
      }
      action={
        items.length > visible.length
          ? { href: "/wishlist", label: "See all", icon: "chevron_right" }
          : undefined
      }
    >
      {items.length === 0 ? (
        <PanelEmpty
          icon="favorite"
          message="Tap the heart on anything you want to keep an eye on."
          action={{ href: "/products", label: "Browse products" }}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {visible.map((item) => (
            <li key={item.id}>
              <ProductCard
                product={{ ...item.product, rating: ratings.get(item.product.id) ?? null }}
                wishlisted
              />
            </li>
          ))}
        </ul>
      )}
    </ProfilePanel>
  );
}

/**
 * The way through to the settings.
 *
 * Links rather than the forms themselves. Password, notification preferences
 * and closing the account are all Client Components, and putting them inline
 * would hand the whole page's JavaScript to every reader who came to check an
 * order — which is the arrangement this page is built to avoid.
 */
function SettingsLinks() {
  const rows = [
    {
      href: "/profile/settings#password",
      icon: "lock",
      label: "Password",
      blurb: "Change the password you sign in with.",
    },
    {
      href: "/profile/settings#notifications",
      icon: "notifications",
      label: "Notifications",
      blurb: "Choose what we tell you about, and how.",
    },
    {
      href: "/profile/settings#close",
      icon: "delete_forever",
      label: "Close account",
      blurb: "Delete your details and stop signing in.",
      danger: true,
    },
  ];

  return (
    <ProfilePanel
      id="settings"
      title="Account settings"
      blurb="Manage your account preferences."
      flush
    >
      <div className="divide-outline-variant border-outline-variant divide-y border-t">
        {rows.map((row) => (
          <Link
            key={row.href}
            href={row.href}
            className="state-layer flex items-center gap-3 px-6 py-3.5 focus-visible:outline-2 focus-visible:-outline-offset-2"
          >
            <Icon
              name={row.icon}
              size={20}
              className={row.danger ? "text-error shrink-0" : "text-on-surface-variant shrink-0"}
            />
            <span className="min-w-0 flex-1">
              <span
                className={`block text-sm font-medium ${row.danger ? "text-error" : "text-on-surface"}`}
              >
                {row.label}
              </span>
              <span className="text-on-surface-variant block text-xs">{row.blurb}</span>
            </span>
            <Icon name="chevron_right" size={20} className="text-on-surface-variant shrink-0" />
          </Link>
        ))}
      </div>
    </ProfilePanel>
  );
}
