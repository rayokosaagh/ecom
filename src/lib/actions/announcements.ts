"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";
import { parseAnnouncement } from "@/lib/announcements/validation";
import { ANNOUNCEMENTS_TAG } from "@/lib/announcements/service";

export type AnnouncementFormState = {
  errors?: Record<string, string>;
  message?: string;
};

const LIST_PATH = "/admin/announcements";

/**
 * Both halves of the change: the cached rows, and the admin list.
 *
 * Only the tag is revalidated for the storefront, and there is no
 * `revalidatePath("/")` beside it — the strip renders on *every* page, so there
 * is no list of paths to name. It does not need one: every storefront page is
 * dynamic (each reads the session cookie through `getNavData`), so each one
 * re-renders per request and reads whatever the tag is currently pointing at.
 * The cache entry is the only stale thing that could exist, and this is what
 * clears it.
 *
 * `updateTag` rather than `revalidateTag(tag, "max")`, which would mark the
 * entry stale and keep serving it while it refetched. For a strip that may be
 * announcing that payments are down, "everyone sees it one page-load later" is
 * the wrong trade — and switching a critical notice *off* has exactly the same
 * urgency as switching it on.
 */
function revalidateAnnouncementViews() {
  updateTag(ANNOUNCEMENTS_TAG);
  revalidatePath(LIST_PATH);
}

export async function createAnnouncement(
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  // Every mutation re-checks the role against the database, not the JWT.
  await requireAdmin();

  const parsed = parseAnnouncement(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  // Appended to the end rather than inserted at the top: order here is the
  // order they scroll past in, and the list is reorderable.
  const last = await prisma.announcement.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.announcement.create({
    data: { ...parsed.data, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });

  revalidateAnnouncementViews();
  redirect(LIST_PATH);
}

export async function updateAnnouncement(
  id: string,
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  await requireAdmin();

  const parsed = parseAnnouncement(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const existing = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return { message: "That announcement no longer exists." };

  await prisma.announcement.update({ where: { id }, data: parsed.data });

  revalidateAnnouncementViews();
  redirect(LIST_PATH);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await requireAdmin();

  // `deleteMany` rather than `delete`: an id that has already gone should be a
  // no-op, not an error thrown at whoever clicked twice.
  await prisma.announcement.deleteMany({ where: { id } });

  revalidateAnnouncementViews();
}

/**
 * Show or hide one notice.
 *
 * The most-used control on the screen, and the reason the level lives in a
 * column rather than in the message text: taking a notice down is one click at
 * the moment it stops being true, which is usually the moment somebody is in a
 * hurry.
 */
export async function toggleAnnouncementPublished(
  id: string,
): Promise<AnnouncementFormState> {
  await requireAdmin();

  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: { published: true },
  });
  if (!announcement) return { message: "That announcement no longer exists." };

  await prisma.announcement.update({
    where: { id },
    data: { published: !announcement.published },
  });

  revalidateAnnouncementViews();
  return {};
}

/**
 * Persist a new order.
 *
 * Ids are filtered against what actually exists before anything is written:
 * the list comes from the browser, and a stale one naming a deleted row would
 * otherwise fail the whole transaction and lose the reorder.
 */
export async function reorderAnnouncements(ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;

  const known = await prisma.announcement.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const knownIds = new Set(known.map((row) => row.id));

  await prisma.$transaction(
    ids
      .filter((id) => knownIds.has(id))
      .map((id, index) =>
        prisma.announcement.update({ where: { id }, data: { sortOrder: index } }),
      ),
  );

  revalidateAnnouncementViews();
}
