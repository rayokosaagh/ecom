import "server-only";

import { prisma } from "@/lib/prisma";
import { NotificationType, Role } from "@/generated/prisma/enums";

export type NewNotification = {
  type: NotificationType;
  title: string;
  description: string;
  href?: string;
};

/** Raise a notification for one user. */
export async function notifyUser(userId: string, input: NewNotification) {
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

/** Newest first, capped — the bell panel is not a full inbox. */
export async function getNotifications(userId: string, take = 8) {
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  return { items, unreadCount };
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
