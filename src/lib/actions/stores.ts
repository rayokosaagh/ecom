"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";
import { parseStoreLocation } from "@/lib/stores/validation";
import { STORE_LOCATIONS_TAG } from "@/lib/stores/service";

export type StoreLocationFormState = {
  errors?: Record<string, string>;
  message?: string;
};

const LIST_PATH = "/admin/stores";

/**
 * Both halves of the change: the rendered pages, and the cached rows behind
 * them.
 *
 * The tag is the one that matters. The storefront read is held across requests
 * (see `lib/stores/service`), so revalidating the *page* alone would rebuild it
 * from the same stale entry and the edit would appear to have been ignored —
 * which is the failure mode any cross-request cache invites if the writer
 * forgets it exists. The tag is why that read can be cached at all.
 *
 * `updateTag` rather than `revalidateTag(tag, "max")`, which is the other half
 * of the same API in Next 16: `revalidateTag` marks the entry stale and serves
 * it anyway while fetching behind it, so the admin who saves a branch and then
 * opens /stores to check their work would be shown the version without it. That
 * is precisely the read-your-own-writes case `updateTag` exists for — it expires
 * the entry outright, and the next request pays for one query. Every caller here
 * is a Server Action, which is the only place `updateTag` may be called from.
 */
function revalidateStoreViews() {
  updateTag(STORE_LOCATIONS_TAG);
  revalidatePath("/stores");
  revalidatePath(LIST_PATH);
}

export async function createStoreLocation(
  _prev: StoreLocationFormState,
  formData: FormData,
): Promise<StoreLocationFormState> {
  // Every mutation re-checks the role against the database, not the JWT.
  await requireAdmin();

  const parsed = parseStoreLocation(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  // Appended to the end rather than inserted at the top: a new branch has no
  // claim on being the first one listed, and the list is orderable.
  const last = await prisma.storeLocation.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.storeLocation.create({
    data: { ...parsed.data, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });

  revalidateStoreViews();
  redirect(LIST_PATH);
}

export async function updateStoreLocation(
  id: string,
  _prev: StoreLocationFormState,
  formData: FormData,
): Promise<StoreLocationFormState> {
  await requireAdmin();

  const parsed = parseStoreLocation(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const existing = await prisma.storeLocation.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return { message: "That store no longer exists." };

  await prisma.storeLocation.update({ where: { id }, data: parsed.data });

  revalidateStoreViews();
  redirect(LIST_PATH);
}

export async function deleteStoreLocation(id: string): Promise<void> {
  await requireAdmin();

  // `deleteMany` rather than `delete`: an id that has already gone should be a
  // no-op, not an error thrown at whoever clicked twice.
  await prisma.storeLocation.deleteMany({ where: { id } });

  revalidateStoreViews();
}

/**
 * Show or hide one branch.
 *
 * Read-then-write rather than a toggle expressed in SQL, so the action knows
 * what it did and can say so — and so a row deleted in another tab reports
 * that instead of silently updating nothing.
 */
export async function toggleStoreLocationPublished(
  id: string,
): Promise<StoreLocationFormState> {
  await requireAdmin();

  const store = await prisma.storeLocation.findUnique({
    where: { id },
    select: { published: true },
  });
  if (!store) return { message: "That store no longer exists." };

  await prisma.storeLocation.update({
    where: { id },
    data: { published: !store.published },
  });

  revalidateStoreViews();
  return {};
}

/**
 * Persist a new order.
 *
 * Ids are filtered against what actually exists before anything is written:
 * the list comes from the browser, and a stale one naming a deleted row would
 * otherwise fail the whole transaction and lose the reorder.
 */
export async function reorderStoreLocations(ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;

  const known = await prisma.storeLocation.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const knownIds = new Set(known.map((store) => store.id));

  await prisma.$transaction(
    ids
      .filter((id) => knownIds.has(id))
      .map((id, index) =>
        prisma.storeLocation.update({ where: { id }, data: { sortOrder: index } }),
      ),
  );

  revalidateStoreViews();
}
