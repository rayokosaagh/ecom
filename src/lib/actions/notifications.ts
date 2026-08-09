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
