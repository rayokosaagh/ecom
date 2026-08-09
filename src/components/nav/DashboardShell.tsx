"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { Sidebar, type NavItem } from "./Sidebar";
import { TopAppBar } from "@/components/ui/TopAppBar";
import { UserMenu } from "./UserMenu";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { SessionUser } from "@/lib/auth/dal";

/**
 * Client shell that owns the mobile drawer state. The nav items are resolved on
 * the server and passed in already filtered by role, so no admin destination is
 * ever shipped to a non-admin's browser.
 */
export function DashboardShell({
  user,
  items,
  title,
  children,
  footer,
}: {
  user: SessionUser;
  items: NavItem[];
  title: string;
  children: ReactNode;
  /** Rendered below the main area — a server component passed in as a slot. */
  footer?: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="bg-surface-container-low flex min-h-dvh">
      <Sidebar items={items} open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopAppBar
          title={title}
          onMenuClick={() => setNavOpen((v) => !v)}
          actions={
            <>
              <ThemeToggle />
              <UserMenu user={user} />
            </>
          }
          className="bg-surface-container-low"
        />

        <div className="bg-surface flex flex-1 flex-col rounded-tl-2xl">
          <main className="flex-1 p-4 sm:p-6">{children}</main>
          {footer}
        </div>
      </div>
    </div>
  );
}
