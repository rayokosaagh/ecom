"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";
import { parseSocialLink } from "@/lib/social/validation";

export type SocialLinkFormState = {
  errors?: Record<string, string>;
  message?: string;
};

const LIST_PATH = "/admin/social";

/** The bar renders on the home page, so a change touches both. */
function revalidateSocialViews() {
  revalidatePath("/");
  revalidatePath(LIST_PATH);
}

export async function createSocialLink(
  _prev: SocialLinkFormState,
  formData: FormData,
): Promise<SocialLinkFormState> {
  // Every mutation re-checks the role against the database, not the JWT.
  await requireAdmin();

  const parsed = parseSocialLink(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  // Appended to the end rather than inserted at the top: a newly added account
  // has no claim on being the first icon in the bar, and the list is orderable.
  const last = await prisma.socialLink.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.socialLink.create({
    data: { ...parsed.data, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });

  revalidateSocialViews();
  redirect(LIST_PATH);
}

export async function updateSocialLink(
  id: string,
  _prev: SocialLinkFormState,
  formData: FormData,
): Promise<SocialLinkFormState> {
  await requireAdmin();

  const parsed = parseSocialLink(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const existing = await prisma.socialLink.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return { message: "That link no longer exists." };

  await prisma.socialLink.update({ where: { id }, data: parsed.data });

  revalidateSocialViews();
  redirect(LIST_PATH);
}

export async function deleteSocialLink(id: string): Promise<void> {
  await requireAdmin();

  // `deleteMany` rather than `delete`: an id that has already gone should be a
  // no-op, not an error thrown at whoever clicked twice.
  await prisma.socialLink.deleteMany({ where: { id } });

  revalidateSocialViews();
}

/**
 * Show or hide one link.
 *
 * Read-then-write rather than a toggle expressed in SQL, so the action knows
 * what it did and can say so — and so a row deleted in another tab reports
 * that instead of silently writing nothing.
 */
export async function toggleSocialLinkPublished(
  id: string,
): Promise<SocialLinkFormState> {
  await requireAdmin();

  const link = await prisma.socialLink.findUnique({
    where: { id },
    select: { published: true },
  });
  if (!link) return { message: "That link no longer exists." };

  await prisma.socialLink.update({
    where: { id },
    data: { published: !link.published },
  });

  revalidateSocialViews();
  return {};
}

/**
 * Persist a new order.
 *
 * Ids are filtered against what actually exists before anything is written:
 * the list comes from the browser, and a stale one naming a deleted row would
 * otherwise fail the whole transaction and lose the reorder.
 */
export async function reorderSocialLinks(ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;

  const known = await prisma.socialLink.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const knownIds = new Set(known.map((link) => link.id));

  await prisma.$transaction(
    ids
      .filter((id) => knownIds.has(id))
      .map((id, index) =>
        prisma.socialLink.update({ where: { id }, data: { sortOrder: index } }),
      ),
  );

  revalidateSocialViews();
}
