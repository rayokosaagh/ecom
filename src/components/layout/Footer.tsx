import { cache } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { getCurrentUser } from "@/lib/auth/dal";
import { countPublishedFaqs } from "@/lib/faqs/service";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/cn";
import { Role } from "@/generated/prisma/enums";

/** Cached per request so several footers on a page cost one query. */
const getFooterCategories = cache(async () =>
  prisma.category.findMany({
    orderBy: { name: "asc" },
    take: 6,
    select: { name: true, slug: true },
  }),
);

/**
 * Store policies shown above the link columns.
 *
 * PLACEHOLDER COPY — these describe policies the app does not implement.
 * Edit them to match what the store actually offers before going live.
 */
const PROMISES = [
  { icon: "local_shipping", title: "Free shipping", copy: "On orders over $50" },
  { icon: "assignment_return", title: "30-day returns", copy: "No questions asked" },
  { icon: "lock", title: "Secure checkout", copy: "Encrypted end to end" },
  { icon: "support_agent", title: "Real support", copy: "Answers from humans" },
];

/**
 * Site footer.
 *
 * `minimal` is for the app shell and signed-out card layouts, where a full
 * marketing footer would overwhelm the page; `full` is for the storefront.
 *
 * Every link points at a route that exists — no placeholder hrefs.
 */
