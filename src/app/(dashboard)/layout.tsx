import type { ReactNode } from "react";

import { DashboardShell } from "@/components/nav/DashboardShell";
import { Footer } from "@/components/layout/Footer";
import type { NavItem } from "@/components/nav/Sidebar";
import { requireUser } from "@/lib/auth/dal";
import { Role } from "@/generated/prisma/enums";

/**
 * Grouped so the rail stays roughly a screen tall. A group is a disclosure, not
 * a destination — there is no /admin/sales-and-such index page behind it.
 */
const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/dashboard", label: "Overview", icon: "dashboard" },
  {
    label: "Catalogue",
    icon: "inventory_2",
    children: [
      { href: "/dashboard/products", label: "Products", icon: "inventory_2" },
      // Beside Products rather than under Orders: what is in stock is a fact
      // about the catalogue, and the page is reached from "I need to restock",
      // not from "what did we sell".
      { href: "/admin/inventory", label: "Inventory", icon: "inventory", adminOnly: true },
      { href: "/admin/brands", label: "Brands", icon: "sell", adminOnly: true },
      { href: "/admin/specs", label: "Spec labels", icon: "table_rows", adminOnly: true },
    ],
  },
  { href: "/admin/orders", label: "Orders", icon: "receipt_long", adminOnly: true },
  {
    label: "Sales",
    icon: "sell",
    children: [
      // Three different things, deliberately together: a Sale is a product's own
      // price being lower than it was; a Flash sale is a *window* during which
      // the prices of chosen products are actually lowered, then put back; a
      // Discount is a code a shopper types at checkout.
      { href: "/admin/sales", label: "Sales", icon: "local_offer", adminOnly: true },
      { href: "/admin/flash-sales", label: "Flash sales", icon: "bolt", adminOnly: true },
      {
        href: "/admin/discounts",
        label: "Discounts",
        icon: "confirmation_number",
        adminOnly: true,
      },
    ],
  },
  {
    label: "Storefront",
    icon: "web",
    children: [
      { href: "/admin/featured", label: "Featured", icon: "stars", adminOnly: true },
      { href: "/admin/banners", label: "Banners", icon: "campaign", adminOnly: true },
      { href: "/admin/reviews", label: "Reviews", icon: "reviews", adminOnly: true },
      { href: "/admin/faqs", label: "FAQ", icon: "help", adminOnly: true },
      { href: "/admin/social", label: "Social links", icon: "share", adminOnly: true },
    ],
  },
  { href: "/dashboard/users", label: "Users", icon: "group", adminOnly: true },
  { href: "/profile", label: "Profile", icon: "account_circle" },
  { href: "/dashboard/settings", label: "Settings", icon: "settings", adminOnly: true },
];

/**
 * Drops destinations the role may not see, then drops any group left empty by
 * that. A group reduced to a single child collapses into a plain link — a
 * customer gets "Products", not a "Catalogue" disclosure holding one row.
 */
function visibleTo(items: NavItem[], isAdmin: boolean): NavItem[] {
  return items.flatMap<NavItem>((item) => {
    if (!("children" in item)) return !item.adminOnly || isAdmin ? [item] : [];

    const children = item.children.filter((c) => !c.adminOnly || isAdmin);
    if (children.length === 0) return [];
    if (children.length === 1) return [children[0]];
    return [{ ...item, children }];
  });
}

/**
 * Layout-level auth check. Note this is a convenience, not the boundary — the
 * Next.js docs are explicit that layouts do not re-render on every navigation,
 * so each page still calls its own `requireUser()` / `requireAdmin()`.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  const items = visibleTo(NAV_ITEMS, user.role === Role.ADMIN);

  return (
    <DashboardShell
      user={user}
      items={items}
      title="Dashboard"
      footer={<Footer variant="minimal" className="mx-4 sm:mx-6" />}
    >
      {children}
    </DashboardShell>
  );
}
