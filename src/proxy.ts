import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

// Edge-safe instance: `authConfig` has no Prisma adapter and no Credentials
// provider, so nothing here pulls Node-only APIs into the edge runtime.
const { auth } = NextAuth(authConfig);

// `/api/search` backs the catalogue typeahead, which guests can use.
// `/compare` is browsing, not account activity — and its whole point is that a
// comparison is a shareable URL, which a login wall would defeat.
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/register",
  "/forbidden",
  "/compare",
  // Password recovery has to be reachable by exactly the people who cannot
  // sign in. Sending these two to /login would make the feature unusable.
  "/forgot-password",
  "/reset-password",
  // Help is exactly the page someone reaches for before they have an account.
  "/faq",
  // A guest fills and reviews a cart without an account; the sign-in wall
  // moves to /checkout, which is where an owner actually becomes necessary.
  "/cart",
  "/api/search",
];

/** Public route trees — these match the prefix and everything beneath it. */
const PUBLIC_PREFIXES = ["/products", "/sale"];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Optimistic auth redirects only.
 *
 * Per the Next.js auth guide, Proxy runs on every request including prefetches,
 * so it reads the session cookie and never touches the database. It is a UX
 * convenience, NOT an authorization boundary — the real checks live in the Data
 * Access Layer (`src/lib/auth/dal.ts`), which every protected page calls.
 */
export default auth((req: NextRequest & { auth: unknown }) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = Boolean(req.auth);
  const isPublic = isPublicRoute(pathname);

  if (!isLoggedIn && !isPublic) {
    const url = new URL("/login", req.nextUrl);
    // Preserve where they were heading so login can send them back.
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Skip static assets and the Auth.js API routes, which must stay reachable.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
