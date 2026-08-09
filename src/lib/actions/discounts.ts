"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";
import { parseDiscount } from "@/lib/discounts/validation";

export type DiscountActionState = {
  message?: string;
  success?: string;
  errors?: Record<string, string>;
};

function revalidateDiscountViews() {
  revalidatePath("/admin/discounts");
  // A code changing can change what a cart is worth.
  revalidatePath("/cart");
  revalidatePath("/checkout");
}

/**
 * Create or update a code.
 *
 * One action for both, keyed on whether an id came along, because the two
 * differ only in the `where` — and splitting them would mean maintaining the
 * same field mapping twice.
 */
export async function saveDiscount(
  _prev: DiscountActionState,
  formData: FormData,
): Promise<DiscountActionState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const parsed = parseDiscount(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  // The code is unique, and a clash here is an ordinary mistake rather than an
  // exceptional one — so it is caught and reported on the field.
  const clash = await prisma.discountCode.findUnique({
    where: { code: parsed.data.code },
    select: { id: true },
  });
  if (clash && clash.id !== id) {
    return { errors: { code: "That code already exists" } };
  }

  if (id) {
    // `redemptions` is deliberately absent: it is a record of what happened,
    // and editing a code must not rewrite how many times it has been used.
    await prisma.discountCode.update({ where: { id }, data: parsed.data });
  } else {
    await prisma.discountCode.create({ data: parsed.data });
  }

  revalidateDiscountViews();
  return { success: id ? "Code updated." : `${parsed.data.code} created.` };
}

/**
 * Switch a code on or off.
 *
 * The off switch rather than deletion, because past orders point at it and a
 * withdrawn code should still be explicable months later.
 */
export async function setDiscountActive(
  id: string,
  active: boolean,
): Promise<DiscountActionState> {
  await requireAdmin();

  const updated = await prisma.discountCode.updateMany({
    where: { id },
    data: { active },
  });
  if (updated.count === 0) return { message: "That code no longer exists." };

  revalidateDiscountViews();
  return { success: active ? "Code switched on." : "Code switched off." };
}

/**
 * Delete a code outright.
 *
 * Only worth offering for one nobody has used. Orders keep their own snapshot
 * of the label and the money taken off, so an old receipt still reads
 * correctly — but the redemption history would be gone, and that is worth
 * refusing rather than silently discarding.
 */
export async function deleteDiscount(id: string): Promise<DiscountActionState> {
  await requireAdmin();

  const used = await prisma.order.count({ where: { discountCodeId: id } });
  if (used > 0) {
    return {
      message: `That code has been used ${used} time${used === 1 ? "" : "s"} — switch it off instead.`,
    };
  }

  await prisma.discountCode.deleteMany({ where: { id } });
  revalidateDiscountViews();
  return { success: "Code deleted." };
}