export async function Footer({
  variant = "full",
  className,
}: {
  variant?: "full" | "minimal";
  className?: string;
}) {
  const year = new Date().getFullYear();

  if (variant === "minimal") {
    return (
      <footer
        className={cn(
          "border-outline-variant text-on-surface-variant border-t px-4 py-6",
          "flex flex-wrap items-center justify-between gap-3 text-xs",
          className,
        )}
      >
        <p>© {year} Ecom. All rights reserved.</p>
        <nav aria-label="Footer" className="flex items-center gap-4">
          <Link href="/products" className="rounded-sm hover:underline focus-visible:outline-2">
            Products
          </Link>
          <Link href="/orders" className="rounded-sm hover:underline focus-visible:outline-2">
            Orders
          </Link>
        </nav>
      </footer>
    );
  }

  const [categories, user, faqCount] = await Promise.all([
    getFooterCategories(),
    getCurrentUser(),
    // A count rather than the rows: the footer only needs to know whether the
    // page it is advertising has anything on it.
    countPublishedFaqs(),
  ]);

  return (
    <footer className={cn("bg-surface-container mt-auto", className)}>
      {/* Store promises */}
      <div className="border-outline-variant mx-auto max-w-7xl border-b px-4 py-10 sm:px-6">
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map((promise) => (
            <li key={promise.title} className="flex items-start gap-3">
              <span className="bg-primary-container text-on-primary-container grid size-10 shrink-0 place-items-center rounded-full">
                <Icon name={promise.icon} size={20} />
              </span>
              <span>
                <span className="text-on-surface block text-sm font-medium">
                  {promise.title}
                </span>
                <span className="text-on-surface-variant block text-xs">
                  {promise.copy}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Help.

          A band of its own rather than a link in a column, because that is what
          it was and nobody would find it: help is neither shopping nor account,
          so it had no column it belonged in, and the bottom bar is the row
          people's eyes skip.

          Rendered only when something is published — a prominent "read the
          FAQ" leading to an empty page is worse than no invitation at all. */}
      {faqCount > 0 && (
        <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6">
          <div className="bg-primary-container text-on-primary-container flex flex-wrap items-center justify-between gap-5 rounded-3xl p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <Icon name="help" size={28} filled className="mt-0.5 shrink-0" />
              <div>
                <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
                  Questions before you buy?
                </h2>
                <p className="mt-1 max-w-prose text-sm opacity-80">
                  Delivery, returns, cancelling an order and everything about
                  your account — answered in one place.
                </p>
              </div>
            </div>

            <Link
              href="/faq"
              className="bg-primary text-on-primary state-layer inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-6 text-sm font-medium transition-all duration-200 hover:shadow-elevation-2 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
            >
              Read the FAQ
              <Icon name="arrow_forward" size={18} />
            </Link>
          </div>
        </div>
      )}

      {/* Link columns */}
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span className="bg-primary text-on-primary grid size-9 place-items-center rounded-xl">
              <Icon name="storefront" size={20} filled />
            </span>
            <span className="text-on-surface text-lg font-medium tracking-tight">
              Ecom<span className="text-primary">.</span>
            </span>
          </Link>

          <p className="text-on-surface-variant mt-4 max-w-xs text-sm leading-relaxed">
            Precision gear for{" "}
            <span className="font-display italic">the modern desk.</span> Audio,
            peripherals and lighting, engineered to last.
          </p>

          <div className="mt-5 flex items-center gap-2">
            <span className="text-on-surface-variant text-xs">Theme</span>
            <ThemeToggle />
          </div>
        </div>

        <nav aria-labelledby="footer-shop">
          <h2
            id="footer-shop"
            className="text-on-surface text-xs font-medium tracking-[0.15em] uppercase"
          >
            Shop
          </h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <Link
                href="/products"
                className="text-on-surface-variant hover:text-primary rounded-sm transition-colors duration-200 focus-visible:outline-2"
              >
                All products
              </Link>
            </li>
            {/* Sits with the catalogue links rather than in the nav bar: the
                sale page is otherwise only reachable from the home shelf's
                "View all", and a shopper who has scrolled past it has nowhere
                to go back to. */}
            <li>
              <Link
                href="/sale"
                className="text-on-surface-variant hover:text-primary rounded-sm transition-colors duration-200 focus-visible:outline-2"
              >
                On sale
              </Link>
            </li>
            {/* Here for the same reason "On sale" is: the brand listing is
                otherwise reachable only from the home page's strip, so a
                shopper deeper in the site has no way back to it. */}
            <li>
              <Link
                href="/brands"
                className="text-on-surface-variant hover:text-primary rounded-sm transition-colors duration-200 focus-visible:outline-2"
              >
                Brands
              </Link>
            </li>
            {categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/products?category=${category.slug}`}
                  className="text-on-surface-variant hover:text-primary rounded-sm transition-colors duration-200 focus-visible:outline-2"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-account">
          <h2
            id="footer-account"
            className="text-on-surface text-xs font-medium tracking-[0.15em] uppercase"
          >
            Account
          </h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {user ? (
              <>
                <li>
                  <Link
                    href="/profile"
                    className="text-on-surface-variant hover:text-primary rounded-sm transition-colors duration-200 focus-visible:outline-2"
                  >
                    Your profile
                  </Link>
                </li>
                <li>
                  <Link
                    href="/orders"
                    className="text-on-surface-variant hover:text-primary rounded-sm transition-colors duration-200 focus-visible:outline-2"
                  >
                    Orders
                  </Link>
                </li>
                <li>
                  <Link
                    href="/wishlist"
                    className="text-on-surface-variant hover:text-primary rounded-sm transition-colors duration-200 focus-visible:outline-2"
                  >
                    Wishlist
                  </Link>
                </li>
                <li>
                  <Link
                    href="/cart"
                    className="text-on-surface-variant hover:text-primary rounded-sm transition-colors duration-200 focus-visible:outline-2"
                  >
                    Cart
                  </Link>
                </li>
                {user.role === Role.ADMIN && (
                  <li>
                    <Link
                      href="/dashboard"
                      className="text-on-surface-variant hover:text-primary rounded-sm transition-colors duration-200 focus-visible:outline-2"
                    >
                      Dashboard
                    </Link>
                  </li>
                )}
              </>
            ) : (
              <>
                <li>
                  <Link
                    href="/login"
                    className="text-on-surface-variant hover:text-primary rounded-sm transition-colors duration-200 focus-visible:outline-2"
                  >
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link
                    href="/register"
                    className="text-on-surface-variant hover:text-primary rounded-sm transition-colors duration-200 focus-visible:outline-2"
                  >
                    Create an account
                  </Link>
                </li>
                <li>
                  <Link
                    href="/cart"
                    className="text-on-surface-variant hover:text-primary rounded-sm transition-colors duration-200 focus-visible:outline-2"
                  >
                    Cart
                  </Link>
                </li>
              </>
            )}
          </ul>
        </nav>

        <div>
          <h2 className="text-on-surface text-xs font-medium tracking-[0.15em] uppercase">
            Stay in touch
          </h2>
          <p className="text-on-surface-variant mt-4 text-sm leading-relaxed">
            New arrivals land regularly. Check the catalogue for what&apos;s in
            stock right now.
          </p>
          <Link
            href="/products?sort=newest"
            className="border-outline text-primary state-layer mt-4 inline-flex h-10 items-center gap-2 rounded-full border px-5 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
          >
            See what&apos;s new
            <Icon name="arrow_forward" size={16} />
          </Link>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-outline-variant border-t">
        <div className="text-on-surface-variant mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs sm:px-6">
          <p>© {year} Ecom. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            <Icon name="lock" size={14} />
            Secure checkout
          </p>
        </div>
      </div>
    </footer>
  );
}
