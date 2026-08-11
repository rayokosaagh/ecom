"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/dal";

/**
 * Mark one notification read.
 *
 * Scoped by `userId` in the where clause, so passing someone else's
 * notification id updates nothing rather than leaking or mutating it.
 *
 * Takes an id rather than a FormData because the panel now calls it while
 * navigating to the notice's target — a form submit would race the router.
 */
export async function markNotificationRead(id: string): Promise<void> {
  const user = await requireUser();
  if (!id) return;

  await prisma.notification.updateMany({
    where: { id, userId: user.id },
    data: { read: true },
  });

  revalidatePath("/", "layout");
}

/**
 * Record that the bell has been opened, which empties the badge.
 *
 * Deliberately *not* a bulk mark-read: a glance at the panel is not the same as
 * having dealt with eight things, and treating it as one would grey out every
 * row the instant it appeared — throwing away the only cue that says which of
 * them you have not opened yet. See `User.notificationsSeenAt`.
 *
 * No `revalidatePath`, unlike its neighbours here. Nothing on the page changes
 * except a badge the panel has already hidden locally, so a layout-wide
 * revalidation would re-run every server component on the page to arrive at the
 * pixels that are already on screen. The stamp is read fresh by the next
 * navigation, which is when it next matters.
 */
export async function markNotificationsSeen(): Promise<void> {
  const user = await requireUser();

  await prisma.user.update({
    where: { id: user.id },
    data: { notificationsSeenAt: new Date() },
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser();

  await prisma.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });

  revalidatePath("/", "layout");
}

/**
 * Remove one notice from the list.
 *
 * Dismissing is a different gesture from reading: a notice you have seen and
 * are finished with should leave, where marking it read only greys it out.
 */
export async function dismissNotification(id: string): Promise<void> {
  const user = await requireUser();
  if (!id) return;

  await prisma.notification.deleteMany({ where: { id, userId: user.id } });

  revalidatePath("/", "layout");
}

/**
 * Empty the list.
 *
 * A delete rather than a bulk mark-read: "clear all" means the panel is empty
 * afterwards, and leaving eight greyed-out rows behind would read as the
 * button having quietly failed.
 */
export async function clearAllNotifications(): Promise<void> {
  const user = await requireUser();

  await prisma.notification.deleteMany({ where: { userId: user.id } });

  revalidatePath("/", "layout");
}
