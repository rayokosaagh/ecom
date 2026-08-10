"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useDismissable } from "@/lib/hooks/useDismissable";
import { useProductSearch } from "@/lib/hooks/useProductSearch";
import { SearchSuggestions } from "@/components/search/SearchSuggestions";
import { logout } from "@/lib/actions/auth";
import { NotificationPanel } from "./NotificationPanel";
import { ProductsMenu, type MenuCategory } from "./ProductsMenu";

export interface NavLink {
  href: string;
  label: string;
}

export interface NavNotification {
  id: string;
  /** Matches the NotificationType enum; drives the row icon. */
  type: "ORDER" | "STOCK" | "ACCOUNT" | "SYSTEM";
  title: string;
  description: string;
  href?: string | null;
  time: string;
  unread: boolean;
}

export interface NavbarUser {
  name: string | null;
  email: string;
  image?: string | null;
  /** Decides which account-menu rows are shown; absent reads as a customer. */
  role?: "USER" | "ADMIN";
}

export interface NavbarProps {
  items?: NavLink[];
  user?: NavbarUser | null;
  notifications?: NavNotification[];
  /** Categories for the Products hover menu. */
  categories?: MenuCategory[];
  cartCount?: number;
  wishlistCount?: number;
  className?: string;
}

const DEFAULT_ITEMS: NavLink[] = [{ href: "/", label: "Home" }];

/** One row of the mobile menu. */
function MobileLink({
  href,
  label,
  active,
  onNavigate,
  badge,
  indented = false,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate: () => void;
  badge?: number;
  indented?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center justify-between gap-3 rounded-full py-3 text-sm font-medium",
        "transition-colors duration-200",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 active:scale-[0.98]",
        indented ? "px-4 pl-7" : "px-4",
        active
          ? "bg-secondary-container text-on-secondary-container"
          : "text-on-surface-variant hover:bg-on-surface/[0.06]",
      )}
    >
      {label}
      {badge !== undefined && (
        <span className="bg-primary text-on-primary grid min-w-5 place-items-center rounded-full px-1.5 text-xs">
          {badge}
        </span>
      )}
    </Link>
  );
}

/**
 * Count badge that pops when its value changes — the key remount retriggers
 * the spring, so adding to the cart visibly lands in the bar.
 */
function CountBadge({
  count,
  className,
  reduceMotion,
}: {
  count: number;
  className: string;
  reduceMotion: boolean;
}) {
  if (count <= 0) return null;
  return (
    <motion.span
      key={count}
      initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={
        reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 22 }
      }
      className={cn(
        "absolute top-1 right-1 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-medium",
        className,
      )}
    >
      {count > 9 ? "9+" : count}
    </motion.span>
  );
}

/**
 * The account picture, or the initial standing in for one.
 *
 * A plain <img> rather than next/image: the address is whatever the account
 * saved — an uploaded file or a pasted https URL — and next/image would need
 * every host anyone might use listed in `remotePatterns`. `object-cover` on a
 * round frame is what keeps a non-square photo from being squashed into it.
 */
function Avatar({ user, className }: { user: NavbarUser; className: string }) {
  const initial = (user.name ?? user.email).charAt(0).toUpperCase();

  return (
    <span
      className={cn(
        "bg-primary-container text-on-primary-container grid shrink-0 place-items-center",
        "overflow-hidden rounded-full font-medium",
        className,
      )}
    >
      {user.image ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={user.image} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initial}</span>
      )}
    </span>
  );
}

/**
 * What the account menu offers, by role.
 *
 * Everyone gets their account and their orders. The console rows are admin-only
 * — /dashboard now sends a customer to /profile and /dashboard/settings has
 * always bounced them to /forbidden, so offering either was a menu entry that
 * could not do what it said.
 */
function accountMenu(role: NavbarUser["role"]) {
  const mine = [
    { href: "/profile", label: "Profile", icon: "person" },
    { href: "/orders", label: "Orders", icon: "receipt_long" },
  ];

  if (role !== "ADMIN") return mine;

  return [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    ...mine,
    { href: "/dashboard/settings", label: "Settings", icon: "settings" },
  ];
}

/** Shared enter/exit for every floating panel: short fade + scale. */
const PANEL_MOTION = {
  initial: { opacity: 0, scale: 0.95, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: -4 },
  transition: { duration: 0.15, ease: [0.2, 0, 0, 1] as const },
};

