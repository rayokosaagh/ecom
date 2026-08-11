"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
import { markNotificationsSeen } from "@/lib/actions/notifications";
import { categoryIcon } from "@/lib/categories/icons";
import { AnnouncementBar } from "@/components/announcements/AnnouncementBar";
import type { AnnouncementView } from "@/lib/announcements/service";
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
  /** Product picture, when the notice is about something with one. */
  imageUrl?: string | null;
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
  /**
   * Published notices for the strip under the bar.
   *
   * Carried by the bar rather than dropped into each page for the same reason
   * the cart count is: every storefront page already spreads `getNavData()`
   * into this component, so wiring it here is what puts the strip on all of
   * them at once — and, more to the point, means nobody has to remember to add
   * it to the next page. Renders nothing while the list is empty.
   */
  announcements?: AnnouncementView[];
  cartCount?: number;
  /** Everything saved. Announced to a screen reader; never drawn as a badge. */
  wishlistCount?: number;
  /**
   * Saved since the wishlist page was last opened — the number over the heart.
   *
   * The badge is not the total on purpose: a wishlist is a list you built
   * deliberately, so "12" over the heart every day is not information. What is
   * worth a badge is that something joined it, which is a number that goes back
   * to zero once you have looked. The wishlist page passes 0 for itself, since
   * looking at it is the very thing that clears it.
   */
  wishlistNewCount?: number;
  /** Arrived since the bell was last opened. Same reasoning as above. */
  notificationNewCount?: number;
  className?: string;
}

const DEFAULT_ITEMS: NavLink[] = [{ href: "/", label: "Home" }];

/**
 * Brands, as a top-level destination.
 *
 * Not in `items` because it has to render *after* the Products menu and that
 * list renders before it: the catalogue is the primary destination and a nav
 * reading "Home · Brands · Products" puts the main one last.
 *
 * It earns a place in the bar at all because of an asymmetry on the storefront.
 * Categories are reachable from every page through the Products menu, while
 * brands had exactly one prominent entry point — a rail most of the way down
 * the home page — plus a footer link. In a computer shop a large share of
 * people arrive knowing the maker ("a MacBook", "ROG", "Sony"), so the axis
 * with no way in was the one a lot of shoppers were arriving with.
 */
const BRANDS_ITEM: NavLink = { href: "/brands", label: "Brands" };

/**
 * One link in the desktop bar.
 *
 * Module scope, not defined inside `Navbar`: a component declared during render
 * is a new type on every render, so React would unmount and remount it each
 * time — which would throw away the shared `layoutId` and kill the sliding
 * pill this exists to carry.
 */
