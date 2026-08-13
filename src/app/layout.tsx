import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DM_Mono, DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";

import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { CompareDock } from "@/components/products/CompareDock";
import { BackToTop } from "@/components/ui/BackToTop";
import { THEME_COOKIE, isTheme } from "@/lib/theme";

/*
 * The sans half of the pairing — and it is chosen *because* of the other half.
 *
 * This used to be Roboto, standing in for the proprietary Google Sans. That was
 * a defensible fallback and a poor typeface for the job: every headline on this
 * site is a two-tone construction, half sans and half DM Serif Display italic,
 * and Roboto beside DM Serif reads as two fonts that happened to meet rather
 * than one voice changing register. DM Sans is the serif's own sibling — same
 * release, same skeleton — so "Best *sellers*" now looks like one word set two
 * ways instead of two words set in two families.
 *
 * No `weight` array, because this is the variable cut: one file covering 100 to
 * 1000 rather than four static instances, which is both fewer bytes than the
 * Roboto set it replaces and the only way the scale below can ask for weights
 * between the stops.
 *
 * `axes: ["opsz"]` is the part worth not dropping. next/font ships only the
 * weight axis unless the others are named, and pinning optical size would mean
 * the hero at 72px is drawn with the same letterforms as a 12px badge — tight
 * spacing and sturdy joins that exist for small sizes and read as clumsy when
 * blown up. With the axis present the browser drives it from the font size, so
 * display type thins and tightens on its own and small type stays robust.
 */
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

// Display serif for accent words in headlines — the contrast against DM Sans is
// what makes the hero type read as designed rather than defaulted.
const dmSerif = DM_Serif_Display({
  variable: "--font-serif-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

/*
 * The third member of the same family, and it is here for the same reason the
 * serif is: so that `font-mono` stops being a different app's typeface.
 *
 * Nothing loaded a mono, so every `font-mono` call site fell through to
 * Tailwind's default stack and rendered in whatever the OS happened to have —
 * Consolas on Windows, SF Mono on a Mac, DejaVu on Linux. That is a dozen
 * places where the reader sees a font this site never chose, and all of them
 * are places where the mono sits directly against DM Sans: the order number
 * under its label, a transaction id in a definition list, hex fields beside
 * their swatches. DM Mono is the sibling cut, so those now read as the same
 * voice set monospaced rather than as a fragment pasted in from a terminal.
 *
 * Two static weights rather than the three that exist: 400 for values and 500
 * for the handful that are also links or emphasis. 300 has no call site, and an
 * unused weight is a font file the browser still pays for.
 */
const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
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
      className={`${dmSans.variable} ${dmSerif.variable} ${dmMono.variable} h-full`}
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
