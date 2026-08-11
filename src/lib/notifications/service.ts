import "server-only";

import { prisma } from "@/lib/prisma";
import { NotificationType, Role } from "@/generated/prisma/enums";

export type NewNotification = {
  type: NotificationType;
  title: string;
  description: string;
  href?: string;
  /**
   * Picture of whatever this is about, when there is one.
   *
   * Optional and expected to be absent about half the time — a password change
   * has nothing to show — so the panel treats the type icon as the base case
   * and this as the upgrade, rather than leaving a hole where an image failed
   * to be found.
   */
  imageUrl?: string | null;
};

/**
 * Which preference column governs each kind of notice.
 *
 * ACCOUNT is deliberately absent, and so has no switch: those are things like a
 * password having been changed or a role having moved, which a customer does
 * not get to opt out of being told. A security notice nobody may decline is the
 * point of a security notice.
 */
const PREFERENCE: Partial<Record<NotificationType, "notifyOrders" | "notifyStock" | "notifyNews">> = {
  [NotificationType.ORDER]: "notifyOrders",
  [NotificationType.STOCK]: "notifyStock",
  [NotificationType.SYSTEM]: "notifyNews",
};

/**
 * Raise a notification for one user, if they want that kind.
 *
 * Checked here rather than at each call site: there are a dozen places that
 * raise a notice, and a preference honoured by eleven of them is not a
 * preference. Returns null when the notice was declined, which callers ignore —
 * none of them does anything with the row.
 */
export async function notifyUser(userId: string, input: NewNotification) {
  const column = PREFERENCE[input.type];

  if (column) {
    // All three read at once and indexed here, rather than a computed `select`
    // key — Prisma types a dynamic key as the union of every column, which
    // defeats the point of asking for one.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notifyOrders: true, notifyStock: true, notifyNews: true },
    });
    if (user && !user[column]) return null;
  }

  return prisma.notification.create({ data: { userId, ...input } });
}

/**
 * Raise the same notification for every administrator.
 *
 * Used for events admins need to know about — a new sign-up, an order, a
 * product selling out. Written as one createMany so a store with several
 * admins still costs a single insert.
 */
export async function notifyAdmins(input: NewNotification) {
  const admins = await prisma.user.findMany({
    where: { role: Role.ADMIN },
    select: { id: true },
  });
  if (admins.length === 0) return { count: 0 };

  return prisma.notification.createMany({
    data: admins.map((admin) => ({ userId: admin.id, ...input })),
  });
}

export const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  ORDER: "shopping_bag",
  STOCK: "inventory_2",
  ACCOUNT: "person_add",
  SYSTEM: "info",
};

/**
 * Newest first, capped — the bell panel is not a full inbox — plus the number
 * the badge shows.
 *
 * `newCount` is what has arrived since the panel was last opened, and is
 * counted over the whole table rather than over `items`: the list is cut at
 * `take`, so counting the page would quietly cap the badge at 8 and call it
 * the truth. A null `seenAt` is an account that has never opened the panel, for
 * which everything is new.
 *
 * Note this is not the unread count. Unread is a property of a notice you have
 * not acted on and survives being glanced at; new is a property of the batch,
 * and is spent by looking. The row styling still follows `read`.
 */
export async function getNotifications(
  userId: string,
  seenAt: Date | null,
  take = 8,
) {
  const [items, newCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.notification.count({
      where: { userId, ...(seenAt ? { createdAt: { gt: seenAt } } : {}) },
    }),
  ]);

  return { items, newCount };
}

/** "2m ago" / "3h ago" / "12 Mar" — compact enough for the dropdown. */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}
