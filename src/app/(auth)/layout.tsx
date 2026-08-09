import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Footer } from "@/components/layout/Footer";

/**
 * Centered, single-column shell for the signed-out routes. Deliberately has no
 * navigation — there is nowhere to go until you are authenticated.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface-container-low relative flex min-h-dvh flex-col">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <Link
          href="/"
          className="mb-8 flex items-center gap-3 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="storefront" size={32} className="text-primary" filled />
          <span className="text-on-surface text-2xl">
            Ecom<span className="text-primary">.</span>
          </span>
        </Link>

        {children}
      </main>

      <Footer variant="minimal" className="mx-auto w-full max-w-md" />
    </div>
  );
}