function TopNavLink({
  item,
  active,
  reduceMotion,
}: {
  item: NavLink;
  active: boolean;
  reduceMotion: boolean;
}) {
  return (
    <Link
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
}

/**
 * Glyphs for the top-level nav links, in the mobile menu only.
 *
 * Keyed by href rather than label, so it survives the wording being changed.
 * Covers the routes this app has; a link added later with no entry renders
 * without one, which is a slightly plainer row and not a broken one — better
 * than guessing an icon for a destination nobody here knows anything about.
 * The desktop bar deliberately stays text-only: at that width the labels are
 * the design, and glyphs beside them would be decoration competing with the
 * icon cluster on the right.
 */
const NAV_ICONS: Record<string, string> = {
  "/": "home",
  "/products": "grid_view",
  "/sale": "sell",
  "/brands": "storefront",
  "/stores": "location_on",
  "/faq": "help",
  "/compare": "compare_arrows",
};

/** One row of the mobile menu. */
function MobileLink({
  href,
  label,
  active,
  onNavigate,
  badge,
  icon,
  indented = false,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate: () => void;
  badge?: number;
  /** Material Symbols ligature. Decorative — the label already says it. */
  icon?: string;
  indented?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-full py-3 text-sm font-medium",
        "transition-colors duration-200",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 active:scale-[0.98]",
        // The indent is the icon's width when there is no icon, so an indented
        // row without one still lines up with the labels of the rows that have
        // one rather than sitting in a third column of its own.
        indented ? "px-4 pl-7" : "px-4",
        active
          ? "bg-secondary-container text-on-secondary-container"
          : "text-on-surface-variant hover:bg-on-surface/[0.06]",
      )}
    >
      {icon && (
        <Icon
          name={icon}
          size={20}
          className={cn("shrink-0", active ? "" : "text-on-surface-variant")}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span className="bg-primary text-on-primary grid min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-xs">
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
  announcements = [],
  cartCount = 0,
  wishlistCount = 0,
  wishlistNewCount = 0,
  notificationNewCount = 0,
  className,
}: NavbarProps) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion() ?? false;

  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState<"avatar" | "bell" | "mobile" | null>(null);
  /**
   * The badge has been spent by opening the panel.
   *
   * Local, so the number disappears on the click rather than on the round trip
   * — the server stamp behind it only has to survive until the next
   * navigation, which reads the real count again.
   */
  const [bellSeen, setBellSeen] = useState(false);
  const [, startTransition] = useTransition();
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
    // The bar survives a navigation — same component, same slot — so the
    // spent-badge flag has to be cleared by hand or a notice arriving on the
    // next page would be silently swallowed by a click made on this one.
    setBellSeen(false);
  }

  // Focus the field as it expands.
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  // Counted on the server over the whole table, not derived from the eight
  // notices below — a badge computed from a truncated list would stop counting
  // at eight and never say so.
  const bellBadge = bellSeen ? 0 : notificationNewCount;

  /**
   * Open or close the bell, spending the badge on the way in.
   *
   * The stamp is fired once — reopening a panel you have already looked at is
   * not new information, and a write per click would be a write per idle
   * fidget.
   */
  const toggleBell = () => {
    const opening = menu !== "bell";
    setMenu(opening ? "bell" : null);

    if (opening && bellBadge > 0) {
      setBellSeen(true);
      startTransition(async () => {
        await markNotificationsSeen();
      });
    }
  };

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
          {items.map((item) => (
            <TopNavLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              reduceMotion={reduceMotion}
            />
          ))}

          <ProductsMenu categories={categories} active={isActive("/products")} />

          {/* After the catalogue, not before it — see `BRANDS_ITEM`. */}
          <TopNavLink
            item={BRANDS_ITEM}
            active={isActive(BRANDS_ITEM.href)}
            reduceMotion={reduceMotion}
          />
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
                bellBadge > 0 ? `Notifications, ${bellBadge} new` : "Notifications"
              }
              aria-haspopup="menu"
              aria-expanded={menu === "bell"}
              onClick={toggleBell}
              className="text-on-surface-variant hover:bg-on-surface/[0.08] relative grid size-10 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
            >
              <Icon name="notifications" size={22} filled={bellBadge > 0} />
              <CountBadge
                count={bellBadge}
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
                  className="bg-surface-container-high shadow-elevation-2 absolute right-0 mt-2 w-[min(24rem,calc(100vw-1.5rem))] origin-top-right overflow-hidden rounded-xl"
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
              // The total is what a screen reader wants — "3 new" with no idea
              // what it is new out of is not a description of a link. The badge
              // shows the news; the label carries both.
              wishlistCount > 0
                ? `Wishlist, ${wishlistCount} saved${
                    wishlistNewCount > 0 ? `, ${wishlistNewCount} new` : ""
                  }`
                : "Wishlist"
            }
            className="text-on-surface-variant hover:bg-on-surface/[0.08] relative hidden size-10 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 sm:grid"
          >
            <Icon name="favorite" size={22} filled={wishlistNewCount > 0} />
            <CountBadge
              count={wishlistNewCount}
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

          {/* Stores */}
          <Link
            href="/stores"
            aria-label="Stores"
            aria-current={isActive("/stores") ? "page" : undefined}
            // The one icon in this cluster that goes somewhere rather than
            // reporting something, so it carries no badge and instead fills in
            // when it is the current page. That is the cluster's only way of
            // saying "you are here" — the sliding pill belongs to the text
            // links on the left, and there is no text here to put it behind.
            //
            // Sitting after the theme toggle rather than at the head of the
            // cluster, which is where it started. The three before the toggle
            // all report a number that belongs to you — unread notices, saved
            // items, things in the basket — and this reports nothing; dropping
            // it into the middle of that run broke it. On this side of the
            // toggle it sits with the divider and the avatar, which are the
            // other two controls that are simply about where you are going.
            className={cn(
              "hover:bg-on-surface/[0.08] relative hidden size-10 place-items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 sm:grid",
              isActive("/stores") ? "text-on-surface" : "text-on-surface-variant",
            )}
          >
            <Icon name="location_on" size={22} filled={isActive("/stores")} />
          </Link>

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
                  icon={NAV_ICONS[item.href]}
                  active={isActive(item.href)}
                  onNavigate={close}
                />
              ))}

              <MobileLink
                href="/products"
                label="All products"
                icon="grid_view"
                active={isActive("/products")}
                onNavigate={close}
              />

              {/* Beside "All products" rather than below the category list: the
                  two are the same kind of thing — a way into the whole
                  catalogue — and separating them would bury the one a
                  brand-first shopper is looking for under every category. */}
              <MobileLink
                href={BRANDS_ITEM.href}
                label={BRANDS_ITEM.label}
                icon={NAV_ICONS[BRANDS_ITEM.href]}
                active={isActive(BRANDS_ITEM.href)}
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
                      // The same glyph the desktop menu gives this shelf, from
                      // the same function — the two menus are one catalogue and
                      // should not disagree about what a category looks like.
                      icon={categoryIcon(category.name)}
                      active={false}
                      onNavigate={close}
                      indented
                    />
                  ))}
                </div>
              )}

              <div className="border-outline-variant mt-2 space-y-1 border-t pt-2">
                {/* This group mirrors the bar's icon cluster, and Stores is
                    part of it now — but that icon is `sm:grid`, so on a phone
                    this row is the only way to reach the page at all. */}
                <MobileLink
                  href="/stores"
                  label="Stores"
                  icon={NAV_ICONS["/stores"]}
                  active={isActive("/stores")}
                  onNavigate={close}
                />
                <MobileLink
                  href="/wishlist"
                  label="Wishlist"
                  icon="favorite"
                  badge={wishlistNewCount > 0 ? wishlistNewCount : undefined}
                  active={isActive("/wishlist")}
                  onNavigate={close}
                />
                {user && (
                  <MobileLink
                    href="/orders"
                    label="Orders"
                    icon="receipt_long"
                    active={isActive("/orders")}
                    onNavigate={close}
                  />
                )}
                <MobileLink
                  href="/cart"
                  label="Cart"
                  icon="shopping_cart"
                  badge={cartCount > 0 ? cartCount : undefined}
                  active={isActive("/cart")}
                  onNavigate={close}
                />
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Last inside the header, so it sits under the bar *and* under the
          mobile menu when that is open — the menu stays attached to the
          buttons that opened it rather than having a coloured band wedged
          between them. Inside the header rather than after it because the
          header is `sticky`: a notice worth putting on every page is worth
          keeping on screen, and one that scrolls away is one most visitors
          never see. */}
      <AnnouncementBar items={announcements} />
    </header>
  );
}
