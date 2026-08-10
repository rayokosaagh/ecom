import type { ReactNode } from "react";
import Link from "next/link";

import { Navbar } from "@/components/nav/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Icon } from "@/components/ui/Icon";
import type { NavbarProps } from "@/components/nav/Navbar";

/**
 * The storefront chrome the account pages share.
 *
 * Four routes now sit under /profile, and repeating the navbar, the footer and
 * the page frame in each is how they drift apart. Not a `layout.tsx`, because
 * each of these pages fetches its own `getNavData()` alongside the data it
 * actually needs — a layout would have to fetch it separately, and layouts do
 * not re-render on navigation, so a cart count in the bar would go stale
 * exactly as somebody moved between these pages.
 */
export function ProfileShell({
  nav,
  children,
  /** Shown above the heading on the sub-pages; omitted on /profile itself. */
  back,
  width = "max-w-6xl",
}: {
  nav: NavbarProps;
  children: ReactNode;
  back?: { href: string; label: string };
  /**
   * Wide enough for the profile's two columns — a main column plus a 21rem rail
   * with a gap needs more than the 5xl this used to be, which left the rail
   * narrower than the product cards inside it. The sub-pages pass a much
   * narrower value: they are single forms, and a form field stretched across a
   * desktop is harder to read, not easier.
   */
  width?: string;
}) {
  return (
    <div className="bg-surface-container-low flex min-h-dvh flex-col">
      <Navbar {...nav} />

      <main className={`mx-auto w-full ${width} space-y-8 px-4 py-10 sm:px-6`}>
        {back && (
          <Link
            href={back.href}
            className="text-on-surface-variant hover:text-on-surface -ml-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Icon name="arrow_back" size={18} />
            {back.label}
          </Link>
        )}

        {children}
      </main>

      <Footer />
    </div>
  );
}
