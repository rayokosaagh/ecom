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
 * Admin gate. Re-reads the role from the database rather than trusting the
 * JWT: a token issued before a demotion would still claim ADMIN until it
 * expires, so privileged routes must not rely on the token's copy.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();

  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  // `forbidden()` would be the natural fit, but it is still gated behind the
  // experimental `authInterrupts` flag, so redirect to a real page instead.
  if (fresh?.role !== Role.ADMIN) redirect("/forbidden");

  return { ...user, role: Role.ADMIN };
}

/** Non-throwing variant for conditionally rendering admin-only UI. */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === Role.ADMIN;
}
