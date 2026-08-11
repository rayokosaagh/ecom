import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma/enums";

/**
 * The Data Access Layer. Every server component, server action and route
 * handler goes through these helpers rather than reading the session directly,
 * so authorization lives in exactly one place.
 *
 * `proxy.ts` only does an optimistic cookie check for redirect UX — it is not
 * an authorization boundary. These functions are.
 */

export type SessionUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: Role;
};

/** Cached per request, so repeated calls in one render cost a single lookup. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? "",
    image: session.user.image ?? null,
    role: session.user.role,
  };
});

/** Redirects to /login when signed out. Use in any protected page or action. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * The admin check itself, with no opinion about what to do when it fails.
 *
 * Re-reads the role from the database rather than trusting the JWT: a token
 * issued before a demotion would still claim ADMIN until it expires, so
 * privileged routes must not rely on the token's copy.
 *
 * Separate from `requireAdmin` because a route handler cannot use a redirect as
 * its refusal — an export endpoint answering a denied request with 307 to an
 * HTML page hands the caller a login form named `orders.csv`. Handlers want a
 * status code, pages want a redirect, and both want the same check.
 */
export async function verifiedAdmin(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  return fresh?.role === Role.ADMIN ? { ...user, role: Role.ADMIN } : null;
}

/** Admin gate for pages and server actions. Redirects rather than returning. */
export async function requireAdmin(): Promise<SessionUser> {
  await requireUser();

  const admin = await verifiedAdmin();
  // `forbidden()` would be the natural fit, but it is still gated behind the
  // experimental `authInterrupts` flag, so redirect to a real page instead.
  if (!admin) redirect("/forbidden");

  return admin;
}

/** Non-throwing variant for conditionally rendering admin-only UI. */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === Role.ADMIN;
}