export function Navbar({
  items = DEFAULT_ITEMS,
  user,
  notifications = [],
  categories = [],
  cartCount = 0,
  wishlistCount = 0,
  className,
}: NavbarProps) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion() ?? false;

  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState<"avatar" | "bell" | "mobile" | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Suggestions only while the field is expanded, so a collapsed bar never
  // costs a request.
  const search = useProductSearch({ query, enabled: searchOpen });

  const close = () => setMenu(null);

  const avatarRef = useDismissable<HTMLDivElement>(menu === "avatar", close);
  const bellRef = useDismissable<HTMLDivElement>(menu === "bell", close);
  // The hamburger lives in the bar while its panel is a sibling below, so the
  // dismiss handler has to know about it — otherwise tapping to close fires
  // `touchstart` (closing it) and then `click` (reopening it), and the button
  // looks dead.
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const mobileRef = useDismissable<HTMLDivElement>(
    menu === "mobile",
    close,
    hamburgerRef,
  );
  const searchRef = useDismissable<HTMLDivElement>(searchOpen, () => {
    search.dismiss();
    // Only collapse when empty — otherwise a stray click would discard a query.
    if (!query) setSearchOpen(false);
  });

  const inputRef = useRef<HTMLInputElement>(null);

  // Solidify the bar once the page has moved off the top.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll(); // Correct on mount for a restored scroll position.
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close everything on navigation. Done during render rather than in an
  // effect — React's documented way to reset state when a value changes, and
  // it avoids the extra commit an effect would cost.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setMenu(null);
  }

  // Focus the field as it expands.
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  // Read state lives in the database now; the server action revalidates and
  // the new counts arrive with the next render.
  const unreadCount = notifications.filter((n) => n.unread).length;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full",
        "transition-all duration-200 ease-in-out",
        scrolled
          ? "bg-surface/80 border-outline-variant shadow-elevation-1 border-b backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
        className,
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:px-6">
        {/* ---------- Logo ---------- */}
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5 rounded-full pr-2 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span className="bg-primary text-on-primary shadow-none transition-all duration-300 ease-[var(--ease-emphasized)] group-hover:shadow-elevation-2 group-hover:-rotate-6 group-hover:scale-110 group-hover:rounded-full grid size-9 place-items-center rounded-xl">
            <Icon name="storefront" size={20} filled />
          </span>
          <span className="text-on-surface hidden text-lg font-medium tracking-tight sm:inline">
            Ecom<span className="text-primary">.</span>
          </span>
        </Link>

        {/* ---------- Desktop links ---------- */}
        <nav aria-label="Main" className="ml-2 hidden items-center gap-1 md:flex">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-full px-4 py-2 text-sm font-medium",
                  "transition-colors duration-200 ease-in-out",
                  "focus-visible:outline-2 focus-visible:outline-offset-2",
                  "active:scale-95",
                  active
                    ? "text-on-secondary-container"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.06]",
                )}
              >
                {active && (
                  // Shared layoutId slides the pill between links on navigation.
                  <motion.span
                    layoutId="navbar-active-pill"
                    className="bg-secondary-container absolute inset-0 rounded-full"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 380, damping: 32 }
                    }
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </Link>
            );
          })}

          <ProductsMenu categories={categories} active={isActive("/products")} />
        </nav>

        {/* ---------- Right cluster ---------- */}
        <div className="ml-auto flex items-center gap-1">
          {/* Expandable search */}
          <div ref={searchRef} className="relative">
            <motion.div
              animate={{ width: searchOpen ? 240 : 40 }}
              initial={false}
              transition={
                reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.2, 0, 0, 1] }
              }
              className={cn(
                "flex h-10 items-center overflow-hidden rounded-full",
                searchOpen ? "bg-surface-container-high" : "bg-transparent",
                "transition-colors duration-200",
              )}
            >
              <button
                type="button"
                aria-label={searchOpen ? "Submit search" : "Open search"}
                aria-expanded={searchOpen}
                onClick={() => {
                  if (!searchOpen) setSearchOpen(true);
                  else search.submitQuery();
                }}
                className="text-on-surface-variant hover:bg-on-surface/[0.08] grid size-10 shrink-0 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
              >
                <Icon name="search" size={20} />
              </button>

              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                aria-label="Search"
                tabIndex={searchOpen ? 0 : -1}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={search.open}
                aria-controls={search.listboxId}
                aria-activedescendant={search.activeOptionId}
                onKeyDown={(e) => {
                  // Escape closes the suggestions first; a second press clears
                  // the field, so the panel is never dismissed together with
                  // whatever the user typed.
                  if (e.key === "Escape" && !search.open) {
                    setQuery("");
                    setSearchOpen(false);
                  }
                  search.onKeyDown(e);
                }}
                onBlur={() => {
                  if (!query) setSearchOpen(false);
                }}
                className={cn(
                  "text-on-surface placeholder:text-on-surface-variant h-full min-w-0 flex-1 bg-transparent pr-4 text-sm outline-none",
                  !searchOpen && "pointer-events-none opacity-0",
                )}
              />
            </motion.div>

            <AnimatePresence>
              {searchOpen && search.open && (
                <SearchSuggestions
                  id={search.listboxId}
                  results={search.results}
                  loading={search.loading}
                  query={query}
                  activeIndex={search.activeIndex}
                  onSelect={search.goToProduct}
                  onSubmitQuery={search.submitQuery}
                  onHoverIndex={search.setActiveIndex}
                  reduceMotion={reduceMotion}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Notifications */}
          <div ref={bellRef} className="relative">
            <button
              type="button"
              aria-label={
                unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : "Notifications"
              }
              aria-haspopup="menu"
              aria-expanded={menu === "bell"}
              onClick={() => setMenu(menu === "bell" ? null : "bell")}
              className="text-on-surface-variant hover:bg-on-surface/[0.08] relative grid size-10 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
            >
              <Icon name="notifications" size={22} />
              <CountBadge
                count={unreadCount}
                className="bg-error text-on-error"
                reduceMotion={reduceMotion}
              />
            </button>

            <AnimatePresence>
              {menu === "bell" && (
                <motion.div
                  {...PANEL_MOTION}
                  transition={reduceMotion ? { duration: 0 } : PANEL_MOTION.transition}
                  role="menu"
                  aria-label="Notifications"
                  className="bg-surface-container-high shadow-elevation-2 absolute right-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))] origin-top-right overflow-hidden rounded-xl"
                >
                  <NotificationPanel
                    notifications={notifications}
                    onNavigate={close}
                    reduceMotion={Boolean(reduceMotion)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Wishlist */}
          <Link
            href="/wishlist"
            aria-label={
              wishlistCount > 0 ? `Wishlist, ${wishlistCount} items` : "Wishlist"
            }
            className="text-on-surface-variant hover:bg-on-surface/[0.08] relative hidden size-10 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 sm:grid"
          >
            <Icon name="favorite" size={22} />
            <CountBadge
              count={wishlistCount}
              className="bg-error text-on-error"
              reduceMotion={reduceMotion}
            />
          </Link>

          {/* Cart */}
          <Link
            href="/cart"
            aria-label={cartCount > 0 ? `Cart, ${cartCount} items` : "Cart"}
            className="text-on-surface-variant hover:bg-on-surface/[0.08] relative grid size-10 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
          >
            <Icon name="shopping_cart" size={22} />
            <CountBadge
              count={cartCount}
              className="bg-primary text-on-primary"
              reduceMotion={reduceMotion}
            />
          </Link>

          <ThemeToggle />

          {/* Divider */}
          <span aria-hidden className="bg-outline-variant mx-1 hidden h-6 w-px sm:block" />

          {/* Avatar */}
          {user ? (
            <div ref={avatarRef} className="relative">
              <button
                type="button"
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={menu === "avatar"}
                onClick={() => setMenu(menu === "avatar" ? null : "avatar")}
                className="hover:bg-on-surface/[0.08] flex items-center gap-1 rounded-full py-1 pr-1 pl-1 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
              >
                <Avatar user={user} className="size-8 text-xs" />
                <motion.span
                  animate={{ rotate: menu === "avatar" ? 180 : 0 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
                  className="text-on-surface-variant grid place-items-center"
                >
                  <Icon name="expand_more" size={18} />
                </motion.span>
              </button>

              <AnimatePresence>
                {menu === "avatar" && (
                  <motion.div
                    {...PANEL_MOTION}
                    transition={reduceMotion ? { duration: 0 } : PANEL_MOTION.transition}
                    role="menu"
                    aria-label="Account"
                    className="bg-surface-container-high shadow-elevation-2 absolute right-0 mt-2 w-64 origin-top-right overflow-hidden rounded-xl"
                  >
                    <div className="border-outline-variant flex items-center gap-3 border-b px-4 py-3">
                      <Avatar user={user} className="size-10 text-sm" />
                      <div className="min-w-0">
                        <p className="text-on-surface truncate text-sm font-medium">
                          {user.name ?? "Account"}
                        </p>
                        <p className="text-on-surface-variant truncate text-xs">
                          {user.email}
                        </p>
                      </div>
                    </div>

                    <div className="p-1">
                      {accountMenu(user.role).map((entry) => (
                        <Link
                          key={entry.href}
                          href={entry.href}
                          role="menuitem"
                          onClick={close}
                          className="text-on-surface hover:bg-on-surface/[0.08] flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2"
                        >
                          <Icon name={entry.icon} size={20} className="text-on-surface-variant" />
                          {entry.label}
                        </Link>
                      ))}

                      <form action={logout}>
                        <button
                          type="submit"
                          role="menuitem"
                          className="text-error hover:bg-error/[0.08] flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2"
                        >
                          <Icon name="logout" size={20} />
                          Logout
                        </button>
                      </form>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Link
              href="/login"
              className="bg-primary text-on-primary inline-flex h-10 items-center rounded-full px-5 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
            >
              Sign in
            </Link>
          )}

          {/* Hamburger */}
          <button
            ref={hamburgerRef}
            type="button"
            aria-label={menu === "mobile" ? "Close menu" : "Open menu"}
            aria-expanded={menu === "mobile"}
            aria-controls="navbar-mobile-menu"
            onClick={() => setMenu(menu === "mobile" ? null : "mobile")}
            className="text-on-surface-variant hover:bg-on-surface/[0.08] ml-1 grid size-10 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 md:hidden"
          >
            {/* Three bars that rotate and collapse into an X. */}
            <span className="relative block h-4 w-5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="absolute left-0 block h-0.5 w-5 rounded-full bg-current"
                  initial={false}
                  animate={
                    menu === "mobile"
                      ? [
                          { top: 7, rotate: 45, opacity: 1 },
                          { top: 7, rotate: 0, opacity: 0 },
                          { top: 7, rotate: -45, opacity: 1 },
                        ][i]
                      : [
                          { top: 1, rotate: 0, opacity: 1 },
                          { top: 7, rotate: 0, opacity: 1 },
                          { top: 13, rotate: 0, opacity: 1 },
                        ][i]
                  }
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
                />
              ))}
            </span>
          </button>
        </div>
      </div>

      {/* ---------- Mobile menu ---------- */}
      <AnimatePresence>
        {menu === "mobile" && (
          <motion.div
            ref={mobileRef}
            id="navbar-mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              reduceMotion ? { duration: 0 } : { duration: 0.25, ease: [0.2, 0, 0, 1] }
            }
            className="bg-surface border-outline-variant overflow-hidden border-b md:hidden"
          >
            {/* Everything the bar cannot show at this width. The catalogue
                lives in `ProductsMenu`, which is `md:flex` only, and the
                wishlist icon is `sm:grid` only — so on a phone neither had
                anywhere to be reached from. */}
            <nav aria-label="Mobile" className="space-y-1 px-3 py-3">
              {items.map((item) => (
                <MobileLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={isActive(item.href)}
                  onNavigate={close}
                />
              ))}

              <MobileLink
                href="/products"
                label="All products"
                active={isActive("/products")}
                onNavigate={close}
              />

              {categories.length > 0 && (
                <div className="pt-1">
                  <p className="text-on-surface-variant px-4 pb-1 text-xs tracking-[0.18em] uppercase">
                    Shop by category
                  </p>
                  {categories.map((category) => (
                    <MobileLink
                      key={category.slug}
                      href={`/products?category=${category.slug}`}
                      label={category.name}
                      active={false}
                      onNavigate={close}
                      indented
                    />
                  ))}
                </div>
              )}

              <div className="border-outline-variant mt-2 space-y-1 border-t pt-2">
                <MobileLink
                  href="/wishlist"
                  label="Wishlist"
                  badge={wishlistCount > 0 ? wishlistCount : undefined}
                  active={isActive("/wishlist")}
                  onNavigate={close}
                />
                {user && (
                  <MobileLink
                    href="/orders"
                    label="Orders"
                    active={isActive("/orders")}
                    onNavigate={close}
                  />
                )}
                <MobileLink
                  href="/cart"
                  label="Cart"
                  badge={cartCount > 0 ? cartCount : undefined}
                  active={isActive("/cart")}
                  onNavigate={close}
                />
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

    </header>
  );
}
