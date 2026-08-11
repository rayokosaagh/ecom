import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DM_Serif_Display, Roboto } from "next/font/google";
import "./globals.css";

import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { CompareDock } from "@/components/products/CompareDock";
import { BackToTop } from "@/components/ui/BackToTop";
import { THEME_COOKIE, isTheme } from "@/lib/theme";

// Google Sans is proprietary and is not served by Google Fonts. Roboto is the
// published fallback and what Google's own web apps degrade to.
const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  display: "swap",
});

// Display serif for accent words in headlines — the contrast against Roboto is
// what makes the hero type read as designed rather than defaulted.
const dmSerif = DM_Serif_Display({
  variable: "--font-serif-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Ecom",
    template: "%s · Ecom",
  },
  description: "Ecom storefront and admin dashboard.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Render the stored preference straight into the markup, so the first paint
  // is already correct — no blocking inline script, no flash. A visitor who has
  // never touched the toggle has no cookie, and gets no attribute: that is what
  // leaves the prefers-color-scheme rules in globals.css in charge, so their
  // OS setting still decides. See `NO_PREFERENCE`.
  const stored = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isTheme(stored) ? stored : null;

  return (
    <html
      lang="en"
      className={`${roboto.variable} ${dmSerif.variable} h-full`}
      {...(theme ? { "data-theme": theme } : {})}
      // With no stored choice the server has to guess light while the client
      // can read the real OS setting, so the two legitimately disagree for one
      // render. `useSyncExternalStore` corrects it on hydration.
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <ThemeProvider initialTheme={theme}>
          {children}
          {/* The selection is made on the catalogue and read on /compare, so
              the dock lives above both. It renders nothing until something is
              selected. */}
          <CompareDock />
          {/* Every route, rather than each long page opting in — and it renders
              nothing until there is something to scroll back from. */}
          <BackToTop />
        </ThemeProvider>
      </body>
    </html>
  );
}
