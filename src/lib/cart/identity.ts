import "server-only";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/dal";
import { claimGuestCart } from "@/lib/cart/merge";
import {
  clearCartToken,
  newCartToken,
  readCartToken,
  writeCartToken,
} from "@/lib/cart/cookie";

/**
 * Which cart a request belongs to.
 *
 * A cart is owned by an account once there is one, and by a browser before
 * that. Both cases resolve here so no caller has to care which it is dealing
 * with — and so the rule cannot drift between the six actions that need it.
 */

/**
 * The current cart's id, creating one if needed.
 *
 * Write path only: this both creates rows and sets a cookie, so it must be
 * called from a Server Action or Route Handler.
 */
export async function getOrCreateCartId(): Promise<string> {
  const user = await getCurrentUser();
  const token = await readCartToken();

  if (user) {
    // Belt and braces. The sign-in event already claims the guest cart; this
    // catches the case where a session outlives that event — an existing JWT
    // restored in a browser that has since shopped as a guest.
    if (token) {
      const claimed = await claimGuestCart(token, user.id);
      await clearCartToken();
      if (claimed) return claimed;
    }

    const existing = await prisma.cart.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await prisma.cart.create({
      data: { userId: user.id },
      select: { id: true },
    });
    return created.id;
  }

  if (token) {
    const existing = await prisma.cart.findUnique({
      where: { token },
      select: { id: true },
    });
    // A token whose cart has since been claimed or pruned falls through and
    // gets a fresh one rather than erroring.
    if (existing) return existing.id;
  }

  const fresh = newCartToken();
  const created = await prisma.cart.create({
    data: { token: fresh },
    select: { id: true },
  });
  await writeCartToken(fresh);

  return created.id;
}

/**
 * The current cart's id, or null when there is nothing to read.
 *
 * Used by every read path, so that merely looking at a page never creates a
 * cart row — a crawler hitting the storefront should not leave one behind for
 * every request. Writes nothing, which is also what makes it safe to call
 * during a render.
 */
export async function findCartId(): Promise<string | null> {
  const user = await getCurrentUser();

  if (user) {
    const cart = await prisma.cart.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    return cart?.id ?? null;
  }

  const token = await readCartToken();
  if (!token) return null;

  const cart = await prisma.cart.findUnique({
    where: { token },
    select: { id: true },
  });
  return cart?.id ?? null;
}
