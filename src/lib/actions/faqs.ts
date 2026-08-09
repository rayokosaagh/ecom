"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";
import { parseFaq } from "@/lib/faqs/validation";

export type FaqFormState = {
  errors?: Record<string, string>;
  message?: string;
};

const LIST_PATH = "/admin/faqs";

/** The section renders on the home page, so a change touches both. */
function revalidateFaqViews() {
  revalidatePath("/");
  revalidatePath(LIST_PATH);
}

export async function createFaq(
  _prev: FaqFormState,
  formData: FormData,
): Promise<FaqFormState> {
  // Every mutation re-checks the role against the database, not the JWT.
  await requireAdmin();

  const parsed = parseFaq(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  // Appended to the end rather than inserted at the top: a new question has no
  // claim on being the first one a shopper reads, and the list is orderable.
  const last = await prisma.faq.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.faq.create({
    data: { ...parsed.data, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });

  revalidateFaqViews();
  redirect(LIST_PATH);
}

export async function updateFaq(
  id: string,
  _prev: FaqFormState,
  formData: FormData,
): Promise<FaqFormState> {
  await requireAdmin();

  const parsed = parseFaq(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const existing = await prisma.faq.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return { message: "That question no longer exists." };

  await prisma.faq.update({ where: { id }, data: parsed.data });

  revalidateFaqViews();
  redirect(LIST_PATH);
}

export async function deleteFaq(id: string): Promise<void> {
  await requireAdmin();

  // `deleteMany` rather than `delete`: an id that has already gone should be a
  // no-op, not an error thrown at whoever clicked twice.
  await prisma.faq.deleteMany({ where: { id } });

  revalidateFaqViews();
}

/**
 * Show or hide one entry.
 *
 * Read-then-write rather than a toggle expressed in SQL, so the action knows
 * what it did and can say so — and so a row deleted in another tab reports
 * that instead of silently creating nothing.
 */
export async function toggleFaqPublished(id: string): Promise<FaqFormState> {
  await requireAdmin();

  const faq = await prisma.faq.findUnique({
    where: { id },
    select: { published: true },
  });
  if (!faq) return { message: "That question no longer exists." };

  await prisma.faq.update({
    where: { id },
    data: { published: !faq.published },
  });

  revalidateFaqViews();
  return {};
}

/**
 * Persist a new order.
 *
 * Ids are filtered against what actually exists before anything is written:
 * the list comes from the browser, and a stale one naming a deleted row would
 * otherwise fail the whole transaction and lose the reorder.
 */
export async function reorderFaqs(ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;

  const known = await prisma.faq.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const knownIds = new Set(known.map((faq) => faq.id));

  await prisma.$transaction(
    ids
      .filter((id) => knownIds.has(id))
      .map((id, index) => prisma.faq.update({ where: { id }, data: { sortOrder: index } })),
  );

  revalidateFaqViews();
}
