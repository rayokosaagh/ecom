"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

export interface NavLink {
  href: string;
  label: string;
  icon: string;
  /** Rendered only for admins — filtered by the server before this is reached. */
  adminOnly?: boolean;
}

/**
 * A collapsible parent row. It is not itself a destination — clicking it opens
 * the children rather than navigating, which is what keeps the rail short
 * without hiding anything behind a route the admin has to guess at.
 */
export interface NavGroup {
  label: string;
  icon: string;
  children: NavLink[];
}

export type NavItem = NavLink | NavGroup;

function isGroup(item: NavItem): item is NavGroup {
  return "children" in item;
}

export interface SidebarProps {
  items: NavItem[];
  /** Controls the mobile drawer; on desktop the rail is always visible. */
  open: boolean;
  onClose: () => void;
}

/**
 * Gmail-style navigation drawer. Active items get a pill-shaped
 * secondary-container highlight, which is how M3 marks the selected
 * destination in a navigation drawer.
 */
export function Sidebar({ items, open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const baseId = useId();

  // Only the groups the admin has explicitly toggled live here. Everything else
  // falls back to "open if one of my children is the current page", so arriving
  // at /admin/flash-sales from a link shows it already revealed in the rail.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const isActive = (href: string) => {
    // Exact match for roots ("/" would otherwise prefix-match every route,
    // and /dashboard/products must not also light up /dashboard).
    if (href === "/" || href === "/dashboard") return pathname === href;
    return pathname.startsWith(href);
  };

  const linkClass = (active: boolean, nested: boolean) =>
    cn(
      "state-layer flex items-center gap-3 rounded-full px-4",
      "text-sm font-medium",
      "transition-colors duration-200 ease-[var(--ease-standard)]",
      "focus-visible:outline-2 focus-visible:outline-offset-2",
      nested ? "h-12" : "h-14",
      active
        ? "bg-secondary-container text-on-secondary-container"
        : "text-on-surface-variant",
    );

  const renderLink = (item: NavLink, nested: boolean) => {
    const active = isActive(item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onClose}
          aria-current={active ? "page" : undefined}
          className={linkClass(active, nested)}
        >
          <Icon name={item.icon} size={nested ? 20 : 24} filled={active} />
          {item.label}
        </Link>
      </li>
    );
  };

  return (
    <>
      {/* Scrim — mobile only, closes the drawer on tap. */}
      <div
        onClick={onClose}
        aria-hidden
        className={cn(
          "bg-scrim/32 fixed inset-0 z-40 transition-opacity duration-300 lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <nav
        aria-label="Main"
        className={cn(
          "bg-surface-container-low fixed inset-y-0 left-0 z-50 flex w-[280px] shrink-0 flex-col p-3",
          "transition-transform duration-300 ease-[var(--ease-emphasized)]",
          "lg:static lg:z-auto lg:translate-x-0 lg:rounded-r-2xl",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 px-4">
          <Icon name="storefront" size={24} className="text-primary" filled />
          <span className="text-on-surface text-xl">Ecom</span>
        </div>

        {/* Scrolls rather than overflowing once a couple of groups are open. */}
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {items.map((item, i) => {
            if (!isGroup(item)) return renderLink(item, false);

            const hasActiveChild = item.children.some((c) => isActive(c.href));
            const expanded = toggled[item.label] ?? hasActiveChild;
            const panelId = `${baseId}-${i}`;

            return (
              <li key={item.label}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() =>
                    setToggled((prev) => ({ ...prev, [item.label]: !expanded }))
                  }
                  className={cn(linkClass(false, false), "w-full")}
                >
                  <Icon name={item.icon} size={24} filled={hasActiveChild} />
                  <span className="flex-1 text-left">{item.label}</span>
                  <Icon
                    name="expand_more"
                    size={20}
                    className={cn(
                      "transition-transform duration-200 ease-[var(--ease-standard)]",
                      expanded && "rotate-180",
                    )}
                  />
                </button>

                <ul id={panelId} hidden={!expanded} className="mt-1 space-y-1 pl-4">
                  {item.children.map((child) => renderLink(child, true))}
                </ul>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
