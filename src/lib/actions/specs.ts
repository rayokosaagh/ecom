"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";
import { parseSpecDefinition } from "@/lib/specs/validation";

export type SpecFormState = {
  errors?: Record<string, string>;
  message?: string;
};

const LIST_PATH = "/admin/specs";

/**
 * Spec labels drive both the product table and the catalogue facets, so a
 * change to one touches the whole storefront.
 */
function revalidateSpecViews() {
  revalidatePath("/products", "layout");
  revalidatePath(LIST_PATH);
}

export async function createSpecDefinition(
  _prev: SpecFormState,
  formData: FormData,
): Promise<SpecFormState> {
  // Every mutation re-checks the role against the database, not the JWT.
  await requireAdmin();

  const parsed = parseSpecDefinition(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const clash = await prisma.specDefinition.findFirst({
    where: { OR: [{ key: parsed.data.key }, { label: parsed.data.label }] },
    select: { label: true },
  });
  if (clash) {
    return {
      errors: { label: `“${clash.label}” already covers that label` },
    };
  }

  const last = await prisma.specDefinition.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.specDefinition.create({
    data: { ...parsed.data, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });

  revalidateSpecViews();
  redirect(LIST_PATH);
}

export async function updateSpecDefinition(
  id: string,
  _prev: SpecFormState,
  formData: FormData,
): Promise<SpecFormState> {
  await requireAdmin();

  const parsed = parseSpecDefinition(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const current = await prisma.specDefinition.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!current) return { message: "That spec label no longer exists." };

  const clash = await prisma.specDefinition.findFirst({
    where: {
      id: { not: id },
      OR: [{ key: parsed.data.key }, { label: parsed.data.label }],
    },
    select: { label: true },
  });
  if (clash) {
    return { errors: { label: `“${clash.label}” already covers that label` } };
  }

  // sortOrder is owned by the list's move buttons, so it is left alone here.
  await prisma.specDefinition.update({ where: { id }, data: parsed.data });

  revalidateSpecViews();
  redirect(LIST_PATH);
}

/**
 * Delete a spec label.
 *
 * `ProductSpec` cascades, so this removes the row from every product that had
 * it — which is the honest reading of deleting a label, unlike a brand, where
 * the products carry on without it.
 */
export async function deleteSpecDefinition(id: string): Promise<void> {
  await requireAdmin();
  if (!id) return;

  // Tolerate an already-deleted row: two admins on the same list should not
  // produce an unhandled error for whoever clicks second.
  await prisma.specDefinition.deleteMany({ where: { id } });

  revalidateSpecViews();
}

/** Flip whether a label is offered as a filter, straight from the list. */
export async function toggleSpecFilterable(id: string): Promise<void> {
  await requireAdmin();

  const definition = await prisma.specDefinition.findUnique({
    where: { id },
    select: { filterable: true },
  });
  if (!definition) return;

  await prisma.specDefinition.update({
    where: { id },
    data: { filterable: !definition.filterable },
  });

  revalidateSpecViews();
}

/**
 * Persist a new display order.
 *
 * Takes the full list of ids in their new order and rewrites `sortOrder` to
 * match the array index, in one transaction so the storefront can never read a
 * half-applied ordering. Ids that no longer exist are skipped rather than
 * failing the batch.
 */
export async function reorderSpecDefinitions(ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;

  const known = await prisma.specDefinition.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const knownIds = new Set(known.map((definition) => definition.id));

  await prisma.$transaction(
    ids
      .filter((id) => knownIds.has(id))
      .map((id, index) =>
        prisma.specDefinition.update({ where: { id }, data: { sortOrder: index } }),
      ),
  );

  revalidateSpecViews();
}
